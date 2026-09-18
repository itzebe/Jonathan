import { NextResponse } from 'next/server';

const BASKETS = ['AI & Semiconductors', 'Magnificent 7 Tech', 'Defensive Yield'];
const CHAIN_ID = 56; // BSC Mainnet Only
const MAX_SLIPPAGE = 1.0; // 1% absolute max slippage guard
const RPC_URLS = [
  'https://bsc-dataseed.binance.org/',
  'https://bsc-dataseed1.binance.org/',
  'https://bsc-dataseed2.binance.org/',
  'https://rpc.ankr.com/bsc',
];

interface ExecutionMetrics {
  rpcLatencyMs: number;
  estimatedGasGwei: string;
  slippagePercent: number;
  liquidityDepthUsd: number;
}

interface ExecutionResult {
  success: boolean;
  basket: string;
  userAddress: string;
  isDemoMode: boolean;
  amountTraded: string;
  txHash: string;
  bscScanUrl: string;
  gasUsed: number;
  executionSpeedMs: number;
  slippage: number;
  network: string;
  chainId: number;
  executedAt: string;
  metrics?: ExecutionMetrics;
  warning?: string;
}

async function testRpcHealth(url: string): Promise<{ healthy: boolean; latencyMs: number }> {
  const startTime = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
        id: 1,
      }),
      signal: AbortSignal.timeout(2000),
    });
    const latencyMs = Date.now() - startTime;
    const data = await response.json();
    const isHealthy = response.ok && data.result === '0x38'; // 0x38 = 56 in hex
    return { healthy: isHealthy, latencyMs };
  } catch {
    return { healthy: false, latencyMs: Date.now() - startTime };
  }
}

async function findHealthyRpc(): Promise<{ url: string; latencyMs: number }> {
  const healthChecks = await Promise.all(RPC_URLS.map(testRpcHealth));
  const healthy = healthChecks
    .map((check, idx) => ({ ...check, url: RPC_URLS[idx] }))
    .filter((check) => check.healthy)
    .sort((a, b) => a.latencyMs - b.latencyMs);

  if (healthy.length > 0) {
    return { url: healthy[0].url, latencyMs: healthy[0].latencyMs };
  }
  // Fallback to first RPC if all fail (will be handled gracefully)
  return { url: RPC_URLS[0], latencyMs: 5000 };
}

function validateExecutionRequest(body: unknown): { valid: boolean; error?: string; data?: any } {
  if (typeof body !== 'object' || body === null) {
    return { valid: false, error: 'Request body must be valid JSON' };
  }

  const { basketId: rawBasketId, prompt, userAddress: rawUserAddress, isDemoMode, isDryRun, chainId } = body as Record<string, unknown>;
  const demoMode = typeof isDryRun === 'boolean' ? isDryRun : isDemoMode;
  const basketId = typeof rawBasketId === 'string'
    ? rawBasketId
    : typeof prompt === 'string' && /defensive|yield|ousg|brk/i.test(prompt)
      ? 'Defensive Yield'
      : typeof prompt === 'string' && /magnificent|aapl|msft|tsla/i.test(prompt)
        ? 'Magnificent 7 Tech'
        : 'AI & Semiconductors';
  const userAddress = typeof rawUserAddress === 'string' && rawUserAddress.trim()
    ? rawUserAddress.trim()
    : '0x0000000000000000000000000000000000000000';

  // Validate basket
  if (!BASKETS.includes(basketId)) {
    return { valid: false, error: `Unknown basket. Valid options: ${BASKETS.join(', ')}` };
  }

  // Validate user address format (if provided)
  if (userAddress !== undefined && typeof userAddress !== 'string') {
    return { valid: false, error: 'User address must be a string' };
  }

  if (typeof userAddress === 'string' && !userAddress.match(/^0x[a-fA-F0-9]{40}$/) && userAddress !== '0xDemoWallet') {
    return { valid: false, error: 'Invalid Ethereum address format' };
  }

  // Chain ID safety check: must be BSC Mainnet (56) or demo mode
  if (chainId !== undefined && chainId !== CHAIN_ID && demoMode !== true) {
    return { valid: false, error: `Chain ID must be ${CHAIN_ID} (BSC Mainnet). Received: ${chainId}. Please switch your wallet.` };
  }

  return {
    valid: true,
    data: {
      basketId,
      userAddress: userAddress ?? '0xDemoWallet',
      isDemoMode: demoMode !== false,
    },
  };
}

function generateExecutionMetrics(rpcLatencyMs: number): ExecutionMetrics {
  const simulatedSlippage = Number((0.12 + Math.random() * 0.18).toFixed(2));
  return {
    rpcLatencyMs,
    estimatedGasGwei: (0.00045 + Math.random() * 0.00015).toFixed(8),
    slippagePercent: simulatedSlippage,
    liquidityDepthUsd: Math.round(2800000 + Math.random() * 200000),
  };
}

function checkSlippageGuard(slippage: number): { allowed: boolean; warning?: string } {
  if (slippage > MAX_SLIPPAGE) {
    return {
      allowed: false,
      warning: `Trade paused: Off-market liquidity depth too low. Slippage ${slippage.toFixed(2)}% exceeds maximum ${MAX_SLIPPAGE}%.`,
    };
  }
  if (slippage > MAX_SLIPPAGE * 0.75) {
    return {
      allowed: true,
      warning: `Caution: Slippage approaching limit (${slippage.toFixed(2)}%). Consider reducing order size.`,
    };
  }
  return { allowed: true };
}

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON: Request body must be valid JSON', status: 'parse_error' },
        { status: 400 }
      );
    }

    const validation = validateExecutionRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error, status: 'validation_error', suggestion: `Try: { basketId: "${BASKETS[0]}", isDemoMode: true }` },
        { status: 400 }
      );
    }

    const { basketId, userAddress, isDemoMode } = validation.data;

    // Simulate network latency and RPC health check
    const { url: selectedRpc, latencyMs: rpcLatencyMs } = await findHealthyRpc();
    const metrics = generateExecutionMetrics(rpcLatencyMs);

    // Check slippage guard
    const slippageCheck = checkSlippageGuard(metrics.slippagePercent);
    if (!slippageCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: slippageCheck.warning,
          status: 'slippage_guard_triggered',
          metrics,
          rpcUsed: selectedRpc,
        },
        { status: 429 }
      );
    }

    // Simulate execution delay
    await new Promise((resolve) => setTimeout(resolve, Math.min(650, rpcLatencyMs + 200)));

    const executionSpeedMs = Date.now() - startTime;
    const result: ExecutionResult = {
      success: true,
      basket: basketId,
      userAddress,
      isDemoMode,
      amountTraded: '$50.00 simulated',
      txHash: '',
      bscScanUrl: '',
      gasUsed: Math.floor(185000 + Math.random() * 22000),
      executionSpeedMs,
      slippage: metrics.slippagePercent,
      network: 'BSC Mainnet',
      chainId: CHAIN_ID,
      executedAt: new Date().toISOString(),
      metrics,
    };

    if (slippageCheck.warning) {
      result.warning = slippageCheck.warning;
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: 'Execution failed: ' + errorMessage,
        status: 'server_error',
        suggestion: 'Please retry in a moment. If this persists, check BSC network status.',
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

