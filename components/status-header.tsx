'use client';

import { Signal, Database, Zap, CheckCircle2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

interface AgentStatus {
  binanceWeb3Configured?: boolean;
  liveTradingConfigured?: boolean;
  agentStudioId?: string;
  supportedTokens?: Array<{ symbol: string; name: string }>;
}

export function StatusHeader() {
  const [status, setStatus] = useState<AgentStatus | null>(null);

  useEffect(() => {
    fetch('/api/agent')
      .then((r) => r.json())
      .then((data) => setStatus(data))
      .catch(() => setStatus(null));
  }, []);

  const binanceConnected = status?.binanceWeb3Configured === true;

  return (
    <div className="w-full px-4 py-3 bg-gradient-to-r from-[#F0B90B]/10 via-transparent to-transparent border-b border-[#F0B90B]/20 glass-dark">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2 text-[#F0B90B]">
            <Signal className="w-4 h-4 animate-pulse" />
            <span className="font-semibold">BSC Mainnet</span>
            <span className="text-gray-400">Chain ID 56</span>
          </div>
          <div className="flex items-center gap-2 text-[#F0B90B]">
            <Zap className="w-4 h-4" />
            <span className="font-semibold">BNB Agent Studio</span>
            <span className="text-gray-400">{status?.agentStudioId ?? '#8004-EQUIPULSE'}</span>
          </div>
          <div className="flex items-center gap-2 text-[#F0B90B]">
            <Database className="w-4 h-4" />
            <span className="font-semibold">Binance Web3 API</span>
            {binanceConnected ? (
              <span className="flex items-center gap-1 text-green-400">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-gray-400">
                <XCircle className="w-3 h-3" /> Not configured
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
