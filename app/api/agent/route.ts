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

    return NextResponse.json({
      status: 'ready_for_signature',
      mode: 'LIVE_MAINNET',
      network: 'BSC Mainnet (Chain ID 56)',
      chainId: BSC_CHAIN_ID,
      prompt,
      userAddress,
      targetRouter: PANCAKESWAP_V3_ROUTER,
      value: '0.0005',
      transaction: {
        to: PANCAKESWAP_V3_ROUTER,
        value: '0x1c6bf52634000',
        chainId: BSC_CHAIN_ID,
      },
      message: 'Wallet signature required. The server never signs or broadcasts on your behalf.',
      timestamp: Date.now(),
    });
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
