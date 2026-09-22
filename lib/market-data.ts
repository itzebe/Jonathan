import 'server-only';

import { BSC_RPC_URL } from '@/lib/agent-config';

/**
 * Live market-data helpers (server-only).
 *
 * WHY THIS EXISTS
 * The original implementation read the BNB/USD price from api.binance.com. That host returns
 * HTTP 451 ("restricted location") from Vercel's US serverless regions, so the price ALWAYS fell
 * back to a hardcoded 580 — which is both stale and materially wrong (real BNB ≈ $780+). Because
 * requiredBnb = usdNotional / bnbPrice, a wrong price makes the wallet sign for the wrong amount
 * of BNB. This module fetches a genuinely-live price from providers that are reachable from US
 * regions and only falls back to a static value when every provider fails.
 */

export type PriceStatus = 'LIVE' | 'FALLBACK';

export interface BnbPriceResult {
  price: number;
  status: PriceStatus;
  /** Which provider produced the live price, or 'static-fallback' when all failed. */
  source: string;
  isFallbackPrice: boolean;
}

// Last-resort static price used ONLY when every live provider is unreachable. Clearly reported
// as FALLBACK so no caller can mistake it for a live quote.
const STATIC_FALLBACK_BNB_USD = 780;

type PriceProvider = {
  name: string;
  url: string;
  parse: (json: unknown) => number | null;
};

// Providers reachable from US serverless regions (Binance's own API is geo-blocked there).
const PRICE_PROVIDERS: PriceProvider[] = [
  {
    name: 'coingecko',
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd',
    parse: (json) => {
      const price = (json as { binancecoin?: { usd?: number } })?.binancecoin?.usd;
      return typeof price === 'number' ? price : null;
    },
  },
  {
    name: 'binance-us',
    url: 'https://api.binance.us/api/v3/ticker/price?symbol=BNBUSDT',
    parse: (json) => {
      const price = Number((json as { price?: string })?.price);
      return Number.isFinite(price) ? price : null;
    },
  },
  {
    name: 'coinbase',
    url: 'https://api.coinbase.com/v2/prices/BNB-USD/spot',
    parse: (json) => {
      const price = Number((json as { data?: { amount?: string } })?.data?.amount);
      return Number.isFinite(price) ? price : null;
    },
  },
];

async function fetchFromProvider(provider: PriceProvider, timeoutMs: number): Promise<number | null> {
  try {
    const response = await fetch(provider.url, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const json = await response.json();
    const price = provider.parse(json);
    return price !== null && price > 0 ? price : null;
  } catch {
    return null;
  }
}

/**
 * Returns a genuinely-live BNB/USD price. Providers are queried in parallel and the first valid
 * response wins. Only when every provider fails do we return the static fallback, flagged FALLBACK.
 */
export async function getBnbUsdPrice(timeoutMs = 3000): Promise<BnbPriceResult> {
  const attempts = PRICE_PROVIDERS.map(async (provider) => {
    const price = await fetchFromProvider(provider, timeoutMs);
    if (price === null) throw new Error(`${provider.name} unavailable`);
    return { price, source: provider.name };
  });

  try {
    const winner = await Promise.any(attempts);
    return { price: winner.price, status: 'LIVE', source: winner.source, isFallbackPrice: false };
  } catch {
    return {
      price: STATIC_FALLBACK_BNB_USD,
      status: 'FALLBACK',
      source: 'static-fallback',
      isFallbackPrice: true,
    };
  }
}

export interface RpcLatencyResult {
  latencyMs: number;
  healthy: boolean;
  rpcUrl: string;
  status: 'LIVE' | 'UNAVAILABLE';
}

/**
 * Measures a REAL round trip to the BSC RPC (eth_chainId). Unlike the old Binance probe, this
 * host is reachable from US regions, so the returned latency is a genuine on-chain measurement.
 * Confirms the node reports chain 0x38 (BSC Mainnet, 56) before treating it as healthy.
 */
export async function measureBscRpcLatencyMs(timeoutMs = 2500): Promise<RpcLatencyResult> {
  const startedAt = Date.now();
  try {
    const response = await fetch(BSC_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    const latencyMs = Date.now() - startedAt;
    const json = (await response.json()) as { result?: string };
    const healthy = response.ok && json?.result === '0x38';
    return { latencyMs, healthy, rpcUrl: BSC_RPC_URL, status: healthy ? 'LIVE' : 'UNAVAILABLE' };
  } catch {
    return { latencyMs: Date.now() - startedAt, healthy: false, rpcUrl: BSC_RPC_URL, status: 'UNAVAILABLE' };
  }
}
