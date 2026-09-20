import {
  betLabel,
  type Advice,
  type BetType,
  type PlacedWager,
  type SystemRun,
} from "@ba-predict/engine";

/**
 * What the app is telling you to do on the very next coup — one answer, from
 * one place.
 *
 * Before this there were three staking opinions on the Table tab at once (the
 * engine's recommendation, the active system's call, and the manual stepper)
 * and only the first had a button. The card now shows exactly one instruction
 * and the recorded result settles against it, so "what the app says" and
 * "what goes on the table" cannot drift apart.
 *
 * Precedence, highest first:
 *
 *   1. a wager placed by hand, which is what "override the recommendation"
 *      has always meant;
 *   2. skipping this coup, which the red button sets;
 *   3. the active betting system, if one is selected;
 *   4. the engine's own recommendation.
 *
 * It lives in app-core because both clients render it and both settle
 * against it, and because the last two features here each shipped a defect
 * that existed twice over — once per client — in exactly this kind of
 * derived copy.
 */

export type TableCallSource = "manual" | "skipped" | "system" | "advice";

export interface TableCall {
  source: TableCallSource;
  /** The bet to back, or null when the app says put nothing on this coup. */
  bet: BetType | null;
  /** What to stake. Zero whenever `bet` is null. */
  amount: number;
  /** The system's name when it is the one speaking, else null. */
  systemName: string | null;
  /** One line of "why this", for under the amount. Null when there is nothing to add. */
  detail: string | null;
  /** Why nothing is being staked. Null whenever `bet` is set. */
  noBetReason: string | null;
  /** What the ladder asked for before the table maximum, when that is lower. */
  requestedAmount: number | null;
  /** True when the table maximum is holding the stake down. */
  clipped: boolean;
  /** True when the stake is more than the bankroll has left. */
  unaffordable: boolean;
  /**
   * Whether the engine's own sizing sentence still describes the stake.
   *
   * `Advice.sizingReason` says "1 unit at 10.00 each", which is true only
   * while the engine is the thing setting the amount. A system staking 100
   * or a hand-placed 400 makes it a false statement about money the card is
   * about to move, so the clients render it exactly when this is true.
   */
  engineSizes: boolean;
}

export interface TableCallInput {
  advice: Advice;
  /** The active system's run, or null when no system is selected. */
  run: SystemRun | null;
  /** A wager placed by hand, which outranks everything else. */
  manualWager: PlacedWager | null;
  /** True when the user pressed "I don't bet this time". */
  skipped: boolean;
  /** Money left, so an unaffordable call can be flagged. */
  bankroll: number;
}

const IDLE = {
  systemName: null,
  detail: null,
  requestedAmount: null,
  clipped: false,
  unaffordable: false,
  engineSizes: false,
} as const;

export function resolveTableCall(input: TableCallInput): TableCall {
  const { advice, run, manualWager, skipped, bankroll } = input;

  // 1. A hand-placed wager is the whole point of the override control.
  if (manualWager) {
    return {
      ...IDLE,
      source: "manual",
      bet: manualWager.bet,
      amount: manualWager.amount,
      noBetReason: null,
      detail: "Placed by hand, overriding the suggestion",
      unaffordable: manualWager.amount > bankroll,
    };
  }

  // 2. Sitting this one out by choice.
  if (skipped) {
    return {
      ...IDLE,
      source: "skipped",
      bet: null,
      amount: 0,
      noBetReason: "You are sitting this coup out. Recording the result will stake nothing.",
    };
  }

  // 3. The active system, which decides the side and the stake AND whether
  //    to bet at all — the part the engine's recommendation cannot express.
  if (run) {
    const next = run.next;
    if (next.bet === null) {
      return {
        ...IDLE,
        source: "system",
        systemName: run.name,
        bet: null,
        amount: 0,
        noBetReason: describeSystemSkip(run),
      };
    }
    return {
      source: "system",
      engineSizes: false,
      systemName: run.name,
      bet: next.bet,
      amount: next.stake,
      noBetReason: null,
      detail: `Hand ${next.hand} · group ${next.group}, bet ${next.step} of ${run.config.groupSize} · mirroring hand ${next.referenceHand}${
        next.step === 1 ? " · fresh group, back to the base stake" : ""
      }`,
      requestedAmount: next.clipped ? next.requestedStake : null,
      clipped: next.clipped,
      unaffordable: next.unaffordable,
    };
  }

  // 4. The engine's own answer, which is what the app said before any system
  //    existed and is still right when none is selected.
  if (advice.action !== "bet" || !advice.bet) {
    return {
      ...IDLE,
      source: "advice",
      bet: null,
      amount: 0,
      noBetReason:
        advice.action === "stop"
          ? "The app says walk away. Recording the result will stake nothing."
          : advice.action === "shuffle"
            ? "The shoe is spent. Recording the result will stake nothing."
            : "No stake this coup. Recording the result will stake nothing.",
    };
  }
  return {
    ...IDLE,
    source: "advice",
    engineSizes: true,
    bet: advice.bet,
    amount: advice.amount,
    noBetReason: null,
    detail: `${betLabel(advice.bet)} is the cheapest bet on the table`,
    unaffordable: advice.amount > bankroll,
  };
}

/** Plain English for why a system is not betting this coup. */
function describeSystemSkip(run: SystemRun): string {
  const { config, next } = run;
  switch (next.skipped) {
    case "warm-up": {
      const left = Math.max(0, config.lookback + 1 - next.hand);
      return `Watching. ${left} more hand${left === 1 ? "" : "s"} before the first bet — hand ${
        config.lookback + 1
      } is the first with a hand ${config.lookback} back to mirror.`;
    }
    case "group-over":
      return `Group ${next.group} lost, so ${run.name} sits out the rest of it.`;
    case "past-last-hand":
      return `Done for this shoe — hand ${config.lastHand} is the last one ${run.name} plays. Ties are not counted, so there may still be cards left.`;
    default:
      return `${run.name} is not betting this coup.`;
  }
}

/**
 * The wager a recorded result should settle against.
 *
 * Null means the coup updates the road and the ledger records no stake. The
 * clients pass this into `record-coup`, so the money that moves is always the
 * money the card was showing.
 */
export function callToWager(call: TableCall): PlacedWager | null {
  if (call.bet === null || call.amount <= 0) return null;
  return { bet: call.bet, amount: call.amount };
}
