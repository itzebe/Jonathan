'use client';

import { useState } from 'react';
import { ChevronRight, Loader2, CheckCircle2 } from 'lucide-react';

interface BasketCardProps {
  title: string;
  description: string;
  composition: { asset: string; percentage: number }[];
  onInvest: () => void;
  loading?: boolean;
  success?: boolean;
}

export function BasketCard({
  title,
  description,
  composition,
  onInvest,
  loading = false,
  success = false,
}: BasketCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="group relative overflow-hidden rounded-lg glass-dark p-4 sm:p-6 hover:glass transition-all duration-300 hover:border-[#F0B90B]/40 hover:shadow-lg hover:shadow-[#F0B90B]/20 h-full flex flex-col">
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity gradient-bnb" />

      <div className="relative z-10 flex flex-col h-full">
        <div className="mb-4 flex-1">
          <h3 className="text-lg sm:text-xl font-bold text-white mb-1">{title}</h3>
          <p className="text-xs sm:text-sm text-gray-400">{description}</p>
        </div>

        <div className="mb-4">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-[#F0B90B] hover:text-[#F0B90B]/80 transition-colors flex items-center gap-1 mb-3"
          >
            <span>{showDetails ? 'Hide' : 'View'} Composition</span>
            <ChevronRight className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-90' : ''}`} />
          </button>

          {showDetails && (
            <div className="space-y-2 bg-black/30 rounded p-3 text-xs animate-fadeIn">
              {composition.map((item) => (
                <div key={item.asset} className="flex items-center justify-between">
                  <span className="text-gray-300">{item.asset}</span>
                  <div className="flex items-center gap-2 flex-1 ml-3">
                    <div className="flex-1 h-2 bg-black/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#F0B90B] to-[#F0B90B]/60"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                    <span className="text-[#F0B90B] font-semibold min-w-max">{item.percentage}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onInvest}
          disabled={loading || success}
          className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm bg-[#F0B90B] text-black hover:bg-[#F0B90B]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group/btn"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {success && <CheckCircle2 className="w-4 h-4" />}
          <span>{loading ? 'Executing' : success ? 'Success!' : 'One-Tap Invest'}</span>
        </button>
      </div>
    </div>
  );
}
