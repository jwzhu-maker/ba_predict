import type { CoupRecord, TableRules } from "./types";
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
 * Both systems here share rule 1 and differ on 2 and 3, which is why they
 * are one loop with two configs rather than two loops. Reverse 12 plays in
 * groups of six and sits out the rest of a group it has lost; Reverse Streak
 * 4 backs every hand in the range and caps its ladder at four wins. Shared
 * code is the point: the side rule, the tie deletion, the settlement, the
 * table-maximum clip and the next-hand reading were all worth having once.
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

export type BettingSystemId = "reverse-12" | "reverse-streak-4" | "reverse-streak-4-martingale";

/**
 * How the stake moves between bets.
 *
 * "ladder" adds `stakeStep` after each win and drops back to the base on a
 * loss (and after `maxLadderSteps` straight wins). "martingale" is the
 * mirror image: it doubles after each LOSS and drops back to the base on a
 * win, for `maxLadderSteps` stakes (1, 2, 4, 8 at four). A loss at the top
 * stake does not double again; the stake holds there until `recoveryWins`
 * net wins at that stake have been banked — two wins at 8 pay back the
 * 1 + 2 + 4 + 8 the climb lost — and only then returns to the base. It
 * also waits until the climb's money is actually back, for the cases where
 * two wins do not pay it: a stake cut by the table maximum, Banker
 * commission, or a loss inside the hold.
 */
export type SystemStaking = "ladder" | "martingale";

/**
 * The knobs. Two systems share them, and the pair that separates those two is
 * `groupsGateBetting` and `maxLadderSteps` — everything else is the same rule.
 */
export interface BettingSystemConfig {
  /**
   * Hands watched before the first bet, which is ALSO how far back the side
   * is read from. One number, because the rule "no bet for the first 12, then
   * mirror the hand 12 back" only lines up if they are the same: hand 13 is
   * the first hand whose reference hand exists.
   */
  lookback: number;
  /** Hands in a group. */
  groupSize: number;
  /** Stake at the bottom of the ladder, in currency. */
  baseStake: number;
  /** Added to the stake after each win. */
  stakeStep: number;
  /** The last hand played. Null runs to the end of the shoe. */
  lastHand: number | null;
  /**
   * Whether a group GATES betting, or is only a reporting window.
   *
   * True (Reverse 12): a loss ends the group — every remaining hand in it is
   * sat out — and the next group opens the ladder again at the base stake.
   * The group is the unit the rule is played in.
   *
   * False (Reverse Streak 4): every hand inside the range carries a stake, a
   * loss resets the ladder on the very next hand, and the ladder runs straight
   * through a group boundary. Groups survive only so the run card can report
   * in sixes.
   */
  groupsGateBetting: boolean;
  /**
   * Consecutive wins the ladder climbs before it drops back to the base.
   *
   * On a gated system this is the group's own length, where it can never bind:
   * a seventh win inside a group of six does not exist. On an ungated one it
   * is the whole cap — at four, the stakes run 100, 200, 300, 400, then 100
   * again however the fourth went, and climb from there.
   */
  maxLadderSteps: number;
  /** How the stake moves. Omitted means "ladder". */
  staking?: SystemStaking;
  /**
   * Martingale only: net wins (wins minus losses) at the held top stake that
   * send it back to the base. Omitted means 2.
   */
  recoveryWins?: number;
  /**
   * Stop betting for the rest of the shoe once the run's wins minus losses
   * reaches this. Omitted or null never stops on it.
   */
  stopAtNetWins?: number | null;
}

export const REVERSE_TWELVE_CONFIG: BettingSystemConfig = {
  lookback: 12,
  groupSize: 6,
  baseStake: 100,
  stakeStep: 100,
  lastHand: 60,
  groupsGateBetting: true,
  // Equal to `groupSize`, so it never binds: the group ends first.
  maxLadderSteps: 6,
};

export const REVERSE_STREAK_FOUR_CONFIG: BettingSystemConfig = {
  lookback: 12,
  groupSize: 6,
  baseStake: 100,
  stakeStep: 100,
  lastHand: 60,
  groupsGateBetting: false,
  maxLadderSteps: 4,
};

