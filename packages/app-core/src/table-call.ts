import {
  betLabel,
  type Advice,
  type BetType,
  type PlacedWager,
  type SystemRun,
} from "@ba-predict/engine";
import { nextHandDetail } from "./system-copy";

/**
 * What the app is telling you to do on the very next coup — one answer, from
 * one place.
 *
 * Two things are resolved here and they are deliberately separate:
 *
 *   - `bet`/`amount` is what the app SAYS. It is display, and it is shown
 *     even when nothing will be staked, because "the rule wants Player 400
 *     and I am not taking it" is information.
 *   - `stakes` is whether recording a result will actually move money.
 *
 * Collapsing the two is how the first cut of opt-out staking went wrong: the
 * active system was resolved before the engine's advice was even looked at,
 * so a stop-loss, a spent shoe and a stake larger than the bankroll all
 * stopped gating anything the moment a system was selected. Before opt-out
 * those were enforced by a disabled button; now they have to be enforced
 * here, because there is no button left to disable.
 *
 * Precedence for the INSTRUCTION, highest first:
 *
 *   1. a wager placed by hand, which is what "override the recommendation"
 *      has always meant;
 *   2. skipping this coup, which the red button sets;
 *   3. the active betting system, if one is selected;
 *   4. the engine's own recommendation.
 *
 * Anything that stops money moving — observe mode, a finished shoe, the
 * engine calling a stop, a stake the bankroll cannot cover — is applied
 * AFTER that, so the card can keep telling you what the rule wanted while
 * refusing to act on it.
 *
 * It lives in app-core because both clients render it and both settle
 * against it, and because the last three features here each shipped a defect
 * that existed twice over, once per client, in exactly this kind of code.
 */

export type TableCallSource = "manual" | "skipped" | "system" | "advice";

/** Whether the app is playing along or just keeping score. */
export type TableMode = "play" | "observe";

export interface TableCall {
  source: TableCallSource;
  /** The bet the app is pointing at, or null when it is pointing at nothing. */
  bet: BetType | null;
  /** The amount it is pointing at. Zero whenever `bet` is null. */
  amount: number;
  /**
   * Whether recording a result will move money.
   *
   * False whenever `bet` is null, and ALSO when something is refusing to act
   * on a live instruction — observe mode, a stop, an unaffordable stake.
   */
  stakes: boolean;
  /**
   * Why a live instruction is not being staked. Null when `stakes` is true,
   * or when there is no instruction to refuse.
   */
  blockedReason: string | null;
  /** The system's name when it is the one speaking, else null. */
  systemName: string | null;
  /** One line of "why this", for under the amount. */
  detail: string | null;
  /** Why the app is pointing at nothing. Null whenever `bet` is set. */
  noBetReason: string | null;
  /** What the ladder asked for before the table maximum, when that is lower. */
  requestedAmount: number | null;
  /** True when the table maximum is holding the stake down. */
  clipped: boolean;
  /** True when the stake is more than the bankroll has left. */
  unaffordable: boolean;
  /** Whether the engine's own sizing sentence still describes the stake. */
  engineSizes: boolean;
}

export interface TableCallInput {
  advice: Advice;
  /** The active system's run, or null when no system is selected. */
  run: SystemRun | null;
  /**
   * True when `run` describes a shoe that is already over.
   *
   * Without it the call carries the FINISHED shoe's ladder step into the
   * fresh one: press "New shoe" twenty coups in and the card reads "group 2,
   * bet 3 of 6, mirroring hand 9" on a shoe with no hands in it, then stakes
   * it. The system should be back in its warm-up.
   */
  finished: boolean;
  /** A wager placed by hand, which outranks everything else. */
  manualWager: PlacedWager | null;
  /** True when the user pressed "I don't bet this time". */
  skipped: boolean;
  /** Money left, so an unaffordable call can be refused. */
  bankroll: number;
  /** "observe" keeps score without ever staking. */
  mode: TableMode;
}

const IDLE = {
  systemName: null,
  detail: null,
  requestedAmount: null,
  clipped: false,
  unaffordable: false,
  engineSizes: false,
  blockedReason: null,
} as const;

