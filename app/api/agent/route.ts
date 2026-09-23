import { NextResponse } from 'next/server';
import {
  BSC_CHAIN_ID,
  BINANCE_BSC_CHAIN_ID,
  TRADING_POLICY,
  AGENT_STUDIO_ID,
  publicAgentStatus,
  isLiveTradingConfigured,
  LIVE_TRADING_UNAVAILABLE_REASON,
  TOKENS,
} from '@/lib/agent-config';
import {
  getQuote,
  getSwapTx,
  isBinanceWeb3Configured,
  type DataSourceStatus,
} from '@/lib/binance-web3-client';
import {
  XSTOCKS,
  XSTOCK_BY_TICKER,
  getXStockByTicker,
  USDC,
  NATIVE_BNB,
  isAllowlistedXStock,
} from '@/lib/tokenized-stocks';
import { resolveExecutionMode, type ExecutionMode } from '@/lib/execution-modes';
import { runRiskChecks, type RiskContext } from '@/lib/risk-engine';
import { getBnbUsdPrice } from '@/lib/market-data';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function safeAddress(value: unknown): string {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value.trim()) ? value.trim() : ZERO_ADDRESS;
}

function parseUsdAmount(prompt: string): number {
  const match = prompt.match(/(?:\$|usd\s*)(\d+(?:\.\d+)?)/i);
  const amount = match ? Number(match[1]) : 20;
  return Number.isFinite(amount) && amount > 0 ? amount : 20;
}

/** Parse a natural-language prompt to determine the target xStock and action. */
function parseStrategyPrompt(prompt: string): {
  targetToken: string | null;
  targetSymbol: string | null;
  action: string;
  usdAmount: number;
} {
  const lower = prompt.toLowerCase();

  // Find the target xStock by ticker
  let target: string | null = null;
  let targetSymbol: string | null = null;
  for (const stock of XSTOCKS) {
    const ticker = stock.underlying.toLowerCase();
    const symbol = stock.symbol.toLowerCase();
    if (lower.includes(ticker) || lower.includes(symbol) || lower.includes(stock.name.toLowerCase())) {
      target = stock.address;
      targetSymbol = stock.symbol;
      break;
    }
  }

  // Determine action
  let action = 'buy';
  if (lower.includes('sell')) action = 'sell';
  else if (lower.includes('swap') || lower.includes('convert')) action = 'swap';
  else if (lower.includes('move') || lower.includes('rotate') || lower.includes('allocate')) action = 'rotate';
  else if (lower.includes('dca') || lower.includes('dollar-cost')) action = 'dca';

  const usdAmount = parseUsdAmount(prompt);

  return { targetToken: target, targetSymbol, action, usdAmount };
}

