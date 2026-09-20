import {
  DEFAULT_PROGRESSION_OPTIONS,
  advanceProgression,
  initProgression,
  type ProgressionId,
  type ProgressionOptions,
} from "./progressions";
import type { BetResult, PayoffOutcome } from "./types";

/**
 * What a staking plan actually does to a bankroll.
 *
 * This is the part of the app that earns its keep. Expected value tells you
 * the mean, which for baccarat is always "you lose 1.06% of everything you put
 * out". It says nothing about the shape, and the shape is what people are
 * actually choosing between when they pick a progression. A Martingale's mean
 * is unremarkable and its 1st percentile is a wiped-out bankroll; only a
 * simulation shows both at once.
 */

/** mulberry32 — small, fast, and seedable so a reported result can be reproduced. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildCumulative(payoffs: readonly PayoffOutcome[]): {
  thresholds: number[];
  returns: number[];
} {
  const thresholds: number[] = [];
  const returns: number[] = [];
  let running = 0;
  for (const payoff of payoffs) {
    running += payoff.probability;
    thresholds.push(running);
    returns.push(payoff.netReturn);
  }
  // Guard against probabilities that sum to slightly under one.
  if (thresholds.length > 0) thresholds[thresholds.length - 1] = 1;
  return { thresholds, returns };
}

function resultOf(netReturn: number): BetResult {
  if (netReturn > 0) return "win";
  if (netReturn < 0) return "loss";
  return "push";
}

export type SessionEnding = "ruin" | "stop-win" | "stop-loss" | "table-limit" | "coup-limit";

export interface SimulationConfig {
  /** Per-unit return distribution of the bet being repeated. */
  payoffs: readonly PayoffOutcome[];
  /** Starting bankroll, expressed in betting units. */
  bankrollUnits: number;
  progression: ProgressionId;
  progressionOptions?: ProgressionOptions;
  /** How many coups a session can run before the player walks. */
  coupsPerSession: number;
  /** Walk away up this many units. Null to play the full session. */
  stopWinUnits: number | null;
  /** Walk away down this many units. Null to play until broke. */
  stopLossUnits: number | null;
  trials?: number;
  seed?: number;
}

export interface SimulationResult {
  trials: number;
  endings: Record<SessionEnding, number>;
  /** Fraction of sessions that could not fund the next required stake. */
  ruinRate: number;
  /** Fraction stopped by the table ceiling, with the progression unable to continue. */
  tableLimitRate: number;
  /**
   * Fraction of sessions that finished up at all.
   *
   * Distinct from the stop-win rate, and routinely much larger: most sessions
   * end at the coup limit, not at a stop. Reporting the stop-win rate under a
   * "finished ahead" label understates by a factor of twenty on a short
   * flat-betting session, which is the wrong direction for this app to be
   * wrong in.
   */
  winningSessionRate: number;
  meanResultUnits: number;
  medianResultUnits: number;
  percentile5Units: number;
  percentile95Units: number;
  worstUnits: number;
  bestUnits: number;
  meanCoupsPlayed: number;
  meanWageredUnits: number;
  /**
   * House edge the simulation actually paid, as a fraction of total action.
   * Converges on the theoretical edge of the bet, whatever progression is used
   * — which is the point.
   */
  impliedEdge: number;
  peakStakeUnits: number;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const low = sorted[lower] ?? 0;
  if (lower === upper) return low;
  const high = sorted[upper] ?? low;
  return low + (high - low) * (index - lower);
}

