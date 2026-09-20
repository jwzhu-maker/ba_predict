import type { SystemRun } from "@ba-predict/engine";

/**
 * The derived readings both clients need from a `SystemRun`.
 *
 * It lives here for the reason `describeEdge` does: every one of these was
 * written twice, once per client, and two of them were WRONG in both copies
 * — the resume hand ignored `lastHand` and promised a group that can never
 * open, and the bets-placed denominator ignored how many hands the shoe
 * actually dealt. A defect in duplicated derived copy is a defect twice, and
 * `app-core` is the only workspace here with a test runner.
 */

export interface SystemNextReading {
  /** Hands still to watch before the first bet, 0 once betting has started. */
  handsToWatch: number;
  /**
   * The hand the next live group opens on, or null when there is no next
   * group inside this run.
   *
   * Null is the case the clients got wrong: group 8 covers hands 55-60 and
   * `lastHand` is 60, so a loss anywhere in it leaves no group 9 to wait
   * for. Saying "waits for group 9, which opens on hand 61" promises
   * something the rule will refuse four hands later.
   */
  resumesAtHand: number | null;
  /** The group number that would open there, or null for the same reason. */
  resumesAtGroup: number | null;
}

export function readSystemNext(run: SystemRun): SystemNextReading {
  const { config, next } = run;
  const firstBettingHand = config.lookback + 1;
  const handsToWatch = Math.max(0, firstBettingHand - next.hand);

  if (next.skipped !== "group-over" || next.group === null) {
    return { handsToWatch, resumesAtHand: null, resumesAtGroup: null };
  }

  const resumesAtHand = next.group * config.groupSize + firstBettingHand;
  if (config.lastHand !== null && resumesAtHand > config.lastHand) {
    return { handsToWatch, resumesAtHand: null, resumesAtGroup: null };
  }
  return { handsToWatch, resumesAtHand, resumesAtGroup: next.group + 1 };
}

/**
 * How many hands this run COULD have bet on.
 *
 * Bounded by the shoe as well as by the rule: a 40-hand shoe only offers 28
 * hands inside the betting range, and reporting "9 of 48" understates the
 * rule's bet rate by 40% on exactly the shoes the same card has already
 * flagged as ending early.
 */
export function bettableHands(run: SystemRun): number {
  const { config, handsAvailable } = run;
  const last = config.lastHand === null ? handsAvailable : Math.min(config.lastHand, handsAvailable);
  return Math.max(0, last - config.lookback);
}

/**
 * The chance a group reaches its top step, as "1 in N".
 *
 * Distinct from the chance of a CLEAN group, and conflating them is a factor
 * of two: the top stake is the group's LAST bet, so placing it needs
 * `groupSize - 1` wins, while a clean group needs `groupSize`. At the default
 * six, that is 1 in 32 to reach the $600 step and 1 in 64 to win it.
 *
 * Both assume a hand is a coin flip, which the reverse rule makes very nearly
 * true: a bet wins when the hand differs from the hand `lookback` back, and
 * at real frequencies that is 2 x 0.507 x 0.493 = 0.4999.
 */
export function oddsOfReachingTopStep(groupSize: number): number {
  return 2 ** Math.max(0, groupSize - 1);
}

export function oddsOfCleanGroup(groupSize: number): number {
  return 2 ** Math.max(0, groupSize);
}
