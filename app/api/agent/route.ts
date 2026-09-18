import { NextResponse } from 'next/server';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const BSC_CHAIN_ID = 56;
const PANCAKESWAP_V3_ROUTER = '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4';

function safeAddress(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ZERO_ADDRESS;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prompt = typeof body?.prompt === 'string' && body.prompt.trim()
      ? body.prompt.trim()
      : 'Rotate bTSLA into Ondo USDY';
    const userAddress = safeAddress(body?.userAddress);
    const isDryRun = body?.isDryRun !== false;

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
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Invalid payload' },
      { status: 400 },
    );
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
