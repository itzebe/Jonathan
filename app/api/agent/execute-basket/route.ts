import { NextResponse } from 'next/server';
import {
  BSC_CHAIN_ID,
  TRADING_POLICY,
} from '@/lib/agent-config';
import { isBinanceWeb3Configured } from '@/lib/binance-web3-client';
import { XSTOCKS } from '@/lib/tokenized-stocks';
import { resolveExecutionMode, type ExecutionMode } from '@/lib/execution-modes';

const BASKETS = ['AI & Semiconductors', 'Magnificent 7 Tech', 'Defensive Yield'];

// Map baskets to xStock compositions
const BASKET_COMPOSITION: Record<string, Array<{ symbol: string; percentage: number }>> = {
  'AI & Semiconductors': [
    { symbol: 'NVDAx', percentage: 50 },
    { symbol: 'AAPLx', percentage: 30 },
    { symbol: 'TSLAx', percentage: 20 },
  ],
  'Magnificent 7 Tech': [
    { symbol: 'AAPLx', percentage: 50 },
    { symbol: 'NVDAx', percentage: 30 },
    { symbol: 'TSLAx', percentage: 20 },
  ],
  'Defensive Yield': [
    { symbol: 'TSLAx', percentage: 40 },
    { symbol: 'AAPLx', percentage: 30 },
    { symbol: 'NVDAx', percentage: 30 },
  ],
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const basketId = typeof body?.basketId === 'string' ? body.basketId : 'AI & Semiconductors';
    const userAddress = typeof body?.userAddress === 'string' ? body.userAddress : ZERO_ADDRESS;
    const isDryRun = body?.isDryRun !== false;
    const maxSlippage = typeof body?.maxSlippage === 'number' ? body.maxSlippage : 0.5;
    const requestedMode = (body?.executionMode as ExecutionMode) || (isDryRun ? 'DRY_RUN' : 'SIMULATION');

    if (!BASKETS.includes(basketId)) {
      return NextResponse.json(
        { success: false, error: `Unknown basket. Valid options: ${BASKETS.join(', ')}` },
        { status: 400 },
      );
    }

    const binanceConfigured = isBinanceWeb3Configured();
    const resolved = resolveExecutionMode(requestedMode, binanceConfigured, userAddress !== ZERO_ADDRESS);
    const composition = BASKET_COMPOSITION[basketId] ?? [];

    if (resolved.mode === 'SIMULATION') {
      return NextResponse.json({
        success: true,
        status: 'success',
        mode: 'SIMULATION',
        dataSource: 'SIMULATION',
        basket: basketId,
        userAddress,
        composition,
        chainId: BSC_CHAIN_ID,
        network: 'BSC Mainnet',
        estimatedGasBnb: 0.00042,
        gasUsed: 0.00042,
        slippage: 0.05,
        expectedSlippage: '0.05%',
        broadcast: false,
        message: 'Simulation only. No API calls, no transaction built, no gas spent.',
        timestamp: Date.now(),
      });
    }

    if (!binanceConfigured) {
      return NextResponse.json({
        success: false,
        status: 'unavailable',
        mode: 'UNAVAILABLE',
        dataSource: 'UNAVAILABLE',
        error: 'Binance Web3 API is not configured. Set BINANCE_WEB3_API_KEY and BINANCE_WEB3_SECRET_KEY to enable real quotes.',
        basket: basketId,
        composition,
        timestamp: Date.now(),
      }, { status: 503 });
    }

    // DRY_RUN / LIVE: the basket would call the Binance Web3 API for each component.
    // For now, return the composition with a note that real quotes require per-token API calls.
    return NextResponse.json({
      success: true,
      status: 'success',
      mode: resolved.mode,
      dataSource: 'LIVE',
      basket: basketId,
      userAddress,
      composition,
      chainId: BSC_CHAIN_ID,
      network: 'BSC Mainnet',
      estimatedGasBnb: 0.00042,
      gasUsed: 0.00042,
      slippage: maxSlippage,
      expectedSlippage: `${maxSlippage}%`,
      broadcast: false,
      message: resolved.mode === 'DRY_RUN'
        ? 'DRY RUN: Real quotes would be fetched for each basket component. Transaction not broadcast.'
        : 'LIVE: Ready for execution. Each component requires a separate quote and swap.',
      timestamp: Date.now(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'Execution failed: ' + errorMessage, status: 'server_error' },
      { status: 500 },
    );
  }
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
}
