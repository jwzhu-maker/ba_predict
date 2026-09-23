import type { Rank } from "./cards";

/** Every bet this engine can price. */
export type BetType =
  | "banker"
  | "player"
  | "tie"
  | "playerPair"
  | "bankerPair"
  | "eitherPair"
  | "big"
  | "small";

export const BET_TYPES: readonly BetType[] = [
  "banker",
  "player",
  "tie",
  "playerPair",
  "bankerPair",
  "eitherPair",
  "big",
  "small",
];

/** The three ways a coup can settle. */
export type Outcome = "player" | "banker" | "tie";

/** What a wager did to the bankroll. */
export type BetResult = "win" | "loss" | "push";

/**
 * Table rules. Defaults describe the commonest 8-deck commission game.
 *
 * `bankerSixPayout` switches the table to a "no commission" variant: the
 * commission is waived and a Banker win on a total of 6 pays at this reduced
 * rate instead. Leave it null for the standard 5% game.
 */
export interface TableRules {
  decks: number;
  /** Fraction withheld from a winning Banker bet, e.g. 0.05. Ignored when `bankerSixPayout` is set. */
  bankerCommission: number;
  /** Payout for a Banker win on 6 under no-commission rules, e.g. 0.5. Null = standard commission game. */
  bankerSixPayout: number | null;
  /** Net payout on Tie, i.e. 8 means 8:1. */
  tiePayout: number;
  /** Net payout on a Player/Banker pair, i.e. 11 means 11:1. */
  pairPayout: number;
  /** Net payout on Either Pair. */
  eitherPairPayout: number;
  /** Net payout on Big (5 or 6 cards dealt). */
  bigPayout: number;
  /** Net payout on Small (4 cards dealt). */
  smallPayout: number;
}

export const DEFAULT_RULES: TableRules = {
  decks: 8,
  bankerCommission: 0.05,
  bankerSixPayout: null,
  tiePayout: 8,
  pairPayout: 11,
  eitherPairPayout: 5,
  bigPayout: 0.54,
  smallPayout: 1.5,
};

/** Exact probabilities for one coup, given a shoe composition. */
export interface CoupProbabilities {
  banker: number;
  player: number;
  tie: number;
  /** Banker wins *and* the winning total is 6 — priced separately for no-commission tables. */
  bankerWinsWithSix: number;
  /** The coup ends after exactly four cards ("Small"). */
  fourCards: number;
  fiveCards: number;
  sixCards: number;
  playerPair: number;
  bankerPair: number;
  eitherPair: number;
}

/** One discrete return an outcome can produce, as a multiple of the stake. */
export interface PayoffOutcome {
  probability: number;
  /** Net return per unit staked: +0.95 for a commissioned Banker win, -1 for a loss, 0 for a push. */
  netReturn: number;
}

export interface BetValuation {
  bet: BetType;
  /** Expected net return per unit staked. Negative on every real baccarat bet. */
  expectedValue: number;
  /** House edge as a positive fraction of the stake, i.e. -expectedValue. */
  houseEdge: number;
  /** Probability the bet wins something. */
  winProbability: number;
  /** Probability the stake comes back untouched (Tie on a Banker/Player bet). */
  pushProbability: number;
  /** Full discrete distribution of returns, used for Kelly and simulation. */
  payoffs: readonly PayoffOutcome[];
}

/** A shoe's remaining cards, counted per rank. */
export interface ShoeState {
  decks: number;
  /** Remaining count for each rank, indexed to match RANKS. */
  byRank: readonly number[];
  /** Cards removed so far, newest last. Used for undo. */
  discards: readonly Rank[];
}

/** One settled coup, as the user recorded it. */
export interface CoupRecord {
  outcome: Outcome;
  playerPair: boolean;
  bankerPair: boolean;
  /**
   * Whether Banker won on a total of 6, when the player said so. Only
   * recorded for a Banker result; absent otherwise, and on coups restored
   * from the shoe archive, whose encoding does not carry it.
   */
  bankerWinOnSix?: boolean;
  /** The wager placed on this coup, if any. */
  wager?: {
    bet: BetType;
    amount: number;
    result: BetResult;
    /** Signed change to the bankroll, commission already deducted. */
    profit: number;
  };
}
