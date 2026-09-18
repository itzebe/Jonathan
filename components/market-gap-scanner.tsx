'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

interface GapData {
  asset: string;
  onchainPrice: number;
  referencePrice: number;
  spreadPercent: number;
  direction: 'premium' | 'discount';
}

export function MarketGapScanner() {
  const [gaps, setGaps] = useState<GapData[]>([
    {
      asset: 'bTSLA ↔ Ondo TSLA',
      onchainPrice: 242.35,
      referencePrice: 240.21,
      spreadPercent: 0.89,
      direction: 'premium',
    },
    {
      asset: 'bAAPL ↔ Ondo AAPL',
      onchainPrice: 189.42,
      referencePrice: 188.95,
      spreadPercent: 0.25,
      direction: 'premium',
    },
    {
      asset: 'bNVDA ↔ bAMD Arbitrage',
      onchainPrice: 135.82,
      referencePrice: 134.21,
      spreadPercent: 1.2,
      direction: 'premium',
    },
  ]);

  useEffect(() => {
    // Simulate real-time price updates
    const interval = setInterval(() => {
      setGaps((prev) =>
        prev.map((gap) => ({
          ...gap,
          spreadPercent: gap.spreadPercent + (Math.random() - 0.5) * 0.1,
        }))
      );
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="glass-dark rounded-lg p-4 sm:p-6 border border-[#F0B90B]/20">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle className="w-5 h-5 text-[#F0B90B]" />
        <h2 className="text-lg sm:text-xl font-bold text-white">24/7 Market Disconnect Monitor</h2>
      </div>

      <div className="space-y-3">
        {gaps.map((gap, idx) => (
          <div
            key={idx}
            className="bg-black/40 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-black/60 transition-colors border border-white/5 hover:border-[#F0B90B]/30"
          >
            <div className="flex-1">
              <div className="font-semibold text-white text-sm sm:text-base">{gap.asset}</div>
              <div className="text-xs text-gray-400 mt-1">
                BSC Price: <span className="text-[#F0B90B]">${gap.onchainPrice.toFixed(2)}</span>
                {' • '}
                Reference: <span className="text-gray-300">${gap.referencePrice.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="flex items-center gap-1 justify-end">
                  {gap.direction === 'premium' ? (
                    <TrendingUp className="w-4 h-4 text-green-400" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-400" />
                  )}
                  <span
                    className={`font-bold text-sm ${
                      gap.direction === 'premium' ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {gap.spreadPercent > 0 ? '+' : ''}
                    {gap.spreadPercent.toFixed(2)}%
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{gap.direction === 'premium' ? 'Premium' : 'Discount'}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-[#F0B90B]/10 border border-[#F0B90B]/20 rounded-lg">
        <p className="text-xs text-gray-300">
          <span className="text-[#F0B90B] font-semibold">Live arbitrage opportunity:</span> Off-market spreads detected between
          tokenized stocks and Ondo representations. Max gap: +1.20%.
        </p>
      </div>
    </div>
  );
}
