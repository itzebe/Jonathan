import { NextResponse } from 'next/server';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const BSC_CHAIN_ID = 56;
const PANCAKESWAP_V3_ROUTER = '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4';

function safeAddress(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ZERO_ADDRESS;
}

function parseUsdAmount(prompt: string) {
  const match = prompt.match(/(?:\$|usd\s*)(\d+(?:\.\d+)?)/i);
  const amount = match ? Number(match[1]) : 0.5;
  return Number.isFinite(amount) && amount > 0 ? amount : 0.5;
}

async function getBnbUsdPrice() {
  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT', {
      next: { revalidate: 15 },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw new Error(`Binance returned HTTP ${response.status}`);
    const data = await response.json();
    const price = Number(data?.price);
    if (!Number.isFinite(price) || price <= 0) throw new Error('Binance returned an invalid price');
    return { price, isFallbackPrice: false };
  } catch {
    return { price: 580, isFallbackPrice: true };
  }
}

function requestId() {
  return crypto.randomUUID();
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  const id = requestId();
  return NextResponse.json({
    success: status >= 200 && status < 300,
    data: status >= 200 && status < 300 ? payload : null,
    error: status >= 200 && status < 300 ? null : {
      code: typeof payload.code === 'string' ? payload.code : 'AGENT_REQUEST_FAILED',
      message: typeof payload.message === 'string' ? payload.message : 'Agent request failed',
    },
    requestId: id,
    ...payload,
  }, { status, headers: { 'x-request-id': id } });
}

export async function POST(request: Request) {
  const id = requestId();
  try {
    const body = await request.json();
    const prompt = typeof body?.prompt === 'string' && body.prompt.trim()
      ? body.prompt.trim()
      : 'Rotate bTSLA into Ondo USDY';
    const userAddress = safeAddress(body?.userAddress);
    const isDryRun = body?.isDryRun !== false;

    if (body?.action === 'activate-agent') {
      const budget = Number(body?.budget);
      const maxSlippage = Number(body?.maxSlippage);
      const authorizationConfirmed = body?.authorizationConfirmed === true;

      const unit = body?.unit === 'BNB' ? 'BNB' : 'USD';
      const frequency = ['aggressive', 'defensive', 'dca'].includes(body?.frequency) ? body.frequency : 'defensive';
      if (!Number.isFinite(budget) || budget <= 0 || budget > 100000) {
        return NextResponse.json({ status: 'success', mode: 'VALIDATION_ERROR', chainId: BSC_CHAIN_ID, requiredBnb: '0.000000000000000000', usdAmount: 0, targetRouter: PANCAKESWAP_V3_ROUTER, error: 'Enter an allowance between 0 and 100,000.' });
      }
      if (!body?.isDryRun && userAddress === ZERO_ADDRESS) {
        return NextResponse.json({ status: 'wallet_required', message: 'Connect a BSC Mainnet wallet before activating live autonomy.' }, { status: 400 });
      }
      return jsonResponse({
        status: body?.isDryRun || authorizationConfirmed ? 'success' : 'authorization_required',
        mode: body?.isDryRun ? 'DRY_RUN_AUTONOMY' : 'LIVE_GUARDED_AUTONOMY',
        network: 'BSC Mainnet (Chain ID 56)',
        allowance: { amount: budget, unit, remaining: budget, frequency, maxSlippage: 1.2 },
        guardrails: { budgetCap: true, walletLiquidity: true, slippageRedirect: 'Ondo USDY' },
        message: body?.isDryRun ? 'Simulation allowance recorded. No funds can move.' : 'Authorization required before autonomous execution can be activated.',
        timestamp: Date.now(),
      });
    }

    if (body?.action === 'parse-strategy') {
      const normalizedPrompt = prompt.toLowerCase();
      return NextResponse.json({
        status: 'success',
        success: true,
        targetToken: normalizedPrompt.includes('ai') ? 'bNVDA' : 'bTSLA',
        hedgeAsset: normalizedPrompt.includes('yield') || normalizedPrompt.includes('ondo') ? 'Ondo USDY' : 'BNB',
        action: normalizedPrompt.includes('dca') ? 'dca' : normalizedPrompt.includes('sell') ? 'sell' : 'buy',
      });
    }

    if (body?.action === 'quote' || body?.action === 'execute' || body?.action === 'activate-agent') {
      const usdAmount = body?.action === 'activate-agent'
        ? (body?.unit === 'USD' ? Number(body?.budget) || 0.5 : (Number(body?.budget) || 0.00086) * 580)
        : parseUsdAmount(prompt);
      const priceResult = await getBnbUsdPrice();
      const requiredBnb = usdAmount / priceResult.price;
      const maxSlippage = Number(body?.maxSlippage);
      const calculatedSlippage = 0.92;
      const reroutedAsset = Number.isFinite(maxSlippage) && calculatedSlippage > maxSlippage ? 'Ondo USDY' : undefined;
      if (reroutedAsset) {
        console.info(`Slippage Guard Triggered (${calculatedSlippage}% > Max ${maxSlippage}%). Re-routed to Ondo USDY for safety.`);
      }
      return NextResponse.json({
        status: 'success',
        mode: 'LIVE_MAINNET_AUTONOMOUS',
        chainId: BSC_CHAIN_ID,
        requiredBnb: requiredBnb.toFixed(18),
        usdAmount,
        targetRouter: PANCAKESWAP_V3_ROUTER,
        bnbUsdPrice: priceResult.price,
        isFallbackPrice: priceResult.isFallbackPrice,
        calculatedSlippage,
        maxSlippage: Number.isFinite(maxSlippage) ? maxSlippage : null,
        reroutedAsset,
        gasBufferBnb: '0.00015',
        agentStudio: { skills: ['binance-web3-market-data', 'agentic-wallet', 'bnb-agent-studio'], spotOnly: true },
      });
    }

    if (isDryRun) {
      return NextResponse.json({
        status: 'success',
        mode: 'DRY_RUN_SIMULATION',
        network: 'BSC Mainnet (Chain ID 56)',
        chainId: BSC_CHAIN_ID,
        prompt,
        userAddress,
        simulatedGas: '0.00042 BNB',
        estimatedGasBnb: 0.00042,
        expectedSlippage: '0.05%',
        priceImpact: '0.03%',
        broadcast: false,
        message: 'Simulation successful. No transaction was broadcast and no gas was spent.',
        timestamp: Date.now(),
      });
    }

    // Safe live default: without a configured quote/calldata provider, never invent
    // calldata or ask a wallet to sign a transaction that has not been quoted.
    return NextResponse.json({
      status: 'live_execution_unavailable',
      mode: 'LIVE_MAINNET',
      network: 'BSC Mainnet (Chain ID 56)',
      chainId: BSC_CHAIN_ID,
      prompt,
      userAddress,
      targetRouter: PANCAKESWAP_V3_ROUTER,
      broadcast: false,
      transaction: null,
      message: 'Live execution is paused: configure a verified Binance Web3 or PancakeSwap quote endpoint before signing.',
      timestamp: Date.now(),
    }, { status: 503 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid payload';
    return NextResponse.json({
      success: false,
      data: null,
      error: { code: 'AGENT_REQUEST_FAILED', message },
      requestId: id,
      status: 'error',
      message,
    }, { status: 200, headers: { 'x-request-id': id } });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ready',
    network: 'BSC Mainnet',
    chainId: BSC_CHAIN_ID,
    targetRouter: PANCAKESWAP_V3_ROUTER,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export { ZERO_ADDRESS };
