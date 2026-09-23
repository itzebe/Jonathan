import 'server-only';
import crypto from 'crypto';

/**
 * Binance Web3 API — authenticated client (server-only).
 *
 * Implements the official authentication scheme:
 *   Base URL:  https://web3.binance.com/build
 *   Headers:   X-OC-APIKEY, X-OC-TIMESTAMP (ISO 8601 ms), X-OC-SIGN (HMAC-SHA256 Base64)
 *   Pre-hash:  timestamp + METHOD + requestPath + body
 *   requestPath MUST include the /build prefix + raw query string
 *
 * Docs: https://web3.binance.com/en/dev-docs/authentication
 *
 * SECURITY: API key and secret are read from env and NEVER sent to the client.
 * The secret is used only for HMAC signing — it is never logged or returned.
 */

const BASE_URL = 'https://web3.binance.com/build';
const BUILD_PREFIX = '/build';

export type DataSourceStatus = 'LIVE' | 'FALLBACK' | 'UNAVAILABLE' | 'ERROR';

export interface OCResult<T> {
  code: number;
  msg: string;
  data: T;
  timestamp: number;
  success: boolean;
}

export class BinanceWeb3Error extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(`Binance Web3 API error ${code}: ${message}`);
    this.name = 'BinanceWeb3Error';
  }
}

function getApiKey(): string | null {
  return process.env.BINANCE_WEB3_API_KEY?.trim() || null;
}

function getSecretKey(): string | null {
  return process.env.BINANCE_WEB3_SECRET_KEY?.trim() || null;
}

/** True when both API key and secret key are configured. */
export function isBinanceWeb3Configured(): boolean {
  return getApiKey() !== null && getSecretKey() !== null;
}

/**
 * Build the HMAC-SHA256 signature for a request.
 * preHash = timestamp + method + requestPath + body
 * requestPath includes the /build prefix and the raw query string.
 */
function sign(timestamp: string, method: string, requestPath: string, body: string): string {
  const secret = getSecretKey();
  if (!secret) throw new Error('BINANCE_WEB3_SECRET_KEY is not configured');
  const preHash = timestamp + method + requestPath + body;
  return crypto.createHmac('sha256', secret).update(preHash, 'utf8').digest('base64');
}

/** Build query string with raw URL encoding (spaces as %20, not +). */
function buildQueryString(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`).join('&');
}

interface RequestOptions {
  method: 'GET' | 'POST';
  path: string; // without /build prefix, e.g. "/api/v1/dex/aggregator/quote"
  params?: Record<string, string | undefined>; // query params for GET
  body?: Record<string, unknown>; // JSON body for POST
  timeoutMs?: number;
}

/**
 * Make an authenticated request to the Binance Web3 API.
 * Returns the parsed OCResult, or throws BinanceWeb3Error on non-zero code.
 */
async function request<T>(opts: RequestOptions): Promise<OCResult<T>> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('BINANCE_WEB3_API_KEY is not configured');

  const method = opts.method;
  const queryString = opts.params ? buildQueryString(opts.params) : '';
  const fullPath = `${opts.path}${queryString}`; // path without /build, plus query
  const requestPath = `${BUILD_PREFIX}${fullPath}`; // signed path includes /build
  const bodyStr = opts.body ? JSON.stringify(opts.body) : '';

  const timestamp = new Date().toISOString();
  const signature = sign(timestamp, method, requestPath, bodyStr);

  const url = `${BASE_URL}${fullPath}`;
  const headers: Record<string, string> = {
    'X-OC-APIKEY': apiKey,
    'X-OC-TIMESTAMP': timestamp,
    'X-OC-SIGN': signature,
  };
  if (opts.body) headers['Content-Type'] = 'application/json';

  const response = await fetch(url, {
    method,
    headers,
    body: opts.body ? bodyStr : undefined,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
    cache: 'no-store',
  });

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Binance Web3 API returned non-JSON response (HTTP ${response.status})`);
  }

  const result = (await response.json()) as OCResult<T>;

  if (!result.success || result.code !== 0) {
    throw new BinanceWeb3Error(result.code, result.msg);
  }

  return result;
}

// ─── Trading API ─────────────────────────────────────────────────────────────

export interface QuoteRoute {
  quoteId: string;
  fromToken: { contractAddress: string; symbol: string; decimals: number };
  toToken: { contractAddress: string; symbol: string; decimals: number };
  toTokenAmount: string;
  fromTokenAmount: string;
  executionMode: 'SWAP' | 'RFQ';
  vendorName?: string;
  approveTarget?: string;
  // Additional fields may be present; we capture what we need.
}

export interface QuoteResponse {
  routes: QuoteRoute[];
  quoteResponseMs: number;
}

/**
 * GET /api/v1/dex/aggregator/quote
 * Get an aggregated swap quote across DEX vendors.
 */
