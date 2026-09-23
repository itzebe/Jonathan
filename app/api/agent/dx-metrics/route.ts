import { NextResponse } from 'next/server';
import { measureBscRpcLatencyMs, getBnbUsdPrice } from '@/lib/market-data';

interface DXMetricsResponse {
  timestamp: string;
  network: string;
  chainId: number;
  latencyMs: number;
  healthStatus: 'nominal' | 'degraded' | 'warning';
  rpcEndpointUsed?: string;
  gaps: Array<{
    asset: string;
    gapPercent: number;
    direction: 'premium' | 'discount';
    opportunityRank: number;
  }>;
  rpcLatencyStatus?: 'LIVE' | 'UNAVAILABLE';
  telemetry: {
    executionSlippage: number;
    liquidityDepthUsd: number;
    timeToFirstCallMs: number;
    platformFrictionPercent: number;
    apiCalls: number;
    rpcHealthPercent: number;
    cacheHitRate: number;
    estimatedGasBnb: number;
    estimatedGasUsd: number;
  };
  bscScanTxBase: string;
  riskFactors?: {
    highSlippageWarning?: boolean;
    lowLiquidityWarning?: boolean;
    highLatencyWarning?: boolean;
  };
  exportFormat: {
    json: string;
    csv: string;
  };
}

export async function GET() {
  try {
    const now = Date.now();
    // Real, reachable on-chain measurement: a live eth_chainId round trip to the BSC RPC.
    // (Binance's own API is geo-blocked from US serverless regions, so it cannot be probed.)
    const rpc = await measureBscRpcLatencyMs();
    const latency = rpc.status === 'LIVE'
      ? rpc.latencyMs
      : Math.round(130 + Math.sin(now / 1000) * 18 + Math.random() * 12);
    const executionSlippage = Number((0.18 + Math.random() * 0.12).toFixed(2));
    const liquidityDepthUsd = Math.round(2800000 + Math.random() * 100000);
    const timeToFirstCall = Math.round(1150 + Math.random() * 120);
    const platformFriction = Number((3 + Math.random() * 0.6).toFixed(1));
    const apiCalls = Math.round(40 + Math.random() * 12);
    // Representative BSC spot-swap gas cost. BSC gas is ~1 gwei; a V3 swap is ~180k gas.
    const estimatedGasBnb = Number((0.00042 + Math.random() * 0.00006).toFixed(8));
    // Live BNB/USD price so the USD gas estimate reflects the real market, not a stale constant.
    const bnb = await getBnbUsdPrice();
    const estimatedGasUsd = Number((estimatedGasBnb * bnb.price).toFixed(4));

    // Determine health status based on metrics
    let healthStatus: 'nominal' | 'degraded' | 'warning' = 'nominal';
    if (latency > 1500 || executionSlippage > 0.5 || liquidityDepthUsd < 1000000) {
      healthStatus = 'warning';
    } else if (latency > 1000 || executionSlippage > 0.25) {
      healthStatus = 'degraded';
    }

    // Generate price gaps with opportunity ranking
    const gaps = [
      { asset: 'NVDAx / USDC', gapPercent: 1.0, direction: 'premium' as const, opportunityRank: 1 },
      { asset: 'AAPLx / USDC', gapPercent: 0.86, direction: 'premium' as const, opportunityRank: 2 },
      { asset: 'TSLAx / USDC', gapPercent: 0.19, direction: 'premium' as const, opportunityRank: 3 },
    ].sort((a, b) => b.gapPercent - a.gapPercent);

    // Risk factors based on current metrics
    const riskFactors = {
      highSlippageWarning: executionSlippage > 0.3,
      lowLiquidityWarning: liquidityDepthUsd < 1500000,
      highLatencyWarning: latency > 1200,
    };

    // Generate exportable formats
    const metricsData = {
      timestamp: new Date().toISOString(),
      latencyMs: latency,
      executionSlippage,
      liquidityDepthUsd,
      timeToFirstCallMs: timeToFirstCall,
      platformFrictionPercent: platformFriction,
      apiCalls,
      healthStatus,
    };

    const jsonExport = JSON.stringify(metricsData, null, 2);
    const csvExport = `Metric,Value\nTimestamp,${metricsData.timestamp}\nLatency (ms),${latency}\nExecution Slippage (%),${executionSlippage}\nLiquidity Depth (USD),${liquidityDepthUsd}\nTime to First Call (ms),${timeToFirstCall}\nPlatform Friction (%),${platformFriction}\nAPI Calls,${apiCalls}\nHealth Status,${healthStatus}`;

    const response: DXMetricsResponse & { isLive: boolean; dataSource: string; note: string } = {
      isLive: false,
      dataSource: 'sample',
      note: 'Market telemetry (slippage, liquidity, TTFC, friction, gas, quote time) is sample/estimated. Live market data sources are not connected in this deployment.',
      timestamp: new Date().toISOString(),
      network: 'BSC Mainnet',
      chainId: 56,
      latencyMs: latency,
      healthStatus,
      rpcEndpointUsed: rpc.rpcUrl,
      rpcLatencyStatus: rpc.status,
      gaps,
      telemetry: {
        executionSlippage,
        liquidityDepthUsd,
        timeToFirstCallMs: timeToFirstCall,
        platformFrictionPercent: platformFriction,
        apiCalls,
        rpcHealthPercent: rpc.status === 'LIVE' ? Math.max(85, 100 - Math.floor(latency / 20)) : 0,
        cacheHitRate: Math.random() > 0.5 ? 0.92 : 0.78,
        estimatedGasBnb,
        estimatedGasUsd,
      },
      bscScanTxBase: 'https://bscscan.com/tx/',
      riskFactors,
      exportFormat: {
        json: jsonExport,
        csv: csvExport,
      },
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        error: 'Failed to fetch DX metrics: ' + errorMessage,
        status: 'server_error',
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

