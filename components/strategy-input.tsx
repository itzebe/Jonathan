'use client';

import { useState } from 'react';
import { Send, Zap, Loader2 } from 'lucide-react';

interface StrategyInputProps {
  onSubmit?: (prompt: string) => void;
  loading?: boolean;
}

const PRESETS = [
  {
    label: 'Gap Rotation',
    prompt: 'Rotate 40% of bTSLA into Ondo USDY when off-market volatility spikes',
  },
  {
    label: 'Cross-Protocol Arb',
    prompt: 'Cross-protocol arbitrage between bStocks and Ondo representations of TSLA',
  },
  {
    label: 'Auto-DCA',
    prompt: 'Auto-DCA $50 USDT into AI Chips basket on market-close gaps',
  },
];

export function StrategyInput({ onSubmit, loading = false }: StrategyInputProps) {
  const [prompt, setPrompt] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    onSubmit?.(prompt);
    setSubmitted(true);
    setPrompt('');

    setTimeout(() => setSubmitted(false), 2000);
  };

  const handlePreset = (presetPrompt: string) => {
    setPrompt(presetPrompt);
  };

  return (
    <div className="glass-dark rounded-lg p-4 sm:p-6 border border-[#F0B90B]/20">
      <h2 className="text-lg sm:text-xl font-bold text-white mb-4 flex items-center gap-2">
        <Zap className="w-5 h-5 text-[#F0B90B]" />
        Natural Language Strategy
      </h2>

      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your strategy in plain English..."
            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#F0B90B]/50 focus:ring-1 focus:ring-[#F0B90B]/20 transition-all"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="px-4 py-2.5 bg-[#F0B90B] text-black font-semibold rounded-lg hover:bg-[#F0B90B]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span className="hidden sm:inline">Execute</span>
            <span className="sm:hidden">Send</span>
          </button>
        </div>
      </form>

      {submitted && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg animate-fadeIn">
          <p className="text-sm text-green-300">Strategy submitted for parsing and simulation...</p>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs text-gray-400 font-semibold uppercase">Quick Presets</p>
        {PRESETS.map((preset, idx) => (
          <button
            key={idx}
            onClick={() => handlePreset(preset.prompt)}
            className="w-full text-left p-3 bg-black/30 hover:bg-black/50 border border-white/5 hover:border-[#F0B90B]/30 rounded-lg transition-all text-sm text-gray-300 hover:text-white"
          >
            <div className="font-semibold text-[#F0B90B] mb-1">{preset.label}</div>
            <div className="line-clamp-2">{preset.prompt}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