/** The instruction, before anything that might refuse to act on it. */
function pointAt(input: TableCallInput): TableCall {
  const { advice, run, finished, manualWager, skipped } = input;

  if (manualWager) {
    return {
      ...IDLE,
      source: "manual",
      bet: manualWager.bet,
      amount: manualWager.amount,
      stakes: true,
      noBetReason: null,
      detail: "Placed by hand, overriding the suggestion",
    };
  }

  if (skipped) {
    return {
      ...IDLE,
      source: "skipped",
      bet: null,
      amount: 0,
      stakes: false,
      noBetReason: "You are sitting this coup out.",
    };
  }

  if (run && !finished) {
    const next = run.next;
    if (next.bet === null) {
      return {
        ...IDLE,
        source: "system",
        systemName: run.name,
        bet: null,
        amount: 0,
        stakes: false,
        noBetReason: describeSystemSkip(run),
      };
    }
    return {
      ...IDLE,
      source: "system",
      systemName: run.name,
      bet: next.bet,
      amount: next.stake,
      stakes: true,
      noBetReason: null,
      // Shared with the system's own card, because the two sit one above
      // the other and a group step is not a ladder rung on every system.
      detail: nextHandDetail(run),
      requestedAmount: next.clipped ? next.requestedStake : null,
      clipped: next.clipped,
    };
  }

  if (run && finished) {
    return {
      ...IDLE,
      source: "system",
      systemName: run.name,
      bet: null,
      amount: 0,
      stakes: false,
      noBetReason: `That shoe is finished. ${run.name} starts again from its warm-up on the next one.`,
    };
  }

  if (advice.action !== "bet" || !advice.bet) {
    return {
      ...IDLE,
      source: "advice",
      bet: null,
      amount: 0,
      stakes: false,
      noBetReason:
        advice.action === "stop"
          ? "The app says walk away."
          : advice.action === "shuffle"
            ? "The shoe is spent."
            : "No stake this coup.",
    };
  }
  return {
    ...IDLE,
    source: "advice",
    engineSizes: true,
    bet: advice.bet,
    amount: advice.amount,
    stakes: true,
    noBetReason: null,
    detail: `${betLabel(advice.bet)} is the cheapest bet on the table`,
  };
}

export function resolveTableCall(input: TableCallInput): TableCall {
  const call = pointAt(input);
  const { advice, bankroll, mode } = input;

  if (!call.stakes || call.bet === null) return call;

  const unaffordable = call.amount > bankroll;

  // Every one of these used to be enforced by a button being disabled. With
  // the stake opt-out there is no button, so they are enforced here or not
  // at all — and the instruction stays on screen either way, because
  // hiding it would not tell the player what their rule wanted.
  const blockedReason =
    mode === "observe"
      ? "Observing — recording results keeps score without staking anything."
      : unaffordable
        ? "More than your bankroll has left, so nothing will be staked."
        : advice.action === "stop"
          ? "Your stop is reached, so nothing will be staked."
          : advice.action === "shuffle"
            ? "The shoe is spent, so nothing will be staked."
            : null;

  if (blockedReason === null) return { ...call, unaffordable };
  return { ...call, stakes: false, unaffordable, blockedReason };
}

/**
 * Plain English for why a system is not betting this coup.
 *
 * Kept SHORT on purpose. This card reserves a height so the Record buttons
 * below it cannot move, and that floor has to cover the longest thing the
 * card can say — so every extra clause here is whitespace under every other
 * state, on the narrowest phone, forever. The system's own card directly
 * below gives each of these in full (why the warm-up is twelve hands, which
 * group resumes when and at what stake, that ties are not counted), so
 * nothing is lost by this one being terse.
 */
function describeSystemSkip(run: SystemRun): string {
  const { config, next } = run;
  switch (next.skipped) {
    case "warm-up": {
      const left = Math.max(0, config.lookback + 1 - next.hand);
      return `Watching. ${left} more hand${left === 1 ? "" : "s"} before the first bet.`;
    }
    case "group-over":
      return `Group ${next.group} lost, so ${run.name} sits out the rest of it.`;
    case "past-last-hand":
      return `Done for this shoe — hand ${config.lastHand} is the last one ${run.name} plays.`;
    default:
      return `${run.name} is not betting this coup.`;
  }
}

/**
 * The wager a recorded result should settle against.
 *
 * Null means the coup updates the road and the ledger records no stake. It
 * reads `stakes` rather than `bet`, which is the whole point of the split:
 * the card can be pointing at Player 400 while this correctly answers null.
 */
export function callToWager(call: TableCall): PlacedWager | null {
  if (!call.stakes || call.bet === null || call.amount <= 0) return null;
  return { bet: call.bet, amount: call.amount };
}
