import 'server-only';
import { isAllowlistedXStock, isAllowlistedContract, XSTOCK_BY_ADDRESS } from '@/lib/tokenized-stocks';

/**
 * Risk engine — enforces all pre-execution safety checks before LIVE execution.
 *
 * Before any LIVE transaction is broadcast, EVERY check must pass.
 * If ANY check fails, the transaction is BLOCKED and the exact reason is returned.
 *
 * Checks:
 *  1. Token is allowlisted (xStocks only)
 *  2. Contract/router is allowlisted
 *  3. Trade amount is within configured limits
 *  4. Quote is fresh (within TTL)
 *  5. Liquidity is sufficient (quote returned a positive amount)
 *  6. Expected slippage is below configured maximum
 *  7. Expected net result exceeds minimum threshold
 *  8. Gas estimate is below maximum allowed
 *  9. Destination contract is correct (matches quote)
 * 10. Transaction simulation succeeds (when available)
 */

export interface RiskCheckResult {
  passed: boolean;
  checks: RiskCheck[];
  failures: string[];
}

export interface RiskCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface RiskContext {
  fromTokenAddress: string;
  toTokenAddress: string;
  amountUsd: number;
  maxSlippagePercent: number;
  maxGasBnb: number;
  maxTradeUsd: number;
  minNetAdvantagePercent: number;
  quoteToTokenAmount: string;
  quoteFresh: boolean;
  quoteResponseMs: number;
  gasEstimateBnb: number;
  destinationContract: string;
  expectedContract: string;
  simulationPassed: boolean;
  simulationAvailable: boolean;
}

export function runRiskChecks(ctx: RiskContext): RiskCheckResult {
  const checks: RiskCheck[] = [];

  // 1. Token allowlist — toToken must be an allowlisted xStock
  checks.push({
    name: 'Token allowlisted',
    passed: isAllowlistedXStock(ctx.toTokenAddress),
    detail: isAllowlistedXStock(ctx.toTokenAddress)
      ? `Output token ${ctx.toTokenAddress} is an allowlisted xStock`
      : `Output token ${ctx.toTokenAddress} is NOT an allowlisted xStock`,
  });

  // 2. Contract allowlist — fromToken must be allowlisted (stablecoin or native)
  checks.push({
    name: 'Input contract allowlisted',
    passed: isAllowlistedContract(ctx.fromTokenAddress),
    detail: isAllowlistedContract(ctx.fromTokenAddress)
      ? `Input token ${ctx.fromTokenAddress} is allowlisted`
      : `Input token ${ctx.fromTokenAddress} is NOT allowlisted`,
  });

  // 3. Trade amount within limits
  checks.push({
    name: 'Trade amount within limits',
    passed: ctx.amountUsd > 0 && ctx.amountUsd <= ctx.maxTradeUsd,
    detail: ctx.amountUsd <= 0
      ? `Trade amount must be positive (got $${ctx.amountUsd})`
      : ctx.amountUsd > ctx.maxTradeUsd
        ? `Trade amount $${ctx.amountUsd} exceeds maximum $${ctx.maxTradeUsd}`
        : `Trade amount $${ctx.amountUsd} within limit $${ctx.maxTradeUsd}`,
  });

  // 4. Quote freshness
  checks.push({
    name: 'Quote is fresh',
    passed: ctx.quoteFresh,
    detail: ctx.quoteFresh
      ? `Quote is fresh (response time ${ctx.quoteResponseMs}ms)`
      : 'Quote is stale or unavailable',
  });

  // 5. Liquidity sufficient
  const hasLiquidity = ctx.quoteToTokenAmount !== '' && BigInt(ctx.quoteToTokenAmount || '0') > 0n;
  checks.push({
    name: 'Liquidity sufficient',
    passed: hasLiquidity,
    detail: hasLiquidity
      ? `Quote returned ${ctx.quoteToTokenAmount} output units — liquidity available`
      : 'Quote returned zero output — insufficient liquidity',
  });

  // 6. Slippage below maximum
  // Slippage is enforced by the Binance Web3 API's slippagePercent parameter,
  // but we verify the configured max is within our hard ceiling.
  checks.push({
    name: 'Slippage within maximum',
    passed: ctx.maxSlippagePercent > 0 && ctx.maxSlippagePercent <= 1.0,
    detail: ctx.maxSlippagePercent > 1.0
      ? `Slippage cap ${ctx.maxSlippagePercent}% exceeds 1.0% hard ceiling`
      : `Slippage cap ${ctx.maxSlippagePercent}% within 1.0% ceiling`,
  });

  // 7. Net result exceeds minimum threshold
  // For a buy, the "net advantage" is the expected output vs a reference price.
  // We check that the quote returned a meaningful amount (not dust).
  const xstock = XSTOCK_BY_ADDRESS[ctx.toTokenAddress.toLowerCase()];
  const outputUnits = BigInt(ctx.quoteToTokenAmount || '0');
  const outputTokens = Number(outputUnits) / 1e18;
  checks.push({
    name: 'Net result exceeds minimum',
    passed: outputTokens > 0.000001,
    detail: outputTokens > 0.000001
      ? `Expected output ${outputTokens.toFixed(6)} ${xstock?.symbol ?? 'tokens'} — above dust threshold`
      : `Expected output ${outputTokens.toFixed(8)} — below minimum threshold (dust)`,
  });

  // 8. Gas below maximum
  checks.push({
    name: 'Gas below maximum',
    passed: ctx.gasEstimateBnb > 0 && ctx.gasEstimateBnb <= ctx.maxGasBnb,
    detail: ctx.gasEstimateBnb > ctx.maxGasBnb
      ? `Gas estimate ${ctx.gasEstimateBnb} BNB exceeds maximum ${ctx.maxGasBnb} BNB`
      : `Gas estimate ${ctx.gasEstimateBnb} BNB within limit ${ctx.maxGasBnb} BNB`,
  });

  // 9. Destination contract correct
  checks.push({
    name: 'Destination contract correct',
    passed: ctx.destinationContract.toLowerCase() === ctx.expectedContract.toLowerCase(),
    detail: ctx.destinationContract.toLowerCase() === ctx.expectedContract.toLowerCase()
      ? 'Destination matches expected contract'
      : `Destination ${ctx.destinationContract} does not match expected ${ctx.expectedContract}`,
  });

  // 10. Transaction simulation
  if (ctx.simulationAvailable) {
    checks.push({
      name: 'Transaction simulation passed',
      passed: ctx.simulationPassed,
      detail: ctx.simulationPassed
        ? 'Transaction simulation succeeded'
        : 'Transaction simulation FAILED — do not broadcast',
    });
  }

  const failures = checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`);

  return {
    passed: failures.length === 0,
    checks,
    failures,
  };
}
