import 'server-only';
import { isBinanceWeb3Configured } from '@/lib/binance-web3-client';
import {
  BINANCE_CHAIN_ID,
  USDC,
  USDT,
  WBNB,
  NATIVE_BNB,
  XSTOCKS,
} from '@/lib/tokenized-stocks';

/**
 * Central, server-only configuration for the EquiPulse autonomous agent.
 *
 * ARCHITECTURE (BNB Hack: Tokenized Stocks Edition):
 *   Next.js App → Agent API (control layer) → Binance Web3 API → BSC Mainnet → xStocks
 *
 * TOKENIZED STOCK: xStocks (Backed Finance) on BSC Mainnet.
 *   - Trade via regular AMM liquidity pools (executionMode = SWAP)
 *   - No RFQ needed — same flow as regular crypto tokens
 *   - Contract addresses verified on BscScan
 *
 * SECURITY MODEL:
 *   - Secrets (BINANCE_WEB3_API_KEY, BINANCE_WEB3_SECRET_KEY) are server-only, never exported.
 *   - The Binance Web3 API client signs requests with HMAC-SHA256 using the secret key.
 *   - No private keys are stored in source code. Live execution uses the user's connected wallet
 *     (browser-injected EIP-1193 provider) or the Binance Agentic Wallet (when configured).
 *   - The `import 'server-only'` guard prevents secret leakage to client bundles.
 */

// --- Public, non-secret configuration (safe to surface to clients) -------------------------

export const BSC_CHAIN_ID = 56;
export const BINANCE_BSC_CHAIN_ID = BINANCE_CHAIN_ID; // "56" as string for the API

export const BSC_RPC_URL =
  process.env.NEXT_PUBLIC_BSC_RPC_URL?.trim() || 'https://bsc-dataseed.binance.org/';

export const AGENT_STUDIO_ID = process.env.AGENT_STUDIO_ID?.trim() || '#8004-EQUIPULSE';

export const BSCSCAN_TX_BASE = 'https://bscscan.com/tx/';

// --- Token addresses (verified on BscScan) ------------------------------------------------

export const TOKENS = {
  nativeBnb: NATIVE_BNB,
  wbnb: WBNB,
  usdc: USDC,
  usdt: USDT,
} as const;

// --- Hackathon trading policy ---------------------------------------------------------------

export const TRADING_POLICY = {
  spotOnly: true, // No perpetuals, no leverage, no margin, no shorts.
  maxSlippageBps: 100n, // 1.00% hard ceiling regardless of caller-requested slippage.
  executionDeadlineSeconds: 45, // Short deadline shrinks the MEV window.
  maxTradeUsd: 1000, // Maximum trade size for hackathon safety.
  maxGasBnb: 0.005, // Maximum gas cost per transaction in BNB.
  minNetAdvantagePercent: 0.1, // Minimum expected net advantage to execute.
} as const;

// --- Capability detection (booleans only — never the values) -------------------------------

export const agentCapabilities = {
  /** Binance Web3 API configured (API key + secret key for authenticated requests). */
  hasBinanceWeb3: isBinanceWeb3Configured(),
  /** OpenAI key available for natural-language strategy parsing. */
  hasStrategyParser: Boolean(process.env.OPENAI_API_KEY?.trim()),
  /** BNB Agent Studio agent ID configured. */
  hasAgentStudio: Boolean(process.env.AGENT_STUDIO_ID?.trim()),
  /** Binance Agentic Wallet configured (requires skills package + Binance App connection). */
  hasAgenticWallet: Boolean(process.env.AGENTIC_WALLET_SESSION?.trim()),
} as const;

/**
 * Whether real Binance Web3 API calls can be made (quotes, swaps, market data).
 * Requires both API key and secret key.
 */
export function isLiveTradingConfigured(): boolean {
  return isBinanceWeb3Configured();
}

export const LIVE_TRADING_UNAVAILABLE_REASON =
  'Binance Web3 API is not configured. Provide BINANCE_WEB3_API_KEY and BINANCE_WEB3_SECRET_KEY ' +
  'from the Binance Web3 Developer Portal (https://web3.binance.com/en/dev-portal/project) to enable ' +
  'real quotes, swaps, and live execution on BSC Mainnet.';

// --- Secret accessors (call only inside server code; never log the return value) ------------

export function getOpenAiApiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

/** Non-secret capability + network summary safe to return from an API route. */
export function publicAgentStatus() {
  return {
    network: 'BSC Mainnet',
    chainId: BSC_CHAIN_ID,
    binanceChainId: BINANCE_BSC_CHAIN_ID,
    rpcUrl: BSC_RPC_URL,
    agentStudioId: AGENT_STUDIO_ID,
    spotOnly: TRADING_POLICY.spotOnly,
    maxSlippagePercent: Number(TRADING_POLICY.maxSlippageBps) / 100,
    maxTradeUsd: TRADING_POLICY.maxTradeUsd,
    maxGasBnb: TRADING_POLICY.maxGasBnb,
    capabilities: agentCapabilities,
    binanceWeb3Configured: isBinanceWeb3Configured(),
    liveTradingConfigured: isLiveTradingConfigured(),
    tokenizedStockType: 'xStocks (Backed Finance)',
    supportedTokens: XSTOCKS.map((s) => ({ symbol: s.symbol, name: s.name, underlying: s.underlying })),
  };
}