export async function getQuote(params: {
  binanceChainId: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  userWalletAddress?: string;
  slippagePercent?: string;
  autoSlippage?: boolean;
  feePercent?: string;
  feeSource?: string;
}): Promise<QuoteResponse> {
  const startedAt = Date.now();
  const result = await request<{ quoteId?: string; toTokenAmount?: string; fromTokenAmount?: string; executionMode?: string; vendorName?: string; approveTarget?: string; fromToken?: Record<string, unknown>; toToken?: Record<string, unknown>; routerList?: unknown[]; routerResult?: Record<string, unknown> } | unknown[]>({
    method: 'GET',
    path: '/api/v1/dex/aggregator/quote',
    params: {
      binanceChainId: params.binanceChainId,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      amount: params.amount,
      userWalletAddress: params.userWalletAddress,
      slippagePercent: params.slippagePercent,
      autoSlippage: params.autoSlippage ? 'true' : undefined,
      feePercent: params.feePercent,
      feeSource: params.feeSource,
    },
    timeoutMs: 8000,
  });

  const quoteResponseMs = Date.now() - startedAt;

  // The quote response may be a single route object or an array of routes.
  // Normalize to a routes array.
  const data = result.data;
  let routes: QuoteRoute[] = [];

  if (Array.isArray(data)) {
    routes = data.map((r) => normalizeRoute(r as Record<string, unknown>));
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.routerList)) {
      routes = (obj.routerList as Record<string, unknown>[]).map((r) => normalizeRoute(r));
    } else if (obj.routerResult && typeof obj.routerResult === 'object') {
      routes = [normalizeRoute({ ...obj, ...obj.routerResult as Record<string, unknown> })];
    } else {
      routes = [normalizeRoute(obj)];
    }
  }

  return { routes, quoteResponseMs };
}

function normalizeRoute(r: Record<string, unknown>): QuoteRoute {
  const fromToken = r.fromToken as Record<string, unknown> | undefined;
  const toToken = r.toToken as Record<string, unknown> | undefined;
  return {
    quoteId: String(r.quoteId ?? ''),
    fromToken: {
      contractAddress: String(fromToken?.contractAddress ?? r.fromTokenAddress ?? ''),
      symbol: String(fromToken?.symbol ?? ''),
      decimals: Number(fromToken?.decimals ?? 18),
    },
    toToken: {
      contractAddress: String(toToken?.contractAddress ?? r.toTokenAddress ?? ''),
      symbol: String(toToken?.symbol ?? ''),
      decimals: Number(toToken?.decimals ?? 18),
    },
    toTokenAmount: String(r.toTokenAmount ?? ''),
    fromTokenAmount: String(r.fromTokenAmount ?? r.amount ?? ''),
    executionMode: (String(r.executionMode ?? 'SWAP').toUpperCase() as 'SWAP' | 'RFQ'),
    vendorName: r.vendorName ? String(r.vendorName) : undefined,
    approveTarget: r.approveTarget ? String(r.approveTarget) : undefined,
  };
}

/**
 * GET /api/v1/dex/aggregator/swap
 * Build the unsigned swap transaction for a given quoteId.
 */
export async function getSwapTx(params: {
  quoteId: string;
  binanceChainId: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  userWalletAddress: string;
  slippagePercent?: string;
  autoSlippage?: boolean;
}): Promise<{
  tx: {
    from: string;
    to: string;
    data: string;
    value: string;
    gas: string;
    gasPrice?: string;
    maxPriorityFeePerGas?: string;
  };
  executionMode: string;
}> {
  const result = await request<Record<string, unknown>>({
    method: 'GET',
    path: '/api/v1/dex/aggregator/swap',
    params: {
      quoteId: params.quoteId,
      binanceChainId: params.binanceChainId,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      amount: params.amount,
      userWalletAddress: params.userWalletAddress,
      slippagePercent: params.slippagePercent,
      autoSlippage: params.autoSlippage ? 'true' : undefined,
    },
    timeoutMs: 8000,
  });

  const data = result.data as Record<string, unknown>;
  const tx = (data.tx ?? data) as Record<string, unknown>;
  return {
    tx: {
      from: String(tx.from ?? ''),
      to: String(tx.to ?? ''),
      data: String(tx.data ?? '0x'),
      value: String(tx.value ?? '0x0'),
      gas: String(tx.gas ?? '0x0'),
      gasPrice: tx.gasPrice ? String(tx.gasPrice) : undefined,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? String(tx.maxPriorityFeePerGas) : undefined,
    },
    executionMode: String(data.executionMode ?? 'SWAP'),
  };
}

/**
 * GET /api/v1/dex/aggregator/quote-and-swap
 * Flash API: get quote and swap tx in one call (latency-sensitive).
 */