export function simulateSessions(config: SimulationConfig): SimulationResult {
  const trials = config.trials ?? 10_000;
  const options = config.progressionOptions ?? DEFAULT_PROGRESSION_OPTIONS;
  const random = createRandom(config.seed ?? 0x5eed);
  const { thresholds, returns } = buildCumulative(config.payoffs);

  const endings: Record<SessionEnding, number> = {
    ruin: 0,
    "stop-win": 0,
    "stop-loss": 0,
    "table-limit": 0,
    "coup-limit": 0,
  };
  const results: number[] = [];
  let totalCoups = 0;
  let totalWagered = 0;
  let totalProfit = 0;
  let peakStake = 0;

  for (let trial = 0; trial < trials; trial += 1) {
    let bankroll = config.bankrollUnits;
    let progression = initProgression(config.progression, options);
    let coups = 0;
    let ending: SessionEnding = "coup-limit";

    for (let coup = 0; coup < config.coupsPerSession; coup += 1) {
      const stake = progression.units;
      if (stake <= 0) {
        ending = "table-limit";
        break;
      }
      // The progression asked for more than the table allows and the shortfall
      // is what breaks these systems, so it ends the session rather than being
      // silently clipped.
      if (progression.requestedUnits > stake + 1e-9) {
        ending = "table-limit";
        break;
      }
      if (stake > bankroll + 1e-9) {
        ending = "ruin";
        break;
      }

      const roll = random();
      let index = 0;
      while (index < thresholds.length - 1 && roll > (thresholds[index] ?? 1)) index += 1;
      const netReturn = returns[index] ?? -1;

      const profit = stake * netReturn;
      bankroll += profit;
      totalWagered += stake;
      if (stake > peakStake) peakStake = stake;
      coups += 1;

      progression = advanceProgression(
        progression,
        { result: resultOf(netReturn), profitUnits: profit },
        options,
      );

      if (bankroll <= 1e-9) {
        ending = "ruin";
        break;
      }
      const swing = bankroll - config.bankrollUnits;
      if (config.stopWinUnits !== null && swing >= config.stopWinUnits) {
        ending = "stop-win";
        break;
      }
      if (config.stopLossUnits !== null && -swing >= config.stopLossUnits) {
        ending = "stop-loss";
        break;
      }
    }

    endings[ending] += 1;
    const net = bankroll - config.bankrollUnits;
    results.push(net);
    totalProfit += net;
    totalCoups += coups;
  }

  results.sort((a, b) => a - b);
  let winningSessions = 0;
  for (const net of results) {
    if (net > 1e-9) winningSessions += 1;
  }

  return {
    trials,
    endings,
    winningSessionRate: winningSessions / trials,
    ruinRate: endings.ruin / trials,
    tableLimitRate: endings["table-limit"] / trials,
    meanResultUnits: totalProfit / trials,
    medianResultUnits: percentile(results, 0.5),
    percentile5Units: percentile(results, 0.05),
    percentile95Units: percentile(results, 0.95),
    worstUnits: results[0] ?? 0,
    bestUnits: results[results.length - 1] ?? 0,
    meanCoupsPlayed: totalCoups / trials,
    meanWageredUnits: totalWagered / trials,
    impliedEdge: totalWagered === 0 ? 0 : -totalProfit / totalWagered,
    peakStakeUnits: peakStake,
  };
}

/**
 * Closed-form risk of ruin for flat, even-money betting.
 *
 * Exact for Player (1:1). Banker's 0.95 payout is not a symmetric random walk,
 * so route that through {@link simulateSessions} instead of trusting this.
 *
 * With no win target and a negative edge the answer is 1: play long enough and
 * the bankroll is gone. That is not pessimism, it is the arithmetic.
 */
export function flatBetRuinProbability(options: {
  winProbability: number;
  lossProbability: number;
  bankrollUnits: number;
  /** Units of profit at which the player walks. Null means "plays forever". */
  targetUnits: number | null;
}): number {
  const { winProbability, lossProbability, bankrollUnits, targetUnits } = options;
  const resolved = winProbability + lossProbability;
  if (resolved <= 0 || bankrollUnits <= 0) return 1;

  const p = winProbability / resolved;
  const q = 1 - p;
  if (targetUnits === null || targetUnits <= 0) {
    // No target means playing until the bankroll decides. With the edge
    // against you that is certain ruin; with the edge for you it is (q/p)^N,
    // which is still not zero.
    return p > q ? (q / p) ** bankrollUnits : 1;
  }

  const start = bankrollUnits;
  const target = bankrollUnits + targetUnits;
  if (Math.abs(p - q) < 1e-12) return 1 - start / target;

  const ratio = q / p;
  const logRatio = Math.log(ratio);
  // r**target overflows for a distant target, so compare in log space first.
  if (logRatio * target > 700) {
    // reachProbability = (r**start - 1) / (r**target - 1), dominated by the exponentials.
    const log = Math.log(Math.expm1(logRatio * start)) - logRatio * target;
    return 1 - Math.exp(log);
  }
  const reach = (ratio ** start - 1) / (ratio ** target - 1);
  return 1 - Math.min(1, Math.max(0, reach));
}

/**
 * How many coups a bankroll survives on average at a given edge and flat stake.
 *
 * A back-of-envelope companion to the simulation: at 1.06% edge, one unit per
 * coup, a 100-unit bankroll has an expected loss of about one unit per 94
 * coups, so the drain is slow and the variance is what actually ends sessions.
 */
export function expectedLossPerCoup(houseEdge: number, stakeUnits: number): number {
  return houseEdge * stakeUnits;
}
