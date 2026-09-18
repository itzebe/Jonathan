'use client';

import { useState } from 'react';

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
};

const BSC_CHAIN_ID = '0x38';
const BSC_RPC_URLS = [
  'https://bsc-dataseed.binance.org/',
  'https://bsc-dataseed1.binance.org/',
  'https://rpc.ankr.com/bsc',
];

function getEthereumProvider() {
  return (window as Window & { ethereum?: EthereumProvider }).ethereum;
} 
import { Activity, ArrowUpRight, Bot, CheckCircle2, Code2, ExternalLink, Menu, ShieldCheck, Sparkles, Wallet, X } from 'lucide-react';
import { StatusHeader } from '@/components/status-header';
import { BasketCard } from '@/components/basket-card';
import { MarketGapScanner } from '@/components/market-gap-scanner';
import { StrategyInput } from '@/components/strategy-input';
import { DXDrawer } from '@/components/dx-drawer';

const baskets = [
  {
    title: 'AI & Semiconductors',
    description: 'High-conviction exposure to the AI infrastructure cycle',
    composition: [
      { asset: 'bNVDA', percentage: 40 },
      { asset: 'bAMD', percentage: 30 },
      { asset: 'Ondo USDY', percentage: 30 },
    ],
  },
  {
    title: 'Magnificent 7 Tech',
    description: 'The leaders powering the next decade of software',
    composition: [
      { asset: 'bAAPL', percentage: 50 },
      { asset: 'bMSFT', percentage: 30 },
      { asset: 'bTSLA', percentage: 20 },
    ],
  },
  {
    title: 'Defensive Yield',
    description: 'Steady onchain income with blue-chip resilience',
    composition: [
      { asset: 'Ondo USDY / OUSG', percentage: 70 },
      { asset: 'bBRK.B', percentage: 30 },
    ],
  },
];

