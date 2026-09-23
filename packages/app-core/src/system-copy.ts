import type { BettingSystemConfig, SystemRun } from "@ba-predict/engine";

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
 * The chance the ladder reaches its top step, as "1 in N".
 *
 * Takes `maxLadderSteps`, NOT `groupSize`: they are the same number on
 * Reverse 12, where the group is what bounds the climb, and they are 4 and 6
 * on Reverse Streak 4, where passing `groupSize` would claim the $600 step
 * exists on a ladder that stops at $400.
 *
 * Distinct from the chance of a CLEAN group, and conflating those is a factor
 * of two: the top stake is PLACED after `steps - 1` wins, while winning every
 * hand of a group of six needs six. At six that is 1 in 32 to reach the $600
 * step and 1 in 64 to win the group.
 *
 * All of these assume a hand is a coin flip, which the reverse rule makes
 * very nearly true: a bet wins when the hand differs from the hand `lookback`
 * back, and at real frequencies that is 2 x 0.507 x 0.493 = 0.4999.
 */
export function oddsOfReachingTopStep(maxLadderSteps: number): number {
  return 2 ** Math.max(0, maxLadderSteps - 1);
}

/**
 * How often the top step comes up per HAND on a ladder that never sits out.
 *
 * A different question from the one above, and using that answer here was
 * wrong by a factor of two. `oddsOfReachingTopStep` counts CLIMBS: given a
 * ladder starting at the base, one in eight reaches rung four. On a gated
 * system a climb is a group, so "1 in 8" and "1 in 8 groups" agree. On an
 * ungated one every hand is a bet and the ladder is a chain that resets on a
 * loss AND after its last rung, so the share of HANDS at the top rung is its
 * stationary probability:
 *
 *   p(k) = p(0) / 2^k for k = 0..n-1, and they sum to 1
 *   => p(0) = 2^(n-1) / (2^n - 1), and p(n-1) = 1 / (2^n - 1)
 *
 * At four rungs that is 1 in 15, not 1 in 8 — the card was promising twice
 * as many $400 bets a shoe as the rule can deliver. Checked against the
 * engine over 4,000 shoes in `system-copy.test.ts`.
 */
export function oddsOfTopStepPerHand(maxLadderSteps: number): number {
  return 2 ** Math.max(1, maxLadderSteps) - 1;
}

export function oddsOfCleanGroup(groupSize: number): number {
  return 2 ** Math.max(0, groupSize);
}

/** The biggest stake the ladder can ask for, before any table maximum. */
export function topStake(config: BettingSystemConfig): number {
  const rungs = Math.max(0, config.maxLadderSteps - 1);
  if (config.staking === "martingale") return config.baseStake * 2 ** rungs;
  return config.baseStake + rungs * config.stakeStep;
}

/** "1, 2, 4 and 8 units" — a Martingale's stakes, counted in its base stake. */
function martingaleUnits(config: BettingSystemConfig): string {
  const units = Array.from({ length: Math.max(1, config.maxLadderSteps) }, (_, rung) => 2 ** rung);
  const last = units.pop()!;
  return units.length > 0 ? `${units.join(", ")} and ${last} units` : `${last} unit`;
}

const ORDINALS = [
  "zeroth",
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
];

function ordinal(value: number): string {
  return ORDINALS[value] ?? `${value}th`;
}

/** Just enough of a money formatter for the copy below. */
export interface SystemCopyMoney {
  format(value: number): string;
}

/**
 * The rule in one paragraph, read off the config rather than from memory.
 *
 * Four surfaces describe the active system in prose — each client's strategy
 * picker and each client's run card — and every one of them had Reverse 12's
 * rules written out by hand. With a second system those four become four
 * chances to describe the rule the player did NOT choose while the numbers
 * beside them come from the one they did.
 */
export function describeSystemRules(config: BettingSystemConfig, money: SystemCopyMoney): string {
  const opening = `Watch ${config.lookback} hands, then from hand ${config.lookback + 1} back the opposite of the hand ${config.lookback} before it.`;

  const recovery = config.recoveryWins ?? 2;
  const ladder =
    config.staking === "martingale"
      ? `Every hand after that carries a stake of ${martingaleUnits(config)} in turn, one unit being ${money.format(config.baseStake)}: double after each loss, back to one unit after a win below the top. A loss at ${money.format(topStake(config))} holds the stake there — a win while holding does not reset it — until it is ${recovery} net win${recovery === 1 ? "" : "s"} up at that stake, then it drops to one unit.`
      : config.groupsGateBetting
    ? `Groups of ${config.groupSize}, opening at ${money.format(config.baseStake)} and adding ${money.format(config.stakeStep)} after each win, stopping the group on its first loss.`
    : `Every hand after that carries a stake: ${money.format(config.baseStake)}, adding ${money.format(config.stakeStep)} after each win up to ${money.format(topStake(config))}, and back to ${money.format(config.baseStake)} after a ${ordinal(config.maxLadderSteps)} straight win or after any loss.`;

  const target =
    config.stopAtNetWins != null
      ? `Once wins outnumber losses by ${config.stopAtNetWins}, it stops for the rest of the shoe. `
      : "";
  const stop =
    target +
    (config.lastHand === null
      ? "It runs to the end of the shoe, and ties are deleted before any of it is counted."
      : `It stops after hand ${config.lastHand}, and ties are deleted before any of it is counted.`);

  return `${opening} ${ladder} ${stop}`;
}

/**
 * What repeats from shoe to shoe, for the foot of the run card.
 *
 * Shared because both clients wrote it out, and a ladder's sentence ("the
 * ladder resets on the first loss") is the opposite of what a Martingale
 * does.
 */
