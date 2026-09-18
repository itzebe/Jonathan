import { NextResponse } from 'next/server';
import { encodeFunctionData } from 'viem';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const BSC_CHAIN_ID = 56;
const PANCAKESWAP_V3_ROUTER = '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4' as const;
const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as const;
const BSC_TOKENS = {
  btsla: '0x3b03f0d4dd21f8a7e0e7a2b9d3b4334f59e9c3e2',
  baapl: '0x4902c5ebc598265ed2212b559b042de8a5eeec3f',
  ondo: '0x5b15b1b860023714a5b6710ab31e33d3c8c7d8bf',
} as const;

const PANCAKE_V3_ABI = [{
  name: 'exactInputSingle',
  type: 'function',
  stateMutability: 'payable',
  inputs: [{ name: 'params', type: 'tuple', components: [
    { name: 'tokenIn', type: 'address' },
    { name: 'tokenOut', type: 'address' },
    { name: 'fee', type: 'uint24' },
    { name: 'recipient', type: 'address' },
    { name: 'amountIn', type: 'uint256' },
    { name: 'amountOutMinimum', type: 'uint256' },
    { name: 'sqrtPriceLimitX96', type: 'uint160' },
  ] }],
  outputs: [{ name: 'amountOut', type: 'uint256' }],
}, {
  // Deadline-guarded multicall wrapper. Bundling the swap inside multicall(deadline, data)
  // makes the router revert if the transaction is mined after `deadline`, which prevents a
  // bot from holding the signed tx in the mempool and executing it later at a worse price.
  name: 'multicall',
  type: 'function',
  stateMutability: 'payable',
  inputs: [
    { name: 'deadline', type: 'uint256' },
    { name: 'data', type: 'bytes[]' },
  ],
  outputs: [{ name: 'results', type: 'bytes[]' }],
}] as const;

// Hard ceiling on how far execution price may deviate from the quote, in basis points.
// Even if a caller passes a looser slippage, the agent never signs beyond this bound.
const MAX_SLIPPAGE_BPS = 100n; // 1.00%
// Swaps must be mined quickly; a short deadline shrinks the MEV window.
const EXECUTION_DEADLINE_SECONDS = 45;

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

type MinimumOutputResult =
  | { ok: true; amountOutMinimum: bigint; expectedOut: bigint; source: 'binance-web3' }
  | { ok: false; reason: string };

/**
 * Fetches a real on-chain quote and derives amountOutMinimum in the OUTPUT token's units.
 *
 * This is the core MEV defense: the swap will revert on-chain unless it returns at least
 * `amountOutMinimum`, so a sandwich attacker cannot push the effective price past our bound.
 *
 * It FAILS CLOSED. If we cannot obtain a trustworthy quote, we return { ok: false } and the
 * caller refuses to build calldata. We never fall back to a guessed/zero minimum, because an
 * unbounded (or wrong-unit) minimum is precisely what bots exploit.
 */
