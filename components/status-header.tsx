'use client';

import { Signal, Database, Zap } from 'lucide-react';

export function StatusHeader() {
  return (
    <div className="w-full px-4 py-3 bg-gradient-to-r from-[#F0B90B]/10 via-transparent to-transparent border-b border-[#F0B90B]/20 glass-dark">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2 text-[#F0B90B]">
            <Signal className="w-4 h-4 animate-pulse" />
            <span className="font-semibold">BSC Mainnet</span>
            <span className="text-gray-400">Active</span>
          </div>
          <div className="flex items-center gap-2 text-[#F0B90B]">
            <Zap className="w-4 h-4" />
            <span className="font-semibold">BNB Agent Studio</span>
            <span className="text-gray-400">#8004-EQUIPULSE</span>
          </div>
          <div className="flex items-center gap-2 text-[#F0B90B]">
            <Database className="w-4 h-4" />
            <span className="font-semibold">Binance Web3 API</span>
            <span className="text-gray-400">Not connected</span>
          </div>
        </div>
      </div>
    </div>
  );
}
