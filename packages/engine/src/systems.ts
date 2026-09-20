import type { BetType, CoupRecord, TableRules } from "./types";
import { settleWager } from "./session";

/**
 * A complete betting SYSTEM, as distinct from a staking plan.
 *
 * The ten entries in `progressions.ts` answer one question — how much to
 * stake next — and take the side as given. A system answers three:
 *
 *   1. which side to bet (here: the opposite of what happened N hands ago);
 *   2. how much (a ladder that climbs while it wins);
 *   3. whether to bet at all (a warm-up, a dead group, the end of the run).
 *
 * That third one is what a progression cannot express, and it is most of
 * what makes a system feel like a system to the person playing it.
 *
 * Everything here is pure and deterministic over recorded coups. Like the
 * strategy replay, this is hindsight on hands that really came out, not a
 * forecast — and, like every other number in this app, it cannot change the
 * house edge. A system that sits out 12 hands and stops after 60 is staking
 * less, which reduces the total cost of playing in proportion; it does not
 * reduce the cost per unit staked, which is the only rate that matters.
 */

/** Sides a system can back. Ties are never a bet here. */
export type SystemSide = "player" | "banker";

export type BettingSystemId = "reverse-12";

/**
 * The knobs. The defaults are the rule as it was specified:
 *
 *   watch 12, then from hand 13 bet against the hand 12 back, in groups of 6,
 *   $100 rising by $100 per win, stop the group on a loss, stop at hand 60.
 */
export interface BettingSystemConfig {
  /**
   * Hands watched before the first bet, which is ALSO how far back the side
   * is read from. One number, because the rule "no bet for the first 12, then
   * mirror the hand 12 back" only lines up if they are the same: hand 13 is
   * the first hand whose reference hand exists.
   */
  lookback: number;
  /** Hands in a group. A group ends early on its first loss. */
  groupSize: number;
  /** Stake on a group's first bet, in currency. */
  baseStake: number;
  /** Added to the stake after each win inside a group. */
  stakeStep: number;
  /** The last hand played. Null runs to the end of the shoe. */
  lastHand: number | null;
}

export const REVERSE_TWELVE_CONFIG: BettingSystemConfig = {
  lookback: 12,
  groupSize: 6,
  baseStake: 100,
  stakeStep: 100,
  lastHand: 60,
};

export interface BettingSystemDefinition {
  id: BettingSystemId;
  name: string;
  summary: string;
  defaults: BettingSystemConfig;
}

export const BETTING_SYSTEMS: readonly BettingSystemDefinition[] = [
  {
    id: "reverse-12",
    name: "Reverse 12",
    summary: "Mirror the hand 12 back, in groups of 6, climbing while it wins.",
    defaults: REVERSE_TWELVE_CONFIG,
  },
];

/** Why a hand carried no bet. */
export type SystemSkipReason = "warm-up" | "group-over" | "past-last-hand";

/** One hand of the tie-free sequence, and what the system did with it. */
export interface SystemHand {
  /** 1-based position in the TIE-FREE sequence, which is what the rules count. */
  hand: number;
  /** Index of this hand in the original recorded coups, ties included. */
  sourceIndex: number;
  outcome: SystemSide;
  /** 1-based group number, or null outside the betting range. */
  group: number | null;
  /** 1-based position within the group, or null outside it. */
  step: number | null;
  /** The side backed, or null when the hand was sat out. */
  bet: SystemSide | null;
  skipped: SystemSkipReason | null;
  /** The hand this hand's side was read from, or null when none was. */
  referenceHand: number | null;
  stake: number;
  result: "win" | "loss" | null;
  /** Signed money change, commission already taken off a Banker win. */
  profit: number;
  /** Running balance after this hand. */
  balance: number;
}

export interface SystemGroup {
  group: number;
  firstHand: number;
  /** The last hand the group COVERS, whether or not it was bet. */
  lastHand: number;
  bets: number;
  wins: number;
  staked: number;
  net: number;
  /** The hand whose loss closed the group early, or null if it ran clean. */
  lostAt: number | null;
  /** True when every hand in the group won — the group's best case. */
  perfect: boolean;
}

/**
 * What the system would do on the NEXT hand, given everything recorded so far.
 *
 * This is the reading a player actually wants mid-shoe — which side, how much,
 * or why it is sitting this one out — and it cannot be derived from the hand
 * log alone: whether the current group is still alive, and how many wins the
 * ladder has banked, are loop state that the log does not carry.
 */
export interface SystemNext {
  /** Position the next hand would take in the tie-free sequence. */
  hand: number;
  group: number | null;
  step: number | null;
  /** The side to back, or null when the system sits the hand out. */
  bet: SystemSide | null;
  skipped: SystemSkipReason | null;
  /** The hand whose outcome decides the side, or null when sitting out. */
  referenceHand: number | null;
  stake: number;
}

