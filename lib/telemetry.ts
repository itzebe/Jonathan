'use client';

/**
 * Client-side DX telemetry store for EquiPulse.
 *
 * Captures REAL agent activity (not simulated) so the DX Metrics Drawer can display:
 *  - API Decision Latency (ms): wall-clock time the /api/agent decision round-trip took.
 *  - Binance Web3 Quote Response Time (ms): the `quoteResponseMs` reported by the server, i.e.
 *    how long the authenticated Binance Web3 aggregator quote took.
 *  - Executed on-chain gas fees & slippage per broadcast transaction.
 *  - Direct BscScan transaction links for every broadcast tx hash.
 *
 * It is a tiny pub/sub singleton (no dependency) with a bounded history and localStorage
 * persistence for the executed-transaction list so links survive a reload.
 */

export const BSCSCAN_TX_BASE = 'https://bscscan.com/tx/';

export interface AgentTxRecord {
  txHash: string;
  label: string;
  gasUsedBnb: number;
  slippagePercent: number;
  mode: 'live' | 'simulation';
  timestamp: number;
  bscScanUrl: string;
}

export interface TelemetrySnapshot {
  /** Most recent full /api/agent decision round-trip in ms. */
  decisionLatencyMs: number | null;
  /** Most recent Binance Web3 aggregator quote response time in ms. */
  quoteResponseMs: number | null;
  /** Total number of /api/agent calls this session. */
  apiCalls: number;
  /** Most recent executed/estimated gas in BNB. */
  lastGasBnb: number | null;
  /** Most recent slippage bound (%) applied to an executed/quoted swap. */
  lastSlippagePercent: number | null;
  /** Bounded, newest-first list of broadcast transactions with BscScan links. */
  transactions: AgentTxRecord[];
}

const TX_STORAGE_KEY = 'equipulse:dx:transactions';
const MAX_TX = 8;

let snapshot: TelemetrySnapshot = {
  decisionLatencyMs: null,
  quoteResponseMs: null,
  apiCalls: 0,
  lastGasBnb: null,
  lastSlippagePercent: null,
  transactions: [],
};

const listeners = new Set<(snapshot: TelemetrySnapshot) => void>();

function loadPersistedTransactions(): AgentTxRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(TX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AgentTxRecord[]).slice(0, MAX_TX) : [];
  } catch {
    return [];
  }
}

function persistTransactions(transactions: AgentTxRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TX_STORAGE_KEY, JSON.stringify(transactions.slice(0, MAX_TX)));
  } catch {
    // Storage may be unavailable (private mode / quota); telemetry is best-effort.
  }
}

let hydrated = false;
function ensureHydrated() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  snapshot = { ...snapshot, transactions: loadPersistedTransactions() };
}

function emit() {
  const current = getTelemetry();
  for (const listener of listeners) listener(current);
}

export function getTelemetry(): TelemetrySnapshot {
  ensureHydrated();
  return { ...snapshot, transactions: [...snapshot.transactions] };
}

export function subscribeTelemetry(listener: (snapshot: TelemetrySnapshot) => void): () => void {
  ensureHydrated();
  listeners.add(listener);
  listener(getTelemetry());
  return () => {
    listeners.delete(listener);
  };
}

/** Record a completed /api/agent decision round-trip. */
export function recordDecision(input: {
  decisionLatencyMs: number;
  quoteResponseMs?: number | null;
  gasBnb?: number | null;
  slippagePercent?: number | null;
}) {
  ensureHydrated();
  snapshot = {
    ...snapshot,
    apiCalls: snapshot.apiCalls + 1,
    decisionLatencyMs: Math.max(0, Math.round(input.decisionLatencyMs)),
    quoteResponseMs:
      typeof input.quoteResponseMs === 'number' && Number.isFinite(input.quoteResponseMs)
        ? Math.max(0, Math.round(input.quoteResponseMs))
        : snapshot.quoteResponseMs,
    lastGasBnb:
      typeof input.gasBnb === 'number' && Number.isFinite(input.gasBnb) ? input.gasBnb : snapshot.lastGasBnb,
    lastSlippagePercent:
      typeof input.slippagePercent === 'number' && Number.isFinite(input.slippagePercent)
        ? input.slippagePercent
        : snapshot.lastSlippagePercent,
  };
  emit();
}

/** Record a broadcast transaction so the drawer can show a BscScan link. */
export function recordTransaction(input: {
  txHash: string;
  label: string;
  gasUsedBnb?: number;
  slippagePercent?: number;
  mode: 'live' | 'simulation';
}) {
  ensureHydrated();
  if (!input.txHash || !/^0x[a-fA-F0-9]{64}$/.test(input.txHash)) return;
  const record: AgentTxRecord = {
    txHash: input.txHash,
    label: input.label,
    gasUsedBnb: Number.isFinite(input.gasUsedBnb) ? Number(input.gasUsedBnb) : 0,
    slippagePercent: Number.isFinite(input.slippagePercent) ? Number(input.slippagePercent) : 0,
    mode: input.mode,
    timestamp: Date.now(),
    bscScanUrl: `${BSCSCAN_TX_BASE}${input.txHash}`,
  };
  const transactions = [record, ...snapshot.transactions.filter((tx) => tx.txHash !== record.txHash)].slice(0, MAX_TX);
  snapshot = {
    ...snapshot,
    transactions,
    lastGasBnb: record.gasUsedBnb || snapshot.lastGasBnb,
    lastSlippagePercent: record.slippagePercent || snapshot.lastSlippagePercent,
  };
  persistTransactions(transactions);
  emit();
}
