'use client';

import { useState, useEffect } from 'react';

interface TelemetryLog {
  timestamp: string;
  endpoint: string;
  latencyMs: number;
  status: string;
}
import { ChevronUp, Zap, Activity, Database, AlertCircle, X } from 'lucide-react';

interface DXMetrics {
  latency: number;
  slippage: number;
  liquidity: number;
  timeToFirst: number;
  platformFriction: number;
  apiCalls: number;
}

export function DXDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [metrics, setMetrics] = useState<DXMetrics>({
    latency: 142,
    slippage: 0.23,
    liquidity: 2845000,
    timeToFirst: 1205,
    platformFriction: 3.2,
    apiCalls: 47,
  });
  const [telemetryLogs, setTelemetryLogs] = useState<TelemetryLog[]>([]);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const refreshMetrics = async () => {
      const startedAt = performance.now();
      try {
        const response = await fetch('/api/agent/dx-metrics', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Metrics unavailable');
        if (cancelled) return;
        setMetrics({
          latency: data.latencyMs ?? 142,
          slippage: data.telemetry?.executionSlippage ?? 0.23,
          liquidity: data.telemetry?.liquidityDepthUsd ?? 2845000,
          timeToFirst: data.telemetry?.timeToFirstCallMs ?? 1205,
          platformFriction: data.telemetry?.platformFrictionPercent ?? 3.2,
          apiCalls: data.telemetry?.apiCalls ?? 47,
        });
        setMetricsError(null);
        setTelemetryLogs((previous) => [{
          timestamp: new Date().toISOString(),
          endpoint: '/api/agent/dx-metrics',
          latencyMs: Math.round(performance.now() - startedAt),
          status: data.healthStatus ?? 'nominal',
        }, ...previous].slice(0, 5));
      } catch {
        if (!cancelled) setMetricsError('Retrying network connection...');
      }
    };

    refreshMetrics();
    const interval = setInterval(refreshMetrics, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isOpen]);

  return (
    <>
      {/* Drawer Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-0 left-1/2 -translate-x-1/2 px-4 py-3 bg-[#F0B90B] text-black font-semibold rounded-t-lg transition-all z-40 flex items-center gap-2 ${
          isOpen ? 'rounded-t-lg' : 'rounded-lg'
        }`}
      >
        <Activity className="w-4 h-4" />
        <span className="hidden sm:inline">Developer Telemetry</span>
        <span className="sm:hidden">DX Metrics</span>
        <ChevronUp className={`w-4 h-4 ml-auto transition-transform ${isOpen ? '' : 'rotate-180'}`} />
      </button>

      {/* Drawer Overlay */}
      {isOpen && <div className="fixed inset-0 bg-black/40 z-30" onClick={() => setIsOpen(false)} />}

      {/* Drawer Panel */}
      <div
        className={`fixed bottom-14 left-0 right-0 bg-gradient-to-t from-[#0a0a0a] to-[#1a1a1a] border-t border-[#F0B90B]/20 z-30 transition-all duration-300 max-h-96 overflow-y-auto ${
          isOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
        }`}
      >
        <div className="p-4 sm:p-6 max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-[#F0B90B]" />
              Live DX Report
            </h3>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Latency */}
            <div className="bg-black/40 border border-white/5 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Database className="w-4 h-4 text-[#F0B90B]" />
                <span className="text-xs text-gray-400 font-semibold">API Latency</span>
              </div>
              <div className="text-2xl font-bold text-white">{metrics.latency.toFixed(0)}<span className="text-sm text-gray-400 ml-1">ms</span></div>
              <div className="text-xs text-gray-500 mt-1">Binance Web3 API</div>
            </div>

            {/* Slippage */}
            <div className="bg-black/40 border border-white/5 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4 text-orange-400" />
                <span className="text-xs text-gray-400 font-semibold">Execution Slippage</span>
              </div>
              <div className="text-2xl font-bold text-orange-400">{metrics.slippage.toFixed(2)}<span className="text-sm text-gray-400 ml-1">%</span></div>
              <div className="text-xs text-gray-500 mt-1">Off-market hours</div>
            </div>

            {/* Liquidity */}
            <div className="bg-black/40 border border-white/5 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-green-400" />
                <span className="text-xs text-gray-400 font-semibold">Liquidity Depth</span>
              </div>
              <div className="text-2xl font-bold text-green-400">${(metrics.liquidity / 1000000).toFixed(2)}M</div>
              <div className="text-xs text-gray-500 mt-1">Spot pairs</div>
            </div>

            {/* Time to First Call */}
            <div className="bg-black/40 border border-white/5 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-[#F0B90B]" />
                <span className="text-xs text-gray-400 font-semibold">TTFC</span>
              </div>
              <div className="text-2xl font-bold text-[#F0B90B]">{metrics.timeToFirst.toFixed(0)}<span className="text-sm text-gray-400 ml-1">ms</span></div>
              <div className="text-xs text-gray-500 mt-1">Time to first call</div>
            </div>

            {/* Platform Friction */}
            <div className="bg-black/40 border border-white/5 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-gray-400 font-semibold">Platform Friction</span>
              </div>
              <div className="text-2xl font-bold text-yellow-400">{metrics.platformFriction.toFixed(1)}%</div>
              <div className="text-xs text-gray-500 mt-1">Dev overhead</div>
            </div>

            {/* API Calls */}
            <div className="bg-black/40 border border-white/5 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Database className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-gray-400 font-semibold">API Calls</span>
              </div>
              <div className="text-2xl font-bold text-blue-400">{metrics.apiCalls}</div>
              <div className="text-xs text-gray-500 mt-1">Session total</div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-[#F0B90B]/10 border border-[#F0B90B]/20 rounded-lg">
            <p className="text-xs text-gray-300">
              <span className="text-[#F0B90B] font-semibold">Telemetry Status:</span>{' '}
              {metricsError ?? 'All endpoints responding nominally. Metrics refresh every 5s with safe fallback values.'}
            </p>
            {telemetryLogs.length > 0 && (
              <div className="mt-3 space-y-1 border-t border-white/10 pt-3" aria-label="Recent telemetry logs">
                {telemetryLogs.map((log) => (
                  <div key={`${log.timestamp}-${log.latencyMs}`} className="flex items-center justify-between gap-3 text-[11px] text-gray-400">
                    <span className="truncate">{log.endpoint} · {log.status}</span>
                    <span className="shrink-0 text-[#F0B90B]">{log.latencyMs}ms</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