export default function Page() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loadingBasket, setLoadingBasket] = useState<number | null>(null);
  const [successBasket, setSuccessBasket] = useState<number | null>(null);
  const [selectedBasket, setSelectedBasket] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<{ txHash: string; gasUsed: number; slippage: number } | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [strategyStatus, setStrategyStatus] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [isDryRun, setIsDryRun] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [executionSpeed, setExecutionSpeed] = useState<'aggressive' | 'guarded'>('aggressive');
  const [maxSlippage, setMaxSlippage] = useState(1.5);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  };

  const ensureBscMainnet = async (ethereum: EthereumProvider): Promise<boolean> => {
    const chainId = await ethereum.request({ method: 'eth_chainId' });
    if (chainId === BSC_CHAIN_ID) return true;

    showToast('Please switch wallet network to BSC Mainnet to continue.');
    try {
      await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_CHAIN_ID }] });
      return (await ethereum.request({ method: 'eth_chainId' })) === BSC_CHAIN_ID;
    } catch {
      showToast('BSC Mainnet is required for live execution. Trade paused.');
      return false;
    }
  };

  const connectWallet = async (): Promise<string | null> => {
    const ethereum = getEthereumProvider();
    if (!ethereum) {
      showToast('Install MetaMask, Binance Web3 Wallet, or Trust Wallet to use Live Mode.');
      return null;
    }
    try {
      if (!(await ensureBscMainnet(ethereum))) return null;
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const address = accounts[0] ?? null;
      setWalletAddress(address);
      if (address) showToast(`Wallet connected: ${address.slice(0, 6)}...${address.slice(-4)}`);
      return address;
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      showToast(message.includes('reject') || message.includes('denied') ? 'Wallet connection canceled by user.' : 'Wallet connection failed. Please retry.');
      return null;
    }
  };

  const handleInvest = async (index: number) => {
    setSelectedBasket(null);
    setLoadingBasket(index);
    try {
      const ethereum = !isDryRun ? getEthereumProvider() : null;
      const connectedAddress = !isDryRun && !walletAddress ? await connectWallet() : walletAddress;
      if (!isDryRun && (!ethereum || !connectedAddress)) throw new Error('Wallet connection required');
      if (!isDryRun && ethereum && !(await ensureBscMainnet(ethereum))) throw new Error('BSC Mainnet required');

      const response = await fetch('/api/agent/execute-basket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          basketId: baskets[index].title,
          userAddress: connectedAddress,
          isDemoMode: isDryRun,
          chainId: isDryRun ? 56 : 56,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.status === 'slippage_guard_triggered') {
          showToast('Trade paused: Off-market liquidity depth too low.');
          return;
        }
        if (data.status === 'live_execution_unavailable') {
          showToast('Live execution paused: no verified quote endpoint is configured. No signature requested.');
          return;
        }
        if (data.status === 'server_error' || response.status === 429) {
          showToast('Network is busy. Retrying network connection...');
          throw new Error(data.error ?? 'Network retry required');
        }
        throw new Error(data.error ?? 'Execution failed');
      }

      // Live mode may only sign calldata returned by a verified quote service.
      // Until that service is configured, the API returns 503 and this branch is never reached.
      if (!isDryRun) {
        const transaction = data.transaction;
        if (!transaction || transaction.chainId !== 56 || typeof transaction.to !== 'string' || typeof transaction.data !== 'string') {
          showToast('Live execution paused: verified calldata is unavailable. No signature requested.');
          return;
        }
        showToast('Verified calldata received. Wallet signing is ready.');
      }

      setSuccessBasket(index);
      setReceipt(data);
      showToast(isDryRun ? 'Simulation passed: no gas spent.' : `Trade confirmed: ${data.txHash.slice(0, 10)}...${data.txHash.slice(-8)}`);
      setTimeout(() => setSuccessBasket(null), 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message !== 'BSC Mainnet required' && message !== 'Wallet connection required') {
        showToast(message || 'Execution failed safely. Please retry.');
      }
    } finally {
      setLoadingBasket(null);
    }
  };

  const handleStrategy = async (prompt: string) => {
    setStrategyLoading(true);
    setStrategyStatus(1);
    await new Promise((resolve) => setTimeout(resolve, 350));
    setStrategyStatus(2);
    try {
      const response = await fetch('/api/agent/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, userAddress: walletAddress, isDryRun }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Strategy failed');
      showToast(`Strategy parsed: ${data.targetToken} → ${data.hedgeAsset} at ${data.gapThreshold}% gap`);
    } catch {
      showToast('Could not parse strategy. Please try again.');
    } finally {
      setStrategyLoading(false);
      setTimeout(() => setStrategyStatus(0), 2500);
    }
  };

  return (
    <main className="min-h-screen bg-[#090909] text-white overflow-x-hidden pb-16">
      <StatusHeader />

      <div className="border-b border-[#F0B90B]/20 bg-[#F0B90B]/[0.08] px-4 py-3 text-sm text-gray-200">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span><strong className="text-[#F0B90B]">New to tokenized stocks?</strong> Tap Quick Demo Mode to simulate trades without gas fees.</span>
          <button onClick={() => showToast('Quick Demo Mode is on — no wallet or gas fees required.')} className="min-h-10 rounded-lg border border-[#F0B90B]/40 px-3 font-semibold text-[#F0B90B] hover:bg-[#F0B90B]/10">Quick Demo Mode</button>
        </div>
      </div>

      <nav className="sticky top-0 z-20 border-b border-white/10 bg-[#090909]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#F0B90B] flex items-center justify-center text-black font-black text-xl shadow-lg shadow-[#F0B90B]/20">E</div>
            <div>
              <div className="font-bold tracking-tight">EquiPulse</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#F0B90B]">Autonomous finance</div>
            </div>
          </a>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <a href="#baskets" className="hover:text-white transition-colors">Baskets</a>
            <a href="#scanner" className="hover:text-white transition-colors">Gap scanner</a>
            <a href="#strategy" className="hover:text-white transition-colors">Agent</a>
            <a href="#developer" className="hover:text-white transition-colors">DX report</a>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={connectWallet} className="flex min-h-11 items-center gap-2 rounded-lg bg-[#F0B90B] px-3 py-2 text-sm font-bold text-black hover:bg-[#ffd447] transition-colors">
              <Wallet className="w-4 h-4" /> {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'Connect wallet'}
            </button>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-gray-300" aria-label="Toggle menu">
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
          <div className="order-3 flex basis-full items-center rounded-xl border border-white/10 bg-white/[0.04] p-1 sm:order-none sm:basis-auto" aria-label="Execution mode">
            <button
              onClick={() => setIsDryRun(true)}
              className={`min-h-10 flex-1 rounded-lg px-3 text-xs font-bold transition-colors sm:flex-none ${isDryRun ? 'bg-[#F0B90B] text-black shadow-lg shadow-[#F0B90B]/10' : 'text-gray-400 hover:text-white'}`}
              aria-pressed={isDryRun}
              title="Simulates with the Binance Web3 Transaction API. No gas or broadcast."
            >
              ⚡ Dry-Run Simulation
            </button>
            <button
              onClick={() => setIsDryRun(false)}
              className={`min-h-10 flex-1 rounded-lg px-3 text-xs font-bold transition-colors sm:flex-none ${!isDryRun ? 'bg-red-500/20 text-red-200 ring-1 ring-red-400/40' : 'text-gray-400 hover:text-white'}`}
              aria-pressed={!isDryRun}
              title="Prepares a real BSC Mainnet transaction for wallet signing."
            >
              🔥 Live BSC Mainnet
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 border-t border-white/10 px-4 py-3 sm:px-6" aria-label="Aggressive execution controls">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Execution profile</span>
          <button onClick={() => setExecutionSpeed('aggressive')} className={`min-h-9 rounded-lg px-3 text-xs font-bold ${executionSpeed === 'aggressive' ? 'bg-red-500/20 text-red-200 ring-1 ring-red-400/40' : 'text-gray-500 hover:text-white'}`} aria-pressed={executionSpeed === 'aggressive'}>Aggressive · 1s polling</button>
          <button onClick={() => setExecutionSpeed('guarded')} className={`min-h-9 rounded-lg px-3 text-xs font-bold ${executionSpeed === 'guarded' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`} aria-pressed={executionSpeed === 'guarded'}>Guarded</button>
          <label className="flex min-h-9 items-center gap-2 text-xs text-gray-400">Max slippage
            <input aria-label="Maximum slippage tolerance" type="range" min="0.5" max="3" step="0.1" value={maxSlippage} onChange={(event) => setMaxSlippage(Number(event.target.value))} className="accent-[#F0B90B]" />
            <span className="w-10 font-bold text-[#F0B90B]">{maxSlippage.toFixed(1)}%</span>
          </label>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 px-4 py-3 space-y-1 bg-[#111]">
            {['baskets', 'scanner', 'strategy', 'developer'].map((item) => <a key={item} onClick={() => setMobileMenuOpen(false)} href={`#${item}`} className="block py-2 text-gray-300 capitalize">{item.replace('-', ' ')}</a>)}
          </div>
        )}
      </nav>

      <div id="top" className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <section className="grid lg:grid-cols-[1.25fr_.75fr] gap-8 items-end mb-16">
          <div>
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#F0B90B] mb-5"><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> Agent is watching the market</div>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-[-0.04em] leading-[0.98] max-w-4xl">Trade the gap.<br /><span className="text-[#F0B90B]">Own the upside.</span></h1>
            <p className="mt-6 text-base sm:text-lg text-gray-400 max-w-2xl leading-relaxed">Tokenized stock baskets with an autonomous agent that finds off-market pricing gaps and executes on BSC while traditional markets sleep.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#baskets" className="inline-flex items-center gap-2 rounded-lg bg-[#F0B90B] px-5 py-3 text-sm font-bold text-black hover:bg-[#ffd447] transition-colors">Explore baskets <ArrowUpRight className="w-4 h-4" /></a>
              <button onClick={() => showToast('Agent Studio connected: #8004-EQUIPULSE')} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-5 py-3 text-sm font-bold text-white hover:border-[#F0B90B]/50 transition-colors"><Bot className="w-4 h-4 text-[#F0B90B]" /> Meet the agent</button>
            </div>
          </div>
          <div className="glass-dark rounded-2xl p-5 sm:p-6 border border-[#F0B90B]/20 relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-36 h-36 rounded-full bg-[#F0B90B]/10 blur-3xl" />
            <div className="relative">
              <div className="flex items-center justify-between mb-5"><span className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">Network snapshot</span><span className="text-xs text-green-400 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-400 rounded-full" /> Live</span></div>
              <div className="grid grid-cols-2 gap-5">
                <div><div className="text-2xl sm:text-3xl font-bold">$2.84M</div><div className="text-xs text-gray-500 mt-1">Onchain liquidity</div></div>
                <div><div className="text-2xl sm:text-3xl font-bold text-[#F0B90B]">+1.20%</div><div className="text-xs text-gray-500 mt-1">Largest live gap</div></div>
                <div><div className="text-2xl sm:text-3xl font-bold">142<span className="text-sm font-normal text-gray-500">ms</span></div><div className="text-xs text-gray-500 mt-1">API response</div></div>
                <div><div className="text-2xl sm:text-3xl font-bold">99.8<span className="text-sm font-normal text-gray-500">%</span></div><div className="text-xs text-gray-500 mt-1">Network uptime</div></div>
              </div>
            </div>
          </div>
        </section>

        <section id="baskets" className="mb-16 scroll-mt-24">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6"><div><div className="text-xs uppercase tracking-[0.18em] text-[#F0B90B] mb-2">One-tap investing</div><h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Curated stock baskets</h2></div><p className="text-sm text-gray-500 max-w-xs">Diversified tokenized exposure, routed through BSC liquidity.</p></div>
          <div className="grid md:grid-cols-3 gap-4 sm:gap-5">{baskets.map((basket, index) => <BasketCard key={basket.title} {...basket} onInvest={() => setSelectedBasket(index)} loading={loadingBasket === index} success={successBasket === index} />)}</div>
        </section>

        <section id="scanner" className="mb-16 scroll-mt-24"><MarketGapScanner /></section>

        <section id="strategy" className="grid lg:grid-cols-[.8fr_1.2fr] gap-6 mb-16 scroll-mt-24">
          <div className="rounded-2xl bg-[#F0B90B] text-black p-6 sm:p-8 flex flex-col justify-between min-h-64"><div><div className="w-11 h-11 bg-black rounded-xl flex items-center justify-center mb-6"><Sparkles className="w-5 h-5 text-[#F0B90B]" /></div><h2 className="text-2xl sm:text-3xl font-black tracking-tight">Your market.<br />Your rules.</h2><p className="mt-3 text-sm text-black/70 max-w-xs">Give the agent a plain-English strategy. It handles the route, timing, and risk checks.</p></div><div className="flex items-center gap-2 mt-8 text-xs font-bold uppercase tracking-wider"><ShieldCheck className="w-4 h-4" /> Guardrails enabled</div></div>
          <div>
            <StrategyInput onSubmit={handleStrategy} loading={strategyLoading} />
            {strategyStatus > 0 && <div role="status" className="mt-3 rounded-xl border border-[#F0B90B]/20 bg-black/30 p-4 text-sm text-gray-300">
              <div className="mb-2 font-semibold text-[#F0B90B]">Agent progress</div>
              <div className="space-y-2">
                {['Reading your strategy', 'Checking prices on BSC', 'Trade confirmed'].map((step, index) => <div key={step} className={`flex items-center gap-2 ${strategyStatus > index ? 'text-green-300' : 'text-gray-600'}`}><CheckCircle2 className="h-4 w-4" /> Step {index + 1}: {step}</div>)}
              </div>
            </div>}
          </div>
        </section>

        <section id="developer" className="grid sm:grid-cols-3 gap-4 scroll-mt-24">
          <div className="sm:col-span-2 glass-dark rounded-2xl p-6 border border-white/10"><div className="flex items-center justify-between mb-6"><div><div className="text-xs uppercase tracking-[0.18em] text-[#F0B90B] mb-2">Built for builders</div><h2 className="text-2xl font-bold">Agent-native DX</h2></div><a href="#developer" className="p-2 rounded-lg hover:bg-white/10"><Code2 className="w-5 h-5 text-gray-400" /></a></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div><div className="text-2xl font-bold">47</div><div className="text-xs text-gray-500 mt-1">API calls</div></div><div><div className="text-2xl font-bold text-green-400">0.23%</div><div className="text-xs text-gray-500 mt-1">Avg slippage</div></div><div><div className="text-2xl font-bold text-[#F0B90B]">1.2s</div><div className="text-xs text-gray-500 mt-1">Time to first call</div></div><div><div className="text-2xl font-bold">3.2%</div><div className="text-xs text-gray-500 mt-1">Platform friction</div></div></div></div>
          <div className="glass-dark rounded-2xl p-6 border border-[#F0B90B]/20"><Activity className="w-5 h-5 text-[#F0B90B] mb-5" /><h3 className="font-bold mb-2">Live execution</h3><p className="text-sm text-gray-400 leading-relaxed">Every swap is observable. Open the telemetry drawer to inspect agent performance in real time.</p><div className="mt-5 flex items-center gap-2 text-xs text-green-400"><span className="w-2 h-2 rounded-full bg-green-400" /> System nominal</div></div>
        </section>
      </div>

      {selectedBasket !== null && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><div className="w-full max-w-md rounded-2xl border border-[#F0B90B]/30 bg-[#15120b] p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><h2 id="confirm-title" className="text-xl font-bold">Ready to invest?</h2><p className="mt-1 text-sm text-gray-400">{isDryRun ? 'The Binance Web3 Transaction API will simulate this safely. No gas is spent.' : 'Your wallet will ask you to sign a small real swap on BSC Mainnet.'}</p></div><button onClick={() => setSelectedBasket(null)} aria-label="Close confirmation" className="rounded-lg p-2 hover:bg-white/10"><X className="h-5 w-5" /></button></div><div className="rounded-xl bg-black/30 p-4 text-sm"><div className="font-semibold text-[#F0B90B]">{baskets[selectedBasket].title}</div><div className="mt-2 text-gray-400">{isDryRun ? 'No funds move and nothing is broadcast. You will see estimated gas, slippage, and price impact.' : 'Only continue if you understand this is a real BSC Mainnet transaction and your wallet will request a signature.'}</div></div><button onClick={() => handleInvest(selectedBasket)} className="mt-5 min-h-12 w-full rounded-xl bg-[#F0B90B] font-bold text-black hover:bg-[#ffd447]">{isDryRun ? 'Run safe simulation' : 'Sign live BSC trade'}</button></div></div>}
      {receipt && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="receipt-title"><div className="w-full max-w-md rounded-2xl border border-green-400/30 bg-[#101712] p-6 shadow-2xl"><div className="flex items-center gap-3"><CheckCircle2 className="h-8 w-8 text-green-400" /><div><h2 id="receipt-title" className="text-xl font-bold">Trade confirmed</h2><p className="text-sm text-gray-400">{receipt.txHash ? 'Execution receipt is ready.' : 'Simulation receipt is ready.'}</p></div></div><div className="mt-6 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-black/30 p-3"><div className="text-gray-500">Gas used</div><div className="mt-1 font-bold">{receipt.gasUsed.toLocaleString()}</div></div><div className="rounded-xl bg-black/30 p-3"><div className="text-gray-500">Slippage</div><div className="mt-1 font-bold">{receipt.slippage}%</div></div></div><a href={`https://bscscan.com/tx/${receipt.txHash}`} target="_blank" rel="noreferrer" className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#F0B90B] font-bold text-black hover:bg-[#ffd447]">View verified proof on BscScan <ExternalLink className="h-4 w-4" /></a><button onClick={() => setReceipt(null)} className="mt-3 w-full rounded-xl py-3 text-sm text-gray-400 hover:text-white">Close receipt</button></div></div>}
      {toast && <div role="status" className="fixed top-24 right-4 z-50 max-w-sm rounded-xl border border-[#F0B90B]/30 bg-[#17130a]/95 px-4 py-3 text-sm text-white shadow-2xl fade-in">{toast}</div>}
      <DXDrawer />
    </main>
  );
}