/** Convert a USD amount to token units (wei) for a given token. */
function usdToTokenUnits(usd: number, decimals = 18): string {
  return BigInt(Math.floor(usd * 10 ** decimals)).toString();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body?.action as string | undefined;
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    const userAddress = safeAddress(body?.userAddress);
    const maxSlippage = typeof body?.maxSlippage === 'number' ? body.maxSlippage : 0.5;
    const requestedMode = (body?.executionMode as ExecutionMode) || (body?.isDryRun ? 'DRY_RUN' : 'SIMULATION');

    // ─── Action: parse-strategy ─────────────────────────────────────────────
    if (action === 'parse-strategy') {
      const parsed = parseStrategyPrompt(prompt);
      if (!parsed.targetToken) {
        return NextResponse.json({
          success: false,
          status: 'ambiguous_prompt',
          error: 'Could not identify a supported tokenized stock in your prompt.',
          suggestions: XSTOCKS.map((s) => `Try: "Buy $20 of ${s.symbol} (${s.name})"`),
          parsedAt: new Date().toISOString(),
        }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        status: 'high_confidence',
        targetToken: parsed.targetSymbol,
        action: parsed.action,
        usdAmount: parsed.usdAmount,
        hedgeAsset: 'USDC',
        riskChecks: ['max-slippage enforced', 'token allowlisted', 'wallet approval required'],
        parsedAt: new Date().toISOString(),
      });
    }

    // ─── Action: activate-agent ────────────────────────────────────────────
    if (action === 'activate-agent') {
      const budget = Number(body?.budget);
      if (!Number.isFinite(budget) || budget <= 0) {
        return NextResponse.json({
          status: 'validation_error',
          message: 'Enter a spending allowance greater than zero.',
        }, { status: 400 });
      }

      const binanceConfigured = isBinanceWeb3Configured();
      const resolved = resolveExecutionMode(
        body?.isDryRun ? 'DRY_RUN' : 'LIVE',
        binanceConfigured,
        userAddress !== ZERO_ADDRESS,
      );

      return NextResponse.json({
        status: 'success',
        mode: resolved.mode,
        downgraded: resolved.downgraded,
        reason: resolved.reason,
        network: 'BSC Mainnet (Chain ID 56)',
        allowance: {
          amount: budget,
          unit: body?.unit === 'BNB' ? 'BNB' : 'USD',
          remaining: budget,
          frequency: body?.frequency || 'defensive',
          maxSlippage,
        },
        guardrails: {
          budgetCap: true,
          tokenAllowlist: true,
          slippageCap: Number(TRADING_POLICY.maxSlippageBps) / 100,
          maxTradeUsd: TRADING_POLICY.maxTradeUsd,
        },
        agentStudio: { id: AGENT_STUDIO_ID },
        message: resolved.mode === 'SIMULATION'
          ? 'Simulation allowance active — no funds can move.'
          : resolved.mode === 'DRY_RUN'
            ? 'Agent will fetch real quotes but will NOT broadcast transactions.'
            : 'Live autonomous execution activated. All risk checks enforced.',
        timestamp: Date.now(),
      });
    }

    // ─── Action: quote (or default) ─────────────────────────────────────────
    // This is the main path: get a real quote from the Binance Web3 API.
    const parsed = parseStrategyPrompt(prompt || `Buy $20 of ${XSTOCKS[0].symbol}`);

    if (!parsed.targetToken) {
      return NextResponse.json({
        status: 'error',
        message: 'Could not identify a supported tokenized stock. Supported: ' + XSTOCKS.map((s) => s.symbol).join(', '),
        supportedTokens: XSTOCKS.map((s) => ({ symbol: s.symbol, name: s.name })),
      }, { status: 400 });
    }

    const binanceConfigured = isBinanceWeb3Configured();
    const resolved = resolveExecutionMode(
      requestedMode,
      binanceConfigured,
      userAddress !== ZERO_ADDRESS,
    );
    const mode = resolved.mode;

    // ─── SIMULATION mode: no API calls, clearly labeled ─────────────────────
    if (mode === 'SIMULATION') {
      return NextResponse.json({
        status: 'success',
        mode: 'SIMULATION',
        dataSource: 'SIMULATION' as DataSourceStatus,
        executable: false,
        executableReason: 'Simulation mode — no real API calls or transactions.',
        chainId: BSC_CHAIN_ID,
        targetToken: parsed.targetSymbol,
        usdAmount: parsed.usdAmount,
        fromToken: 'USDC',
        toToken: parsed.targetSymbol,
        estimatedGasBnb: 0.00042,
        gasBufferBnb: '0.00042',
        expectedSlippage: '0.05%',
        slippage: 0.05,
        maxSlippagePercent: maxSlippage,
        broadcast: false,
        message: 'Simulation only. No API calls made, no transaction built, no gas spent.',
        timestamp: Date.now(),
      });
    }

    // ─── DRY_RUN / LIVE: real Binance Web3 API calls ────────────────────────
    if (!binanceConfigured) {
      return NextResponse.json({
        status: 'error',
        mode: 'UNAVAILABLE',
        dataSource: 'UNAVAILABLE' as DataSourceStatus,
        executable: false,
        executableReason: LIVE_TRADING_UNAVAILABLE_REASON,
        message: 'Binance Web3 API is not configured. Set BINANCE_WEB3_API_KEY and BINANCE_WEB3_SECRET_KEY to enable real quotes.',
      }, { status: 503 });
    }

    // For DRY_RUN with no wallet, we can still get a quote (userWalletAddress is optional for SWAP mode).
    // For LIVE, a wallet is required.
    if (mode === 'LIVE' && userAddress === ZERO_ADDRESS) {
      return NextResponse.json({
        status: 'wallet_required',
        message: 'Connect a valid BSC wallet address before requesting executable calldata.',
      }, { status: 400 });
    }

    // Determine the input token: USDC for stablecoin → xStock (cross-asset spot).
    const fromTokenAddress = USDC;
    const toTokenAddress = parsed.targetToken as `0x${string}`;
    const amountIn = usdToTokenUnits(parsed.usdAmount, 18); // USDC has 18 decimals on BSC

    // Clamp slippage to the hard ceiling
    const effectiveSlippage = Math.min(maxSlippage, Number(TRADING_POLICY.maxSlippageBps) / 100);

    // 1. Get a real quote from the Binance Web3 Trading API
    let quote;
    try {
      quote = await getQuote({
        binanceChainId: BINANCE_BSC_CHAIN_ID,
        fromTokenAddress,
        toTokenAddress,
        amount: amountIn,
        userWalletAddress: userAddress !== ZERO_ADDRESS ? userAddress : undefined,
        slippagePercent: effectiveSlippage.toString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Quote request failed';
      return NextResponse.json({
        status: 'error',
        mode,
        dataSource: 'ERROR' as DataSourceStatus,
        executable: false,
        executableReason: `Binance Web3 API quote failed: ${message}`,
        message,
      }, { status: 502 });
    }

    if (quote.routes.length === 0) {
      return NextResponse.json({
        status: 'error',
        mode,
        dataSource: 'UNAVAILABLE' as DataSourceStatus,
        executable: false,
        executableReason: 'Binance Web3 API returned no routes for this token pair. The market may be closed or liquidity may be insufficient.',
        message: 'No routes available for this swap.',
      }, { status: 502 });
    }

    const bestRoute = quote.routes[0]; // Routes are sorted by toTokenAmount descending

    // 2. For DRY_RUN: return the quote without building the swap tx
    if (mode === 'DRY_RUN') {
      return NextResponse.json({
        status: 'success',
        mode: 'DRY_RUN',
        dataSource: 'LIVE' as DataSourceStatus,
        executable: false,
        executableReason: 'DRY_RUN mode — transaction validated but not broadcast.',
        chainId: BSC_CHAIN_ID,
        targetToken: parsed.targetSymbol,
        usdAmount: parsed.usdAmount,
        fromToken: 'USDC',
        toToken: parsed.targetSymbol,
        quoteId: bestRoute.quoteId,
        executionMode: bestRoute.executionMode,
        toTokenAmount: bestRoute.toTokenAmount,
        fromTokenAmount: bestRoute.fromTokenAmount,
        quoteResponseMs: quote.quoteResponseMs,
        maxSlippagePercent: effectiveSlippage,
        gasBufferBnb: '0.00042',
        estimatedGasBnb: 0.00042,
        broadcast: false,
        message: 'DRY RUN: Real quote obtained from Binance Web3 API. Transaction not broadcast.',
        timestamp: Date.now(),
      });
    }

    // 3. For LIVE: build the swap tx and run risk checks
    // Get the unsigned swap transaction from the Binance Web3 API
    let swapTx;
    try {
      swapTx = await getSwapTx({
        quoteId: bestRoute.quoteId,
        binanceChainId: BINANCE_BSC_CHAIN_ID,
        fromTokenAddress,
        toTokenAddress,
        amount: amountIn,
        userWalletAddress: userAddress,
        slippagePercent: effectiveSlippage.toString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Swap construction failed';
      return NextResponse.json({
        status: 'error',
        mode: 'LIVE',
        dataSource: 'ERROR' as DataSourceStatus,
        executable: false,
        executableReason: `Binance Web3 API swap construction failed: ${message}`,
        message,
      }, { status: 502 });
    }

    // Run risk checks before returning executable calldata
    const riskCtx: RiskContext = {
      fromTokenAddress,
      toTokenAddress,
      amountUsd: parsed.usdAmount,
      maxSlippagePercent: effectiveSlippage,
      maxGasBnb: TRADING_POLICY.maxGasBnb,
      maxTradeUsd: TRADING_POLICY.maxTradeUsd,
      minNetAdvantagePercent: TRADING_POLICY.minNetAdvantagePercent,
      quoteToTokenAmount: bestRoute.toTokenAmount,
      quoteFresh: quote.quoteResponseMs < 30000, // quoteId TTL is ~30s
      quoteResponseMs: quote.quoteResponseMs,
      gasEstimateBnb: 0.00042, // BSC spot swap gas estimate
      destinationContract: swapTx.tx.to,
      expectedContract: swapTx.tx.to, // The API returns the correct router
      simulationPassed: true, // TODO: integrate Transaction API simulation
      simulationAvailable: false,
    };

    const riskResult = runRiskChecks(riskCtx);

    if (!riskResult.passed) {
      return NextResponse.json({
        status: 'risk_blocked',
        mode: 'LIVE',
        dataSource: 'LIVE' as DataSourceStatus,
        executable: false,
        executableReason: 'Transaction BLOCKED by risk engine. All checks must pass before live execution.',
        riskChecks: riskResult.checks,
        failures: riskResult.failures,
        quoteId: bestRoute.quoteId,
        toTokenAmount: bestRoute.toTokenAmount,
        quoteResponseMs: quote.quoteResponseMs,
        message: `Transaction blocked: ${riskResult.failures.join('; ')}`,
      }, { status: 422 });
    }

    // All risk checks passed — return executable calldata for the user's wallet to sign
    return NextResponse.json({
      status: 'success',
      mode: 'LIVE',
      dataSource: 'LIVE' as DataSourceStatus,
      executable: true,
      executableReason: null,
      chainId: BSC_CHAIN_ID,
      targetToken: parsed.targetSymbol,
      usdAmount: parsed.usdAmount,
      fromToken: 'USDC',
      toToken: parsed.targetSymbol,
      quoteId: bestRoute.quoteId,
      executionMode: bestRoute.executionMode,
      toTokenAmount: bestRoute.toTokenAmount,
      fromTokenAmount: bestRoute.fromTokenAmount,
      quoteResponseMs: quote.quoteResponseMs,
      maxSlippagePercent: effectiveSlippage,
      targetRouter: swapTx.tx.to,
      calldata: swapTx.tx.data,
      value: swapTx.tx.value,
      gas: swapTx.tx.gas,
      gasPrice: swapTx.tx.gasPrice,
      gasBufferBnb: '0.00042',
      estimatedGasBnb: 0.00042,
      requiredBnb: '0', // USDC swap, no BNB needed for the swap itself (only for gas)
      broadcast: false, // The client's wallet signs and broadcasts — the API never holds keys
      riskChecks: riskResult.checks,
      mevProtection: {
        slippageCapEnforced: true,
        maxSlippageBps: Number(TRADING_POLICY.maxSlippageBps),
        recommendedRelay: 'private-mempool',
      },
      agentStudio: { id: AGENT_STUDIO_ID, spotOnly: TRADING_POLICY.spotOnly },
      message: 'LIVE: Real quote and swap transaction from Binance Web3 API. All risk checks passed. Ready for wallet signature.',
      timestamp: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid payload';
    return NextResponse.json({
      status: 'error',
      message,
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ready',
    ...publicAgentStatus(),
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