/**
 * Reverse Streak 4's side rule with a Martingale stake: 1 unit, doubled after
 * each loss to 2, 4 and 8, back to 1 after any win. A loss at 8 holds the
 * stake at 8 until two net wins there have recovered the climb, and the
 * whole shoe stops once wins exceed losses by eight.
 *
 * `baseStake` is one unit, in currency: 50, so the stakes run 50, 100, 200
 * and 400. Like the other two it stops after hand 60, or sooner if it
 * reaches the net-eight target.
 */
export const REVERSE_STREAK_FOUR_MARTINGALE_CONFIG: BettingSystemConfig = {
  lookback: 12,
  groupSize: 6,
  baseStake: 50,
  stakeStep: 0,
  lastHand: 60,
  groupsGateBetting: false,
  maxLadderSteps: 4,
  staking: "martingale",
  recoveryWins: 2,
  stopAtNetWins: 8,
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
  {
    id: "reverse-streak-4",
    name: "Reverse Streak 4",
    summary: "The same mirror on every hand, climbing to four wins and resetting.",
    defaults: REVERSE_STREAK_FOUR_CONFIG,
  },
  {
    id: "reverse-streak-4-martingale",
    name: "Reverse Streak 4 Martingale",
    summary: "The same mirror on every hand, doubling after a loss up to 8 units, stopping at 8 net wins.",
    defaults: REVERSE_STREAK_FOUR_MARTINGALE_CONFIG,
  },
];

/** The system a run falls back to when none is named. */
export const DEFAULT_BETTING_SYSTEM: BettingSystemDefinition = BETTING_SYSTEMS[0]!;

/**
 * Look a system up, falling back to the default rather than throwing.
 *
 * A stored `activeSystem` outlives the release that wrote it — an id dropped
 * from a later build would otherwise crash the Table tab on load, which is
 * worse than quietly running the default.
 */
export function bettingSystemById(id: BettingSystemId | null | undefined): BettingSystemDefinition {
  return BETTING_SYSTEMS.find((entry) => entry.id === id) ?? DEFAULT_BETTING_SYSTEM;
}

/** Why a hand carried no bet. */
export type SystemSkipReason =
  | "warm-up"
  | "group-over"
  | "past-last-hand"
  | "target-reached"
  | "below-minimum";

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
  /**
   * The group's FIRST losing hand, or null if it ran clean.
   *
   * On Reverse 12 that loss also closed the group. On Reverse Streak 4 the
   * group plays on, so this names where it first went wrong and there may be
   * further losses after it.
   */
  lostAt: number | null;
  /** True when every hand in the group was bet and won — its best case. */
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
  /**
   * 1-based rung of the ladder this stake sits on, or 0 when sitting out.
   *
   * Distinct from `step`, and only the same number on Reverse 12. `step` is
   * the position in the GROUP; this is how many wins the stake is carrying.
   * On Reverse Streak 4 they diverge on the first loss: step 5 of the group
   * can perfectly well be rung 1 of the ladder.
   */
  ladderStep: number;
  /** What to actually put on the table: the ladder's ask, clipped to the table maximum. */
  stake: number;
  /** What the ladder asked for before the table maximum was applied. */
  requestedStake: number;
  /** True when the table maximum is holding the stake below the ladder's ask. */
  clipped: boolean;
  /**
   * True when `stake` is more than the bankroll has left.
   *
   * The stake is NOT reduced to fit: the rule says what it says, and a card
   * that quietly shrank it would be reporting a different system. The client
   * warns instead, which is what every other staking surface here does.
   */
  unaffordable: boolean;
  /**
   * Martingale only, while the stake is held at the top: net wins banked at
   * that stake so far (can be negative). Null whenever it is not holding.
   */
  holdNet: number | null;
  /**
   * Martingale only, while holding at the top stake: how much of the
   * climb's loss is still to win back (0 once it is back). Null when not
   * holding.
   */
  holdShortfall: number | null;
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
  /**
   * Hands whose stake the table maximum held below the ladder's ask.
   *
   * Without this the card reports a net and a "biggest bet" for a ladder the
   * player never actually climbed, while `replayStrategies` on the very same
   * screen calls the identical event a breakdown. This system does not stop
   * at the ceiling the way a Martingale must — its ask is bounded, so it
   * keeps playing at the cap — but it must still say so.
   */
  clippedBets: number;
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
  /** Wins minus losses over the run. */
  netHands: number;
  /** The hand on which `stopAtNetWins` was reached, or null if it was not. */
  targetReachedAt: number | null;
}

