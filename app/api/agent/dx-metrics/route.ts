import { NextResponse } from 'next/server';

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
  telemetry: {
    executionSlippage: number;
    liquidityDepthUsd: number;
    timeToFirstCallMs: number;
    platformFrictionPercent: number;
    apiCalls: number;
    rpcHealthPercent: number;
    cacheHitRate: number;
  };
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
    const latency = Math.round(130 + Math.sin(now / 1000) * 18 + Math.random() * 12);
    const executionSlippage = Number((0.18 + Math.random() * 0.12).toFixed(2));
    const liquidityDepthUsd = Math.round(2800000 + Math.random() * 100000);
    const timeToFirstCall = Math.round(1150 + Math.random() * 120);
    const platformFriction = Number((3 + Math.random() * 0.6).toFixed(1));
    const apiCalls = Math.round(40 + Math.random() * 12);

    // Determine health status based on metrics
    let healthStatus: 'nominal' | 'degraded' | 'warning' = 'nominal';
    if (latency > 1500 || executionSlippage > 0.5 || liquidityDepthUsd < 1000000) {
      healthStatus = 'warning';
    } else if (latency > 1000 || executionSlippage > 0.25) {
      healthStatus = 'degraded';
    }

    // Generate price gaps with opportunity ranking
    const gaps = [
      { asset: 'bTSLA / Ondo TSLA', gapPercent: 0.89, direction: 'premium' as const, opportunityRank: 1 },
      { asset: 'bAAPL / Ondo AAPL', gapPercent: 0.25, direction: 'premium' as const, opportunityRank: 3 },
      { asset: 'bNVDA / bAMD', gapPercent: 1.2, direction: 'premium' as const, opportunityRank: 1 },
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

    const response: DXMetricsResponse = {
      timestamp: new Date().toISOString(),
      network: 'BSC Mainnet',
      chainId: 56,
      latencyMs: latency,
      healthStatus,
      rpcEndpointUsed: 'https://bsc-dataseed.binance.org/',
      gaps,
      telemetry: {
        executionSlippage,
        liquidityDepthUsd,
        timeToFirstCallMs: timeToFirstCall,
        platformFrictionPercent: platformFriction,
        apiCalls,
        rpcHealthPercent: Math.max(85, 100 - Math.floor(latency / 20)),
        cacheHitRate: Math.random() > 0.5 ? 0.92 : 0.78,
      },
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

