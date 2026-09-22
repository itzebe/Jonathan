import 'server-only';

/**
 * Central, server-only configuration for the EquiPulse autonomous agent.
 *
 * SECURITY MODEL
 * - Secrets (AGENT_PRIVATE_KEY, OPENAI_API_KEY, BINANCE_WEB3_API_KEY) are NEVER exported as
 *   values. They are read on demand inside server functions and are never logged, serialized,
 *   or returned in an API response. The `import 'server-only'` guard makes this module impossible
 *   to import from a Client Component, so a secret can never leak into the browser bundle.
 * - Only the *presence* of each secret is exposed (via `agentCapabilities`) so the UI can show
 *   which live capabilities are configured without ever seeing the value.
 */

// --- Public, non-secret configuration (safe to surface to clients) -------------------------

export const BSC_CHAIN_ID = ((): number => {
  const raw = Number(process.env.NEXT_PUBLIC_CHAIN_ID);
  // Hard-lock to BSC Mainnet. Anything other than 56 is rejected — the agent is spot-only on BSC.
  return raw === 56 ? raw : 56;
})();

export const BSC_RPC_URL =
  process.env.NEXT_PUBLIC_BSC_RPC_URL?.trim() || 'https://bsc-dataseed.binance.org/';

export const AGENT_STUDIO_ID = process.env.AGENT_STUDIO_ID?.trim() || '#8004-EQUIPULSE';

export const BSCSCAN_TX_BASE = 'https://bscscan.com/tx/';

// --- On-chain contract address mapping (BSC Mainnet · Chain ID 56) --------------------------

export const CONTRACTS = {
  pancakeV3Router: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',
  wbnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  btsla: '0x3b03f0d4dd21f8a7e0e7a2b9d3b4334f59e9c3e2',
  baapl: '0x4902c5ebc598265ed2212b559b042de8a5eeec3f',
  ondo: '0x5b15b1b860023714a5b6710ab31e33d3c8c7d8bf',
} as const;

// --- Live tradability gate ------------------------------------------------------------------
//
// On-chain verification (BSC Mainnet, eth_getCode) shows the tokenized-stock addresses in
// CONTRACTS are NOT live, pool-backed ERC-20 tokens:
//   - btsla (0x3b03…) -> empty bytecode (0x): no contract deployed
//   - ondo  (0x5b15…) -> empty bytecode (0x): no contract deployed
//   - baapl (0x4902…) -> ~283-byte stub, not a real tokenized-stock ERC-20
// In addition, the authenticated Binance Web3 aggregator quote endpoint is not reachable and
// no BINANCE_WEB3_API_KEY is configured, so a trustworthy on-chain minimum-output cannot be
// derived. Signing a swap against these addresses would be guaranteed to revert and would burn
// real gas while enforcing a meaningless slippage bound.
//
// Until real, pool-backed token contracts AND a working authenticated quote provider are
// configured, the product stays in verified-simulation mode and the server refuses to emit
// signable calldata for live execution. Flip TOKENS_VERIFIED to true only after replacing the
// CONTRACTS token addresses with on-chain-verified tokens that have PancakeSwap V3 liquidity.
export const TOKENS_VERIFIED = false;

// --- Hackathon trading policy ---------------------------------------------------------------

export const TRADING_POLICY = {
  spotOnly: true, // No perpetuals, no leverage. Enforced by only ever encoding router swaps.
  maxSlippageBps: 100n, // 1.00% hard ceiling regardless of caller-requested slippage.
  executionDeadlineSeconds: 45, // Short deadline shrinks the MEV window.
} as const;

// --- Secret presence (booleans only — never the values) -------------------------------------

function hasEnv(name: string): boolean {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0;
}

export const agentCapabilities = {
  /** Server hot wallet available to co-sign/broadcast autonomous swaps without a wallet popup. */
  hasAgentSigner: hasEnv('AGENT_PRIVATE_KEY'),
  /** OpenAI key available for natural-language strategy parsing. */
  hasStrategyParser: hasEnv('OPENAI_API_KEY'),
  /** Binance Web3 Transaction API key available for authenticated quotes/routing. */
  hasBinanceWeb3: hasEnv('BINANCE_WEB3_API_KEY'),
} as const;

/**
 * Whether a real, signable live swap can be produced in this deployment. Requires BOTH
 * on-chain-verified, pool-backed token contracts AND an authenticated quote provider so the
 * amountOutMinimum reflects a trustworthy on-chain quote. When false, the API refuses to emit
 * calldata for the user's wallet to sign and the product operates in verified-simulation mode.
 */
export function isLiveTradingConfigured(): boolean {
  return TOKENS_VERIFIED && agentCapabilities.hasBinanceWeb3;
}

export const LIVE_TRADING_UNAVAILABLE_REASON =
  'Live execution is disabled in this deployment: the tokenized-stock contracts are not verified on-chain and no authenticated quote provider is configured. Trades run in verified-simulation mode only — no funds move.';

// --- Secret accessors (call only inside server code; never log the return value) ------------

/**
 * Returns the agent hot-wallet private key, normalized to a 0x-prefixed hex string, or null when
 * unconfigured. Callers MUST treat the result as sensitive: never log it, never include it in a
 * response, never persist it. A missing key means live autonomous signing is unavailable and the
 * agent falls back to returning calldata for the user's own wallet to sign.
 */
export function getAgentPrivateKey(): `0x${string}` | null {
  const raw = process.env.AGENT_PRIVATE_KEY?.trim();
  if (!raw) return null;
  const normalized = raw.startsWith('0x') ? raw : `0x${raw}`;
  return /^0x[0-9a-fA-F]{64}$/.test(normalized) ? (normalized as `0x${string}`) : null;
}

export function getBinanceWeb3ApiKey(): string | null {
  return process.env.BINANCE_WEB3_API_KEY?.trim() || null;
}

export function getOpenAiApiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

/** Non-secret capability + network summary safe to return from an API route. */
export function publicAgentStatus() {
  return {
    network: 'BSC Mainnet',
    chainId: BSC_CHAIN_ID,
    rpcUrl: BSC_RPC_URL,
    agentStudioId: AGENT_STUDIO_ID,
    spotOnly: TRADING_POLICY.spotOnly,
    maxSlippagePercent: Number(TRADING_POLICY.maxSlippageBps) / 100,
    router: CONTRACTS.pancakeV3Router,
    capabilities: agentCapabilities,
    tokensVerified: TOKENS_VERIFIED,
    liveTradingConfigured: isLiveTradingConfigured(),
  };
}