/**
 * Where the stake stands between bets. `banked` drives a ladder; the rest
 * drive a Martingale. A "climb" runs from a bet at one unit to the win that
 * ends it (or the end of a hold); `climbProfit` is its running money and
 * `climbClipped` whether the table maximum cut any of its stakes.
 */
interface StakeState {
  banked: number;
  level: number;
  holding: boolean;
  holdNet: number;
  climbProfit: number;
  climbClipped: boolean;
}

const FRESH_STAKE: StakeState = {
  banked: 0,
  level: 0,
  holding: false,
  holdNet: 0,
  climbProfit: 0,
  climbClipped: false,
};

function isMartingale(config: BettingSystemConfig): boolean {
  return config.staking === "martingale";
}

/** What the rule asks to stake from this state, before any table maximum. */
function askFor(config: BettingSystemConfig, state: StakeState): number {
  if (isMartingale(config)) {
    const top = Math.max(0, config.maxLadderSteps - 1);
    return config.baseStake * 2 ** (state.holding ? top : Math.min(state.level, top));
  }
  return config.baseStake + state.banked * config.stakeStep;
}

/** 1-based rung the next stake sits on: the top rung while a Martingale holds. */
function rungOf(config: BettingSystemConfig, state: StakeState): number {
  if (isMartingale(config)) return state.holding ? config.maxLadderSteps : state.level + 1;
  return state.banked + 1;
}

/** Move the stake on after a settled bet. Mutates `state`. */
function advanceStake(
  config: BettingSystemConfig,
  state: StakeState,
  won: boolean,
  profit: number,
  clipped: boolean,
): void {
  if (!isMartingale(config)) {
    if (won) {
      state.banked += 1;
      // The cap. At four the fifth hand drops to the base however the fourth
      // went, and climbs again from there.
      if (state.banked >= config.maxLadderSteps) state.banked = 0;
    } else {
      state.banked = 0;
    }
    return;
  }
  state.climbProfit += profit;
  if (clipped) state.climbClipped = true;
  if (state.holding) {
    // Two net wins, as the rule is written, AND the climb's money actually
    // back — which is the reason for the two wins (8 + 8 > 1 + 2 + 4 + 8).
    // Usually the wins alone do it; they fall short when the table maximum
    // cut a stake in the climb, or when Banker commission (or a loss inside
    // the hold) eats into what they paid.
    state.holdNet += won ? 1 : -1;
    const winsDone = state.holdNet >= (config.recoveryWins ?? 2);
    const moneyBack = state.climbProfit >= -1e-9;
    if (winsDone && moneyBack) Object.assign(state, FRESH_STAKE);
    return;
  }
  if (won) {
    const atTop = state.level + 1 >= config.maxLadderSteps;
    if (atTop && state.climbProfit < -1e-9) {
      // A win on the top stake that still leaves the climb behind (a high
      // Banker commission, or a cut stake) has not recovered it: hold the
      // top stake, with the win counted, until the money is back too.
      state.holding = true;
      state.holdNet = config.recoveryWins ?? 2;
      return;
    }
    // Otherwise a win ends the climb.
    Object.assign(state, FRESH_STAKE);
  } else if (state.level + 1 < config.maxLadderSteps) {
    state.level += 1;
  } else {
    // Lost at the top stake: hold it there rather than doubling past the cap.
    state.holding = true;
    state.holdNet = 0;
  }
}

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
  /**
   * Which system to run. Null or omitted runs `DEFAULT_BETTING_SYSTEM`.
   *
   * This used to be `BETTING_SYSTEMS[0]!` inside the function, which was
   * harmless with one system and a silent lie with two: selecting Reverse
   * Streak 4 would have staked it under Reverse 12's rules while every card
   * on screen carried the name of the system the player chose.
   */
  system?: BettingSystemId | null;
  config?: Partial<BettingSystemConfig>;
  /** Table ceiling in currency. A stake above it is clipped. Null = no ceiling. */
  tableMax?: number | null;
  /**
   * Table floor in currency. A stake below it cannot be placed, so that
   * hand is sat out and moves nothing — the ladder, the hold and the
   * stop-win all carry on as if it had not been dealt. Null = no floor.
   */
  tableMin?: number | null;
  /**
   * Money available for the NEXT bet, used only to flag an unaffordable one.
   *
   * Deliberately not applied to the replay: that is hindsight over a shoe
   * that already happened, and stopping it at today's balance would report a
   * system the player did not play. `replayStrategies` takes a bankroll
   * because a Martingale's ask grows without bound and running out is how it
   * fails; this ladder tops out at a known step.
   */
  bankroll?: number | null;
}