export function describeRunShape(config: BettingSystemConfig): string {
  if (config.staking === "martingale") {
    return `every hand is staked and a loss doubles the next one, so most losses are won back one unit at a time — until four losses in a row, which cost ${martingaleUnits(config).replace(/.* and /, "")} on the last alone and then hold there until it is ${config.recoveryWins ?? 2} net wins up at that stake. Doubling changes when the money moves, not the house edge on it.`;
  }
  if (config.groupsGateBetting) {
    return `a group stops at its first loss, so it lands about ${expectedBetsPerGroup(config).toFixed(1)} bets on average rather than ${config.groupSize}, and the top of the ladder is reached roughly once in ${oddsOfReachingTopStep(config.maxLadderSteps)} groups.`;
  }
  return `every hand in the range is staked and the ladder resets on the first loss, so the top step comes up on roughly one hand in ${oddsOfTopStepPerHand(config.maxLadderSteps)} and the run is many small swings rather than a few big ones.`;
}

/**
 * Bets a group is expected to land, if a hand is a coin flip.
 *
 * A gated group bets until its first loss, so the count is
 * `sum(k = 1..n) 0.5^(k-1)` = `2 * (1 - 2^-n)` — 1.97 at six, which is the
 * number that makes Reverse 12 a third of the action a flat bettor gives.
 * An ungated group bets every hand it covers, so it is simply its length.
 */
export function expectedBetsPerGroup(config: BettingSystemConfig): number {
  if (!config.groupsGateBetting) return config.groupSize;
  return 2 * (1 - 2 ** -Math.max(0, config.groupSize));
}

/** Hands the rule plays over, or null when it runs to the end of the shoe. */
export function handsInRange(config: BettingSystemConfig): number | null {
  return config.lastHand === null ? null : Math.max(0, config.lastHand - config.lookback);
}

/**
 * How much of the shoe the rule actually stakes, in one sentence.
 *
 * This is the difference between the two systems in the only terms that
 * matter to the person playing them — 16 hands or 48 — and it is derived,
 * so a third system will describe itself rather than needing a paragraph
 * comparing it by name to the other two.
 */
export function describeBetRate(config: BettingSystemConfig): string | null {
  const range = handsInRange(config);
  if (range === null || range === 0 || config.groupSize <= 0) return null;

  const where = `of the ${range} hands from ${config.lookback + 1} to ${config.lastHand}`;
  if (!config.groupsGateBetting) {
    return config.stopAtNetWins != null
      ? `On a full shoe it stakes every one ${where}, unless it gets ${config.stopAtNetWins} wins ahead first and stops there.`
      : `On a full shoe it stakes every one ${where}.`;
  }
  const expected = Math.round((range / config.groupSize) * expectedBetsPerGroup(config));
  return `On a full shoe it stakes about ${expected} ${where} and sits out the rest.`;
}

/**
 * Where the rule's hand number sits on the board.
 *
 * The rule counts tie-free hands and the board counts coups, so this is the
 * only thing on screen reconciling "hand 16" with the nineteenth mark on the
 * road. Two things about it are deliberate, and both are about the Record
 * buttons underneath rather than about the words.
 *
 * It is always a sentence, never null: appearing only once a tie had been
 * dealt grew the card mid-shoe and moved the buttons down under the thumb
 * reaching for them. And it is one short clause rather than a sentence
 * repeating the hand number the card's subtitle and detail line have both
 * already given, because the reservation that keeps the buttons still is
 * paid for on every hand, including the ones with nothing to reconcile.
 */
export function tieReconciliation(run: SystemRun): string {
  const { tiesRemoved, next } = run;
  // `next.hand` is the hand ABOUT TO BE DEALT, so this coup number is the
  // mark the road is about to gain, not one already on it. Saying "coup 17
  // on the board" sent a player counting marks looking for a seventeenth
  // that is not there yet — on the very line whose job is to let them check
  // the rule's numbering against the board.
  const coup = tiesRemoved + next.hand;
  if (tiesRemoved === 0) {
    return `Hand ${next.hand} is coup ${coup} of the shoe — no ties yet.`;
  }
  return `Hand ${next.hand} is coup ${coup} of the shoe — ${tiesRemoved} tie${
    tiesRemoved === 1 ? "" : "s"
  } not counted.`;
}

/**
 * The line under the next bet: where in the rule this hand sits.
 *
 * The group step and the ladder rung are the same number on Reverse 12 and
 * diverge on Reverse Streak 4 the moment a hand is lost, so the two systems
 * get different lines rather than one line that is wrong for one of them.
 */
export function nextHandDetail(run: SystemRun): string | null {
  const { config, next } = run;
  if (next.bet === null) return null;

  const recovery = config.recoveryWins ?? 2;
  const rung =
    next.holdNet !== null
      ? `holding the top stake, ${next.holdNet >= 0 ? "+" : ""}${next.holdNet} of +${recovery} net to reset`
      : config.staking === "martingale"
        ? `doubling step ${next.ladderStep} of ${config.maxLadderSteps}`
        : config.groupsGateBetting
          ? `group ${next.group}, bet ${next.step} of ${config.groupSize}`
          : `ladder step ${next.ladderStep} of ${config.maxLadderSteps}`;
  // No "back to the base stake" clause on step 1: the step count already
  // says so, and the extra line it wrapped to was 40px of the height this
  // card reserves to keep the Record buttons still.
  return `Hand ${next.hand} · ${rung} · mirroring hand ${next.referenceHand}`;
}