export interface SystemRun {
  id: BettingSystemId;
  name: string;
  config: BettingSystemConfig;
  hands: SystemHand[];
  groups: SystemGroup[];
  /** Hands in the tie-free sequence. */
  handsAvailable: number;
  /** Ties dropped before numbering, per the rule that they never happen. */
  tiesRemoved: number;
  /** Hands that actually carried a bet. */
  bets: number;
  wins: number;
  losses: number;
  staked: number;
  /** Signed: positive is ahead. This is the gain/loss for the shoe. */
  net: number;
  /** Largest single stake reached. */
  peakStake: number;
  /** Deepest peak-to-trough fall in the running balance. */
  maxDrawdown: number;
  /** What the system says to do on the next hand. */
  next: SystemNext;
  /** Net over everything staked, signed. Positive is ahead. */
  perUnit: number;
  /** Groups that won every hand they covered. */
  perfectGroups: number;
  /**
   * True when the shoe ran out before `lastHand`, so this is a partial run.
   * A shoe is 60-80 coups but ties are deleted first, so falling short of 60
   * is ordinary rather than exceptional.
   */
  incomplete: boolean;
  /**
   * True when a Banker win could not be settled exactly — a no-commission
   * table pays a reduced rate on a win with 6, and a recorded coup does not
   * say whether the total was 6. The Banker legs are then slightly generous.
   */
  approximate: boolean;
}

const SIDE_BET: Record<SystemSide, BetType> = { player: "player", banker: "banker" };

/** The opposite side. The whole of the "reverse" rule. */
function opposite(side: SystemSide): SystemSide {
  return side === "player" ? "banker" : "player";
}

/**
 * Drop the ties, keeping a link back to where each hand really sat.
 *
 * "Ignore the tie, just assume it never happens" is taken literally: a tie is
 * removed before anything is numbered, so hand 13 is the 13th Player-or-Banker
 * hand and every bet resolves to a clean win or loss. The alternative reading —
 * count ties but push on them — leaves two rules undefined (what the ladder
 * does on a push, and what to bet when the reference hand was itself a tie),
 * which is exactly the ambiguity deleting them removes.
 */
function tieFreeHands(coups: readonly CoupRecord[]): {
  hands: { outcome: SystemSide; sourceIndex: number; coup: CoupRecord }[];
  tiesRemoved: number;
} {
  const hands: { outcome: SystemSide; sourceIndex: number; coup: CoupRecord }[] = [];
  let tiesRemoved = 0;
  for (let index = 0; index < coups.length; index += 1) {
    const coup = coups[index]!;
    if (coup.outcome === "tie") {
      tiesRemoved += 1;
      continue;
    }
    hands.push({ outcome: coup.outcome, sourceIndex: index, coup });
  }
  return { hands, tiesRemoved };
}

export interface RunBettingSystemOptions {
  coups: readonly CoupRecord[];
  rules: TableRules;
  config?: Partial<BettingSystemConfig>;
  /** Table ceiling in currency. A stake above it is clipped. Null = no ceiling. */
  tableMax?: number | null;
}

/**
 * Play one shoe through the system and report what it did.
 *
 * The ladder is defined on STAKES, so a group that wins six in a row stakes
 * base, base+step, ... regardless of what each win paid. That matters on
 * Banker, where a win returns 0.95x: six perfect Banker hands on the default
 * config stake $2,100 and return $1,995, not $2,100. The gap is the
 * commission, and it is the reason the per-unit figure lands where it does.
 */