/**
 * Merge overrides onto the defaults, ignoring keys explicitly set undefined.
 *
 * A bare spread lets `{ lastHand: undefined }` through — `exactOptionalPropertyTypes`
 * is off, so it typechecks — and `hand > undefined` is false for every hand,
 * which silently disables the stop-at-60 rule and has the cards render
 * "after hand undefined".
 */
function resolveConfig(
  defaults: BettingSystemConfig,
  overrides: Partial<BettingSystemConfig> | undefined,
): BettingSystemConfig {
  const merged = { ...defaults };
  if (!overrides) return merged;
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

/**
 * Play one shoe through the system and report what it did.
 *
 * The ladder is defined on STAKES, so a run of six wins stakes base,
 * base+step, ... regardless of what each win paid. That matters on Banker,
 * where a win returns 0.95x: six perfect Banker hands on Reverse 12's config
 * stake $2,100 and return $1,995, not $2,100. The gap is the commission, and
 * it is the reason the per-unit figure lands where it does.
 *
 * Note what that means for Reverse Streak 4's cap. Four wins at 100, 200, 300
 * and 400 return 1,000 on Banker rather than 1,000 flat — and the reset hands
 * the next loss a 100 stake instead of a 500 one. Capping the ladder cuts the
 * size of the swings in both directions; it cannot cut the rate, which is the
 * house edge and is untouched by when or how much you bet.
 */
export function runBettingSystem(options: RunBettingSystemOptions): SystemRun {
  const definition = bettingSystemById(options.system);
  const config = resolveConfig(definition.defaults, options.config);
  const { rules, tableMax = null, tableMin = null, bankroll = null } = options;
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
  let clippedBets = 0;
  let approximate = false;

  // Live stake state (see `StakeState`). `groupDead` is the "stop until the
  // next group" rule, which only a gated system ever sets; `targetReachedAt`
  // is the "stop for the shoe" rule, which only a system with a net-wins
  // target ever sets.
  const stakeState: StakeState = { ...FRESH_STAKE };
  let groupDead = false;
  let targetReachedAt: number | null = null;
  let current: SystemGroup | null = null;

  const firstBettingHand = config.lookback + 1;

  for (let position = 0; position < sequence.length; position += 1) {
    const hand = position + 1;
    const entry = sequence[position]!;

    const pastEnd = config.lastHand !== null && hand > config.lastHand;
    const warmingUp = hand < firstBettingHand;

    let group: number | null = null;
    let step: number | null = null;
    // Once the net-wins target has stopped the run, the rest of the shoe is
    // outside it: no group is opened, so none is reported as a group that
    // was never bet or counted towards the clean-group rate.
    if (!warmingUp && !pastEnd && targetReachedAt === null) {
      const offset = hand - firstBettingHand;
      group = Math.floor(offset / config.groupSize) + 1;
      step = (offset % config.groupSize) + 1;

      if (step === 1) {
        // A new group resets the ladder and revives betting — but only where
        // the group is the unit of play. Ungated, the ladder runs straight
        // through the boundary and the group is a reporting window.
        if (config.groupsGateBetting) {
          Object.assign(stakeState, FRESH_STAKE);
          groupDead = false;
        }
        const covers = hand + config.groupSize - 1;
        // Clamped twice, so a group the run ends inside never claims hands it
        // was not allowed to play (config.lastHand) OR hands the shoe never
        // dealt (sequence.length). Without the second the card reads
        // "hands 37-42" on a shoe that stopped at 40.
        const allowed = config.lastHand === null ? covers : Math.min(covers, config.lastHand);
        current = {
          group,
          firstHand: hand,
          lastHand: Math.min(allowed, sequence.length),
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
        : targetReachedAt !== null
          ? "target-reached"
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

    const wanted = askFor(config, stakeState);
    const stake = tableMax === null ? wanted : Math.min(wanted, tableMax);
    if (tableMin !== null && stake < tableMin - 1e-9) {
      hands.push({
        hand,
        sourceIndex: entry.sourceIndex,
        outcome: entry.outcome,
        group,
        step,
        bet: null,
        skipped: "below-minimum",
        referenceHand,
        stake: 0,
        result: null,
        profit: 0,
        balance,
      });
      continue;
    }
    if (stake < wanted - 1e-9) clippedBets += 1;

    const settlement = settleWager(
      { bet: side, amount: stake },
      // A live coup carries `bankerWinOnSix` when the player answered it,
      // so a no-commission Banker leg settles exactly — which matters now
      // that the Martingale's recovery test reads this money. Coups restored
      // from the shoe archive do not carry it, and those legs still come
      // back `unsettled`: the run card's "slightly generous" caveat.
      {
        outcome: entry.outcome,
        playerPair: entry.coup.playerPair,
        bankerPair: entry.coup.bankerPair,
        ...(entry.coup.bankerWinOnSix !== undefined
          ? { bankerWinOnSix: entry.coup.bankerWinOnSix }
          : {}),
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

    // `current` is always set here: a bet needs `skipped === null`, which
    // needs a group, and a group's first hand assigns it.
    const group_ = current!;
    group_.bets += 1;
    group_.staked += stake;
    group_.net += settlement.profit;
    if (won) group_.wins += 1;
    // The FIRST loss, not the last: a gated group only ever has one, but an
    // ungated one keeps playing, and "lost on 41" should name where the group
    // first went wrong rather than wherever it last did.
    else if (group_.lostAt === null) group_.lostAt = hand;
    // Recomputed rather than set on the winning sixth hand, because a group
    // that keeps betting after a loss can also reach six bets: `bets === 6`
    // alone would call a 5-1 group clean.
    group_.perfect = group_.lostAt === null && group_.bets === config.groupSize;

    advanceStake(config, stakeState, won, settlement.profit, stake < wanted - 1e-9);
    if (!won && config.groupsGateBetting) groupDead = true;
    if (
      config.stopAtNetWins != null &&
      targetReachedAt === null &&
      wins - losses >= config.stopAtNetWins
    ) {
      targetReachedAt = hand;
      // The group ends here too: it covers no hand the rule will play.
      group_.lastHand = hand;
    }

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
    next: describeNext(sequence, config, stakeState, groupDead, targetReachedAt !== null, tableMax, bankroll),
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
    clippedBets,
    perUnit: staked === 0 ? 0 : balance / staked,
    perfectGroups: groups.filter((group) => group.perfect).length,
    incomplete: target !== null && sequence.length < target,
    approximate,
    netHands: wins - losses,
    targetReachedAt,
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
  stakeState: StakeState,
  groupDead: boolean,
  targetReached: boolean,
  tableMax: number | null,
  bankroll: number | null,
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
    ladderStep: 0,
    stake: 0,
    requestedStake: 0,
    clipped: false,
    unaffordable: false,
    holdNet: null,
    holdShortfall: null,
  });

  if (config.lastHand !== null && hand > config.lastHand) return idle("past-last-hand", null, null);
  if (hand < firstBettingHand) return idle("warm-up", null, null);
  if (targetReached) return idle("target-reached", null, null);

  const offset = hand - firstBettingHand;
  const group = Math.floor(offset / config.groupSize) + 1;
  const step = (offset % config.groupSize) + 1;

  // Opening a group wipes the slate; mid-group, a dead group stays dead.
  // Both only where the group gates play at all — ungated, `groupDead` is
  // never set and the ladder carries across the boundary untouched.
  const opening = step === 1 && config.groupsGateBetting;
  if (!opening && groupDead) return idle("group-over", group, step);

  const state = opening ? FRESH_STAKE : stakeState;
  const referenceHand = hand - config.lookback;
  const reference = sequence[referenceHand - 1];
  // Defensive: with lookback >= 1 this hand always exists, because the
  // warm-up check above guarantees hand > lookback.
  if (!reference) return idle("warm-up", null, null);

  // The same clip the run applies. Without it the card names the ladder's
  // ask while the run books the capped amount, so the Table tab instructs a
  // stake above the table maximum.
  const requestedStake = askFor(config, state);
  const stake = tableMax === null ? Math.max(0, requestedStake) : Math.min(requestedStake, tableMax);

  return {
    hand,
    group,
    step,
    bet: opposite(reference.outcome),
    skipped: null,
    referenceHand,
    ladderStep: rungOf(config, state),
    stake,
    requestedStake,
    clipped: stake < requestedStake - 1e-9,
    unaffordable: bankroll !== null && stake > bankroll + 1e-9,
    holdNet: isMartingale(config) && state.holding ? state.holdNet : null,
    holdShortfall: isMartingale(config) && state.holding ? Math.max(0, -state.climbProfit) : null,
  };
}
