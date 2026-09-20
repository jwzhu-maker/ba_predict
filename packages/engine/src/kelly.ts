import type { PayoffOutcome } from "./types";

/**
 * Kelly sizing over an arbitrary discrete return distribution.
 *
 * The usual textbook formula f = (bp - q) / b only covers a two-outcome bet.
 * Baccarat bets have three (Banker/Player push on a tie) or four (a
 * no-commission Banker win pays differently on 6), so this maximises
 * E[ln(1 + f*r)] numerically instead.
 *
 * The result for every real baccarat bet is zero, because every expected value
 * is negative. That is not a bug in the sizing — it is the sizing telling the
 * truth. The app surfaces it as "the math says don't bet", and only then falls
 * back to the user's own staking plan.
 */

/** Derivative of the log-growth rate with respect to the staked fraction. */
function growthDerivative(payoffs: readonly PayoffOutcome[], fraction: number): number {
  let total = 0;
  for (const payoff of payoffs) {
    const denominator = 1 + fraction * payoff.netReturn;
    if (denominator <= 0) return Number.NEGATIVE_INFINITY;
    total += (payoff.probability * payoff.netReturn) / denominator;
  }
  return total;
}

export function logGrowthRate(payoffs: readonly PayoffOutcome[], fraction: number): number {
  let total = 0;
  for (const payoff of payoffs) {
    const wealth = 1 + fraction * payoff.netReturn;
    if (wealth <= 0) return Number.NEGATIVE_INFINITY;
    total += payoff.probability * Math.log(wealth);
  }
  return total;
}

/**
 * The full-Kelly fraction of bankroll to stake, in [0, 1).
 *
 * Zero whenever the bet is not +EV.
 */
export function kellyFraction(payoffs: readonly PayoffOutcome[]): number {
  if (payoffs.length === 0) return 0;

  // g'(0) is just the expected value; a non-positive one means stake nothing.
  if (growthDerivative(payoffs, 0) <= 0) return 0;

  let worstLoss = 0;
  for (const payoff of payoffs) {
    if (payoff.netReturn < worstLoss) worstLoss = payoff.netReturn;
  }
  // With no losing outcome the bet is free money and Kelly is unbounded; cap at
  // the whole bankroll rather than returning Infinity.
  const upperBound = worstLoss < 0 ? Math.min(1, 1 / -worstLoss) * (1 - 1e-9) : 1;

  if (growthDerivative(payoffs, upperBound) > 0) return upperBound;

  let low = 0;
  let high = upperBound;
  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2;
    if (growthDerivative(payoffs, mid) > 0) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/**
 * Stake for a chosen Kelly multiplier.
 *
 * Practical play uses a fraction of full Kelly (a half or a quarter) because
 * full Kelly's drawdowns are brutal even when the edge is real.
 */
export function kellyStake(options: {
  bankroll: number;
  payoffs: readonly PayoffOutcome[];
  multiplier?: number;
}): { fraction: number; stake: number } {
  const multiplier = options.multiplier ?? 1;
  const fraction = kellyFraction(options.payoffs) * multiplier;
  return { fraction, stake: Math.max(0, options.bankroll * fraction) };
}
