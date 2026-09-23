import 'server-only';

/**
 * Tokenized stock registry — xStocks on BSC Mainnet.
 *
 * xStocks are tokenized equities issued by Backed Finance, deployed on BNB Smart Chain.
 * They trade via regular AMM liquidity pools (executionMode = SWAP), making them the simplest
 * tokenized-stock class to integrate with the Binance Web3 Trading API.
 *
 * Unlike Ondo (RFQ) and BStock (mixed SWAP+RFQ), xStocks follow the same flow as regular
 * crypto tokens: GET /quote → GET /swap → sign → broadcast.
 *
 * Contract addresses verified on BscScan (BEP-20, 18 decimals):
 *   NVDAx: 0xc845b2894dBddd03858fd2D643B4eF725fE0849d
 *   AAPLx: 0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a
 *   TSLAx: 0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0
 *
 * Docs: https://web3.binance.com/en/dev-docs/products/trading-api/introduction
 */

export interface TokenizedStock {
  /** On-chain contract address (BSC, checksummed). */
  address: `0x${string}`;
  /** Display symbol, e.g. "NVDAx". */
  symbol: string;
  /** Full company/ETF name. */
  name: string;
  /** Ticker of the underlying equity, e.g. "NVDA". */
  underlying: string;
  /** Token type for the Binance Web3 Trading API. xStocks = type 2 (SWAP mode). */
  tokenType: 2;
  /** Decimals (xStocks are BEP-20 with 18 decimals). */
  decimals: number;
}

/**
 * The native BNB token placeholder used by the Binance Web3 API.
 * Use this as fromTokenAddress when swapping BNB → token.
 */
export const NATIVE_BNB = '0xEeeeeEeeeEeEeeEeEeeEEEeeeeEeeeeeeeEEeE' as const;

/** Wrapped BNB on BSC. */
export const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as const;

/** USDC on BSC — the primary stablecoin for cross-asset swaps (stablecoin → xStock). */
export const USDC = '0x8AC76a51cc950d9822D68b83E1ad97B32cd580d' as const;

/** BSC-USD (USDT) on BSC — alternative stablecoin. */
export const USDT = '0x55d398326f99059fF775485246999027B3197955' as const;

/** Binance Web3 chain ID for BSC Mainnet. */
export const BINANCE_CHAIN_ID = '56' as const;

/**
 * Allowlisted xStock tokens on BSC Mainnet.
 * These are the only tokenized equities the agent is permitted to trade.
 */
export const XSTOCKS: TokenizedStock[] = [
  {
    address: '0xc845b2894dBddd03858fd2D643B4eF725fE0849d',
    symbol: 'NVDAx',
    name: 'NVIDIA xStock',
    underlying: 'NVDA',
    tokenType: 2,
    decimals: 18,
  },
  {
    address: '0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a',
    symbol: 'AAPLx',
    name: 'Apple xStock',
    underlying: 'AAPL',
    tokenType: 2,
    decimals: 18,
  },
  {
    address: '0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0',
    symbol: 'TSLAx',
    name: 'Tesla xStock',
    underlying: 'TSLA',
    tokenType: 2,
    decimals: 18,
  },
];

/** Map of underlying ticker → xStock token, for prompt parsing. */
export const XSTOCK_BY_TICKER: Record<string, TokenizedStock> = Object.fromEntries(
  XSTOCKS.map((s) => [s.underlying.toUpperCase(), s]),
);

/** Map of contract address (lowercase) → xStock token, for validation. */
export const XSTOCK_BY_ADDRESS: Record<string, TokenizedStock> = Object.fromEntries(
  XSTOCKS.map((s) => [s.address.toLowerCase(), s]),
);

/** Check if an address is an allowlisted xStock token. */
export function isAllowlistedXStock(address: string): boolean {
  return address.toLowerCase() in XSTOCK_BY_ADDRESS;
}

/** Get the xStock token for a given ticker, or null. */
export function getXStockByTicker(ticker: string): TokenizedStock | null {
  return XSTOCK_BY_TICKER[ticker.toUpperCase()] ?? null;
}

/** All allowlisted contract addresses (xStocks + stablecoins + WBNB). */
export const ALLOWLISTED_CONTRACTS = new Set<string>([
  ...XSTOCKS.map((s) => s.address.toLowerCase()),
  USDC.toLowerCase(),
  USDT.toLowerCase(),
  WBNB.toLowerCase(),
  NATIVE_BNB.toLowerCase(),
]);

/** Check if a contract address is allowlisted. */
export function isAllowlistedContract(address: string): boolean {
  return ALLOWLISTED_CONTRACTS.has(address.toLowerCase());
}