export async function getQuoteAndSwap(params: {
  binanceChainId: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  userWalletAddress: string;
  slippagePercent?: string;
  autoSlippage?: boolean;
  vendor?: string;
}): Promise<{ quote: QuoteRoute; tx: Record<string, unknown>; quoteResponseMs: number }> {
  const startedAt = Date.now();
  const result = await request<Record<string, unknown>>({
    method: 'GET',
    path: '/api/v1/dex/aggregator/quote-and-swap',
    params: {
      binanceChainId: params.binanceChainId,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      amount: params.amount,
      userWalletAddress: params.userWalletAddress,
      slippagePercent: params.slippagePercent,
      autoSlippage: params.autoSlippage ? 'true' : undefined,
      vendor: params.vendor,
    },
    timeoutMs: 8000,
  });
  const quoteResponseMs = Date.now() - startedAt;
  const data = result.data as Record<string, unknown>;
  return {
    quote: normalizeRoute(data),
    tx: (data.tx ?? {}) as Record<string, unknown>,
    quoteResponseMs,
  };
}

// ─── Market API ──────────────────────────────────────────────────────────────

/**
 * POST /api/v1/dex/market/price
 * Get the latest USD price for a token.
 */
export async function getTokenPrice(params: {
  binanceChainId: string;
  tokenContractAddress: string;
}): Promise<{ price: number; time: number; status: DataSourceStatus }> {
  try {
    const result = await request<Array<{ price: string; time: number }>>({
      method: 'POST',
      path: '/api/v1/dex/market/price',
      body: {
        binanceChainId: params.binanceChainId,
        tokenContractAddress: params.tokenContractAddress,
      },
      timeoutMs: 5000,
    });
    const entry = result.data?.[0];
    if (!entry) return { price: 0, time: 0, status: 'UNAVAILABLE' };
    return { price: Number(entry.price), time: entry.time, status: 'LIVE' };
  } catch {
    return { price: 0, time: 0, status: 'ERROR' };
  }
}

export interface TokenTradingInfo {
  price: number;
  marketCap: number;
  priceChange24H: number;
  volume24H: number;
  status: DataSourceStatus;
}

/**
 * POST /api/v1/dex/market/price-info
 * Get token price + trading data (volume, market cap, price changes).
 */
export async function getTokenTradingInfo(params: {
  binanceChainId: string;
  tokenContractAddress: string;
}): Promise<TokenTradingInfo> {
  try {
    const result = await request<Array<Record<string, string | number>>>({
      method: 'POST',
      path: '/api/v1/dex/market/price-info',
      body: {
        binanceChainId: params.binanceChainId,
        tokenContractAddress: params.tokenContractAddress,
      },
      timeoutMs: 5000,
    });
    const entry = result.data?.[0];
    if (!entry) return { price: 0, marketCap: 0, priceChange24H: 0, volume24H: 0, status: 'UNAVAILABLE' };
    return {
      price: Number(entry.price ?? 0),
      marketCap: Number(entry.marketCap ?? 0),
      priceChange24H: Number(entry.priceChange24H ?? 0),
      volume24H: Number(entry.volume24H ?? 0),
      status: 'LIVE',
    };
  } catch {
    return { price: 0, marketCap: 0, priceChange24H: 0, volume24H: 0, status: 'ERROR' };
  }
}

// ─── Transaction API ─────────────────────────────────────────────────────────

/**
 * GET /api/v1/dex/aggregator/history
 * Query DEX swap transaction status by txHash.
 */
export async function getTransactionStatus(params: {
  binanceChainId: string;
  txHash: string;
}): Promise<{ status: string; data: Record<string, unknown> | null }> {
  try {
    const result = await request<Record<string, unknown> | null>({
      method: 'GET',
      path: '/api/v1/dex/aggregator/history',
      params: {
        binanceChainId: params.binanceChainId,
        txHash: params.txHash,
      },
      timeoutMs: 5000,
    });
    return { status: 'LIVE', data: result.data };
  } catch (e) {
    if (e instanceof BinanceWeb3Error) return { status: 'ERROR', data: null };
    return { status: 'UNAVAILABLE', data: null };
  }
}

// ─── Wallet API ──────────────────────────────────────────────────────────────

/**
 * POST /api/v1/wallet/balance
 * Get wallet token balances for a given address.
 */
export async function getWalletBalance(params: {
  binanceChainId: string;
  address: string;
}): Promise<{ balances: Array<{ token: string; balance: string; symbol: string }>; status: DataSourceStatus }> {
  try {
    const result = await request<unknown[]>({
      method: 'POST',
      path: '/api/v1/wallet/balance',
      body: {
        binanceChainId: params.binanceChainId,
        address: params.address,
      },
      timeoutMs: 5000,
    });
    const balances = (result.data ?? []).map((entry) => {
      const e = entry as Record<string, unknown>;
      return {
        token: String(e.token ?? e.contractAddress ?? ''),
        balance: String(e.balance ?? e.amount ?? '0'),
        symbol: String(e.symbol ?? ''),
      };
    });
    return { balances, status: 'LIVE' };
  } catch {
    return { balances: [], status: 'ERROR' };
  }
}