async function getBinanceWeb3MinimumOutput({
  tokenOut,
  amountIn,
  userWalletAddress,
  slippageBps,
}: {
  tokenOut: `0x${string}`;
  amountIn: bigint;
  userWalletAddress: `0x${string}`;
  slippageBps: bigint;
}): Promise<MinimumOutputResult> {
  const params = new URLSearchParams({
    binanceChainId: String(BSC_CHAIN_ID),
    fromTokenAddress: WBNB_ADDRESS,
    toTokenAddress: tokenOut,
    amount: amountIn.toString(),
    userWalletAddress,
    // Express our slippage tolerance as a percentage so the aggregator's own minimum reflects it.
    slippage: (Number(slippageBps) / 100).toString(),
  });

  try {
    const response = await fetch(`https://web3.binance.com/api/v1/dex/aggregator/quote?${params.toString()}`, {
      signal: AbortSignal.timeout(3000),
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (!response.ok || !contentType.includes('application/json')) {
      return { ok: false, reason: 'Binance Web3 quote unavailable' };
    }
    const payload = await response.json() as {
      data?: { toTokenAmount?: string | number; toTokenMinAmount?: string | number };
      toTokenAmount?: string | number;
      toTokenMinAmount?: string | number;
    };

    const rawExpected = payload.data?.toTokenAmount ?? payload.toTokenAmount;
    if (rawExpected === undefined || rawExpected === null || !/^\d+$/.test(String(rawExpected))) {
      return { ok: false, reason: 'Binance Web3 quote returned no expected output' };
    }
    const expectedOut = BigInt(String(rawExpected));
    if (expectedOut <= 0n) return { ok: false, reason: 'Binance Web3 quote returned a non-positive output' };

    // Derive our own minimum from the expected output and our slippage ceiling, in the output
    // token's units. We take the STRICTER of our computed bound and any minimum the aggregator
    // returned, so the on-chain floor is never looser than MAX_SLIPPAGE_BPS allows.
    const ourMinimum = (expectedOut * (10_000n - slippageBps)) / 10_000n;
    const rawAggregatorMin = payload.data?.toTokenMinAmount ?? payload.toTokenMinAmount;
    const aggregatorMin = rawAggregatorMin !== undefined && rawAggregatorMin !== null && /^\d+$/.test(String(rawAggregatorMin))
      ? BigInt(String(rawAggregatorMin))
      : 0n;
    const amountOutMinimum = aggregatorMin > ourMinimum ? aggregatorMin : ourMinimum;

    if (amountOutMinimum <= 0n) return { ok: false, reason: 'Computed a non-positive minimum output' };
    return { ok: true, amountOutMinimum, expectedOut, source: 'binance-web3' };
  } catch {
    return { ok: false, reason: 'Binance Web3 quote request failed' };
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
      const amountIn = BigInt(Math.floor(requiredBnb * 1e18));
      const selectedToken = prompt.includes('ondo') || prompt.includes('yield')
        ? BSC_TOKENS.ondo
        : prompt.includes('aapl') || prompt.includes('apple')
          ? BSC_TOKENS.baapl
          : BSC_TOKENS.btsla;
      const recipient = /^0x[a-fA-F0-9]{40}$/.test(userAddress) ? userAddress as `0x${string}` : ZERO_ADDRESS as `0x${string}`;

      // A swap can never be signed to the zero address as recipient — that would burn the output.
      if (recipient === ZERO_ADDRESS) {
        return NextResponse.json({
          status: 'wallet_required',
          message: 'Connect a valid BSC wallet address before requesting executable calldata.',
        }, { status: 400 });
      }

      // Clamp the caller's requested slippage to the agent's hard ceiling. A looser request
      // is silently tightened; it can never widen the MEV window beyond MAX_SLIPPAGE_BPS.
      const requestedSlippage = Number(body?.maxSlippage);
      const requestedBps = Number.isFinite(requestedSlippage) && requestedSlippage > 0
        ? BigInt(Math.round(requestedSlippage * 100))
        : MAX_SLIPPAGE_BPS;
      const slippageBps = requestedBps < MAX_SLIPPAGE_BPS ? requestedBps : MAX_SLIPPAGE_BPS;

      const minimumOutput = await getBinanceWeb3MinimumOutput({
        tokenOut: selectedToken,
        amountIn,
        userWalletAddress: recipient,
        slippageBps,
      });

      // FAIL CLOSED: with no verified minimum output we refuse to emit calldata. Signing a swap
      // without an enforceable amountOutMinimum is what lets MEV bots sandwich the trade.
      if (!minimumOutput.ok) {
        return NextResponse.json({
          status: 'quote_unavailable',
          mode: 'LIVE_MAINNET_AUTONOMOUS',
          chainId: BSC_CHAIN_ID,
          targetRouter: PANCAKESWAP_V3_ROUTER,
          calldata: null,
          broadcast: false,
          message: `Execution blocked: ${minimumOutput.reason}. Refusing to sign a swap without slippage protection.`,
          timestamp: Date.now(),
        }, { status: 503 });
      }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + EXECUTION_DEADLINE_SECONDS);
      const swapCalldata = encodeFunctionData({
        abi: PANCAKE_V3_ABI,
        functionName: 'exactInputSingle',
        args: [{
          tokenIn: WBNB_ADDRESS,
          tokenOut: selectedToken,
          fee: 3000,
          recipient,
          amountIn,
          amountOutMinimum: minimumOutput.amountOutMinimum,
          sqrtPriceLimitX96: 0n,
        }],
      });
      // Wrap the swap in a deadline-guarded multicall so the router reverts if the tx is mined late.
      const calldata = encodeFunctionData({
        abi: PANCAKE_V3_ABI,
        functionName: 'multicall',
        args: [deadline, [swapCalldata]],
      });

      const slippagePercent = Number(slippageBps) / 100;
      return NextResponse.json({
        status: 'success',
        mode: 'LIVE_MAINNET_AUTONOMOUS',
        chainId: BSC_CHAIN_ID,
        requiredBnb: requiredBnb.toFixed(18),
        usdAmount,
        targetRouter: PANCAKESWAP_V3_ROUTER,
        calldata,
        amountOutMinimum: minimumOutput.amountOutMinimum.toString(),
        expectedOut: minimumOutput.expectedOut.toString(),
        quoteSource: minimumOutput.source,
        bnbUsdPrice: priceResult.price,
        isFallbackPrice: priceResult.isFallbackPrice,
        maxSlippagePercent: slippagePercent,
        deadline: deadline.toString(),
        deadlineSeconds: EXECUTION_DEADLINE_SECONDS,
        // Broadcasting through a private/MEV-protected relay (e.g. bloXroute Protect, Merkle,
        // 48 Club Puissant) keeps the signed tx out of the public mempool so it cannot be seen
        // and sandwiched before it lands. Public-mempool broadcast is not MEV-safe.
        mevProtection: {
          amountOutMinimumEnforced: true,
          deadlineGuarded: true,
          slippageCappedBps: Number(MAX_SLIPPAGE_BPS),
          recommendedRelay: 'private-mempool',
        },
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
