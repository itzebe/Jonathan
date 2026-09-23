'use client';

import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

interface GapData {
  asset: string;
  onchainPrice: number;
  referencePrice: number;
  spreadPercent: number;
  direction: 'premium' | 'discount';
}

// Static, clearly-labeled sample spreads for xStocks on BSC. These are illustrative only:
// no live on-chain price feed is connected in this deployment, so these are NOT live arbitrage
// opportunities and must not be represented as executable. When the Binance Web3 Market API is
// configured, these will be replaced with real price data.
const SAMPLE_GAPS: GapData[] = [
  { asset: 'NVDAx ↔ USDC', onchainPrice: 216.35, referencePrice: 214.21, spreadPercent: 1.0, direction: 'premium' },
  { asset: 'TSLAx ↔ USDC', onchainPrice: 248.42, referencePrice: 247.95, spreadPercent: 0.19, direction: 'premium' },
  { asset: 'AAPLx ↔ USDC', onchainPrice: 189.82, referencePrice: 188.21, spreadPercent: 0.86, direction: 'premium' },
];

export function MarketGapScanner() {
  const gaps = SAMPLE_GAPS;

  return (
    <div className="glass-dark rounded-lg p-4 sm:p-6 border border-[#F0B90B]/20">
      <div className="flex items-center gap-2 mb-1">
        <AlertCircle className="w-5 h-5 text-[#F0B90B]" />
        <h2 className="text-lg sm:text-xl font-bold text-white">xStock Price Monitor</h2>
        <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">Sample data</span>
      </div>
      <p className="mb-4 text-xs text-gray-500">Illustrative xStock spreads on BSC. Live price data from the Binance Web3 Market API will appear here when configured.</p>

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
          <span className="text-[#F0B90B] font-semibold">xStocks on BSC:</span> Tokenized equities (NVDAx, AAPLx, TSLAx) issued by Backed Finance,
          trading via AMM liquidity pools on BNB Smart Chain. Real price data requires Binance Web3 API configuration.
        </p>
      </div>
    </div>
  );
}
