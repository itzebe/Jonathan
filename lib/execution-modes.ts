/**
 * Execution mode definitions.
 *
 * Three explicit, non-overlapping states. The system never silently switches between them.
 *
 * SIMULATION — No API calls to Binance, no transaction built, nothing broadcast.
 *              Returns illustrative data clearly labeled as simulation.
 *
 * DRY_RUN    — Real Binance Web3 API calls (quote, swap construction, simulation).
 *              Transaction is built and validated but NOT broadcast to the chain.
 *              Shows exactly what would happen if executed.
 *
 * LIVE       — Real execution on BSC Mainnet. Only available when the wallet and
 *              execution infrastructure are correctly configured. Requires all
 *              risk checks to pass. Broadcasts a signed transaction.
 */

export type ExecutionMode = 'SIMULATION' | 'DRY_RUN' | 'LIVE';

export const EXECUTION_MODES: ExecutionMode[] = ['SIMULATION', 'DRY_RUN', 'LIVE'];

export function isValidMode(mode: string): mode is ExecutionMode {
  return EXECUTION_MODES.includes(mode as ExecutionMode);
}

/**
 * Determine the effective execution mode based on what's configured.
 * LIVE is only available when the Binance Web3 API is configured AND a wallet is connected.
 * DRY_RUN requires the Binance Web3 API to be configured (for real quotes).
 * SIMULATION is always available.
 */
export function resolveExecutionMode(
  requested: ExecutionMode,
  binanceConfigured: boolean,
  walletConnected: boolean,
): { mode: ExecutionMode; downgraded: boolean; reason?: string } {
  if (requested === 'LIVE') {
    if (!binanceConfigured) {
      return { mode: 'DRY_RUN', downgraded: true, reason: 'Binance Web3 API not configured — downgraded to DRY_RUN' };
    }
    if (!walletConnected) {
      return { mode: 'DRY_RUN', downgraded: true, reason: 'No wallet connected — downgraded to DRY_RUN' };
    }
    return { mode: 'LIVE', downgraded: false };
  }

  if (requested === 'DRY_RUN' && !binanceConfigured) {
    return { mode: 'SIMULATION', downgraded: true, reason: 'Binance Web3 API not configured — downgraded to SIMULATION' };
  }

  return { mode: requested, downgraded: false };
}