export function runBettingSystem(options: RunBettingSystemOptions): SystemRun {
  const definition = BETTING_SYSTEMS[0]!;
  const config: BettingSystemConfig = { ...definition.defaults, ...options.config };
  const { rules, tableMax = null } = options;
  const { hands: sequence, tiesRemoved } = tieFreeHands(options.coups);

  const hands: SystemHand[] = [];
  const groups: SystemGroup[] = [];

  let balance = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let staked = 0;
  let bets = 0;
  let wins = 0;
  let losses = 0;
  let peakStake = 0;
  let approximate = false;

  // Live group state. `groupDead` is the "stop until the next group" rule.
  let groupWins = 0;
  let groupDead = false;
  let current: SystemGroup | null = null;

  const firstBettingHand = config.lookback + 1;

  for (let position = 0; position < sequence.length; position += 1) {
    const hand = position + 1;
    const entry = sequence[position]!;

    const pastEnd = config.lastHand !== null && hand > config.lastHand;
    const warmingUp = hand < firstBettingHand;

    let group: number | null = null;
    let step: number | null = null;
    if (!warmingUp && !pastEnd) {
      const offset = hand - firstBettingHand;
      group = Math.floor(offset / config.groupSize) + 1;
      step = (offset % config.groupSize) + 1;

      // A new group resets the ladder and revives betting.
      if (step === 1) {
        groupWins = 0;
        groupDead = false;
        const covers = hand + config.groupSize - 1;
        current = {
          group,
          firstHand: hand,
          // Clamped, so a group the run ends inside does not claim hands it
          // was never allowed to play.
          lastHand: config.lastHand === null ? covers : Math.min(covers, config.lastHand),
          bets: 0,
          wins: 0,
          staked: 0,
          net: 0,
          lostAt: null,
          perfect: false,
        };
        groups.push(current);
      }
    }

    const skipped: SystemSkipReason | null = pastEnd
      ? "past-last-hand"
      : warmingUp
        ? "warm-up"
        : groupDead
          ? "group-over"
          : null;

    if (skipped !== null) {
      hands.push({
        hand,
        sourceIndex: entry.sourceIndex,
        outcome: entry.outcome,
        group,
        step,
        bet: null,
        skipped,
        referenceHand: null,
        stake: 0,
        result: null,
        profit: 0,
        balance,
      });
      continue;
    }

    const referenceHand = hand - config.lookback;
    const reference = sequence[referenceHand - 1]!;
    const side = opposite(reference.outcome);

    const wanted = config.baseStake + groupWins * config.stakeStep;
    const stake = tableMax === null ? wanted : Math.min(wanted, tableMax);

    const settlement = settleWager(
      { bet: SIDE_BET[side], amount: stake },
      {
        outcome: entry.outcome,
        playerPair: entry.coup.playerPair,
        bankerPair: entry.coup.bankerPair,
      },
      rules,
    );
    if (settlement.unsettled) approximate = true;

    // Ties are gone, so a Player/Banker bet here can only win or lose. Asking
    // for "win" rather than "not loss" keeps a push — which only a future rule
    // change could produce — on the safe side: it would end the group rather
    // than be scored as a win and climb the ladder.
    const won = settlement.result === "win";

    balance += settlement.profit;
    staked += stake;
    bets += 1;
    if (won) wins += 1;
    else losses += 1;
    if (stake > peakStake) peakStake = stake;
    if (balance > peak) peak = balance;
    if (peak - balance > maxDrawdown) maxDrawdown = peak - balance;

    if (current) {
      current.bets += 1;
      current.staked += stake;
      current.net += settlement.profit;
      if (won) {
        current.wins += 1;
        if (current.bets === config.groupSize) current.perfect = true;
      } else {
        current.lostAt = hand;
      }
    }

    if (won) groupWins += 1;
    else groupDead = true;

    hands.push({
      hand,
      sourceIndex: entry.sourceIndex,
      outcome: entry.outcome,
      group,
      step,
      bet: side,
      skipped: null,
      referenceHand,
      stake,
      result: won ? "win" : "loss",
      profit: settlement.profit,
      balance,
    });
  }

  const target = config.lastHand;
  return {
    next: describeNext(sequence, config, groupWins, groupDead),
    id: definition.id,
    name: definition.name,
    config,
    hands,
    groups,
    handsAvailable: sequence.length,
    tiesRemoved,
    bets,
    wins,
    losses,
    staked,
    net: balance,
    peakStake,
    maxDrawdown,
    perUnit: staked === 0 ? 0 : balance / staked,
    perfectGroups: groups.filter((group) => group.perfect).length,
    incomplete: target !== null && sequence.length < target,
    approximate,
  };
}

/**
 * Read off the next hand's instruction from the state the run loop ended in.
 *
 * A group boundary resets the ladder, so a hand that OPENS a group is live
 * and priced at the base stake however badly the previous group ended — which
 * is the rule that makes the "stop until the next group" instruction bearable.
 */
function describeNext(
  sequence: readonly { outcome: SystemSide }[],
  config: BettingSystemConfig,
  groupWins: number,
  groupDead: boolean,
): SystemNext {
  const hand = sequence.length + 1;
  const firstBettingHand = config.lookback + 1;
  const idle = (skipped: SystemSkipReason, group: number | null, step: number | null): SystemNext => ({
    hand,
    group,
    step,
    bet: null,
    skipped,
    referenceHand: null,
    stake: 0,
  });

  if (config.lastHand !== null && hand > config.lastHand) return idle("past-last-hand", null, null);
  if (hand < firstBettingHand) return idle("warm-up", null, null);

  const offset = hand - firstBettingHand;
  const group = Math.floor(offset / config.groupSize) + 1;
  const step = (offset % config.groupSize) + 1;

  // Opening a group wipes the slate; mid-group, a dead group stays dead.
  const opening = step === 1;
  if (!opening && groupDead) return idle("group-over", group, step);

  const banked = opening ? 0 : groupWins;
  const referenceHand = hand - config.lookback;
  const reference = sequence[referenceHand - 1];
  // Defensive: with lookback >= 1 this hand always exists, because the
  // warm-up check above guarantees hand > lookback.
  if (!reference) return idle("warm-up", null, null);

  return {
    hand,
    group,
    step,
    bet: opposite(reference.outcome),
    skipped: null,
    referenceHand,
    stake: config.baseStake + banked * config.stakeStep,
  };
}
