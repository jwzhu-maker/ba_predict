import { bestBet, valuateAllBets } from "./ev";
import { kellyStake } from "./kelly";
import { coupProbabilities } from "./odds";
import type { ProgressionOptions, ProgressionState } from "./progressions";
import { canDealCoup, cardsRemaining, penetration } from "./shoe";
import { BET_TYPES } from "./types";
import type {
  BetType,
  BetValuation,
  CoupProbabilities,
  ShoeState,
  TableRules,
} from "./types";

/**
 * The bit the user actually asked for: what to bet next, and how much.
 *
 * The honest version of that question has three answers layered on top of each
 * other, and this module keeps them distinct rather than blending them into
 * one confident-looking number:
 *
 *  1. What are the odds right now?  Exact, from the shoe composition.
 *  2. Is any bet worth making?      Kelly, which answers "no" on a real table.
 *  3. If playing anyway, how much?  The user's own staking plan, bounded by
 *     the table limits and their stop-loss, with the cost stated plainly.
 */

export interface BankrollState {
  /** Bankroll at the start of the session, in currency. */
  startingBankroll: number;
  /** Bankroll now, in currency. */
  bankroll: number;
  /** Currency value of one betting unit. */
  unitSize: number;
  tableMin: number;
  tableMax: number;
  /** Walk away once up this much, in currency. Null disables. */
  stopWin: number | null;
  /** Walk away once down this much, in currency. Null disables. */
  stopLoss: number | null;
}

export type AdviceAction = "bet" | "sit-out" | "stop" | "shuffle";

export interface AdviceInput {
  shoe: ShoeState;
  rules: TableRules;
  bankroll: BankrollState;
  progression: ProgressionState;
  progressionOptions: ProgressionOptions;
  /** "auto" follows the lowest house edge, which is Banker on any real table. */
  preferredBet: BetType | "auto";
  /** Fraction of full Kelly to use when a bet is genuinely +EV. */
  kellyMultiplier: number;
  /**
   * How to render a money amount inside the advice text.
   *
   * The reasons and warnings quote real amounts, so they have to agree with
   * whatever the rest of the screen shows. Fixing two decimal places in here
   * put "you are up 200.00" next to a bankroll rendered as "RM 200.00"; the
   * caller owns the currency, so the caller owns the formatting. Defaults to
   * two decimal places when no formatter is supplied.
   */
  formatAmount?: (value: number) => string;
}

export interface Advice {
  action: AdviceAction;
  bet: BetType | null;
  /** Stake in currency, already rounded to a chip increment and clamped to the table. */
  amount: number;
  /** The same stake in betting units. */
  units: number;
  probabilities: CoupProbabilities | null;
  valuations: Record<BetType, BetValuation> | null;
  /** Bets ordered from cheapest to most expensive. */
  ranked: BetValuation[];
  kelly: { fraction: number; stake: number };
  /** Expected cost of placing this wager, in currency. Always positive on a real table. */
  expectedCost: number;
  reasons: string[];
  /**
   * How the stake was arrived at, kept OUT of `reasons` on purpose.
   *
   * It describes the ENGINE's own sizing — "1 unit at 10.00 each" — which is
   * true only while the engine is the thing setting the stake. Once a betting
   * system or a hand-placed wager decides the amount, this sentence is
   * actively wrong, and rendering it alongside the other reasons made the
   * card state a stake it was not about to place. The caller shows it exactly
   * when the engine's amount is the one on the table.
   */
  sizingReason: string | null;
  warnings: string[];
  shoe: { remaining: number; penetration: number };
}

const PRETTY: Record<BetType, string> = {
  banker: "Banker",
  player: "Player",
  tie: "Tie",
  playerPair: "Player Pair",
  bankerPair: "Banker Pair",
  eitherPair: "Either Pair",
  big: "Big",
  small: "Small",
};

export function betLabel(bet: BetType): string {
  return PRETTY[bet];
}

function asPercent(value: number, digits = 2): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** Round a stake down to a whole number of chips and hold it inside the table limits. */
function roundStake(amount: number, bankroll: BankrollState): number {
  const increment = bankroll.unitSize > 0 ? bankroll.unitSize : 1;
  const rounded = Math.floor(amount / increment) * increment;
  const clamped = Math.min(Math.max(rounded, bankroll.tableMin), bankroll.tableMax);
  // Never advise a stake the bankroll cannot cover.
  return Math.min(clamped, bankroll.bankroll);
}

function emptyAdvice(
  action: AdviceAction,
  shoe: ShoeState,
  reasons: string[],
  warnings: string[] = [],
): Advice {
  return {
    action,
    bet: null,
    amount: 0,
    units: 0,
    probabilities: null,
    valuations: null,
    ranked: [],
    kelly: { fraction: 0, stake: 0 },
    expectedCost: 0,
    reasons,
    // Nothing is being staked on this path, so there is no sizing to explain.
    sizingReason: null,
    warnings,
    shoe: { remaining: cardsRemaining(shoe), penetration: penetration(shoe) },
  };
}

export function recommendBet(input: AdviceInput): Advice {
  const { shoe, rules, bankroll, progression, progressionOptions } = input;
  const money = input.formatAmount ?? ((value: number) => value.toFixed(2));
  const shoeInfo = { remaining: cardsRemaining(shoe), penetration: penetration(shoe) };

  if (!canDealCoup(shoe)) {
    return emptyAdvice("shuffle", shoe, [
      "Fewer than six cards remain — the shoe cannot complete another coup.",
    ]);
  }

  const probabilities = coupProbabilities(shoe);
  if (!probabilities) {
    return emptyAdvice("shuffle", shoe, ["The shoe is too depleted to price a coup."]);
  }

  const valuations = valuateAllBets(probabilities, rules);
  const ranked = BET_TYPES.map((bet) => valuations[bet]).sort(
    (a, b) => b.expectedValue - a.expectedValue,
  );
  const cheapest = bestBet(valuations);

  const profit = bankroll.bankroll - bankroll.startingBankroll;
  const reasons: string[] = [];
  const warnings: string[] = [];
  let sizingReason: string | null = null;

  if (bankroll.stopWin !== null && profit >= bankroll.stopWin) {
    return {
      ...emptyAdvice("stop", shoe, [
        `Stop-win reached: you are up ${money(profit)}, at or past your ${money(bankroll.stopWin)} target.`,
        "Every further coup gives the edge back. Booking the win is the only move with a positive expectation here.",
      ]),
      probabilities,
      valuations,
      ranked,
    };
  }

  if (bankroll.stopLoss !== null && -profit >= bankroll.stopLoss) {
    return {
      ...emptyAdvice("stop", shoe, [
        `Stop-loss reached: you are down ${money(-profit)}, at or past your ${money(bankroll.stopLoss)} limit.`,
        "This is the limit you set while you were not losing. It is worth more than this session.",
      ]),
      probabilities,
      valuations,
      ranked,
    };
  }

  if (bankroll.bankroll < bankroll.tableMin) {
    return {
      ...emptyAdvice("stop", shoe, [
        `Your bankroll (${money(bankroll.bankroll)}) is below the table minimum (${money(bankroll.tableMin)}).`,
      ]),
      probabilities,
      valuations,
      ranked,
    };
  }

  const bet = input.preferredBet === "auto" ? cheapest.bet : input.preferredBet;
  const valuation = valuations[bet];

  const kelly = kellyStake({
    bankroll: bankroll.bankroll,
    payoffs: valuation.payoffs,
    multiplier: input.kellyMultiplier,
  });

  // The honest headline: on a normal shoe nothing is +EV and Kelly says zero.
  const positiveEdge = valuation.expectedValue > 0;

  let amount: number;
  if (positiveEdge && kelly.stake > 0) {
    amount = roundStake(kelly.stake, bankroll);
    reasons.push(
      `${PRETTY[bet]} is showing a positive edge of ${asPercent(valuation.expectedValue)} on this composition — rare, and worth a Kelly-sized bet.`,
    );
  } else {
    const requested = progression.units * bankroll.unitSize;
    amount = roundStake(requested, bankroll);
    reasons.push(
      `No bet on this table has a positive expectation, so there is no mathematically correct stake — Kelly sizing returns zero.`,
    );
    sizingReason = `Sizing therefore follows your ${progression.id} plan: ${progression.units} unit${progression.units === 1 ? "" : "s"} at ${money(bankroll.unitSize)} each.`;
  }

  if (bet === cheapest.bet) {
    reasons.push(
      `${PRETTY[bet]} is the cheapest bet available at ${asPercent(valuation.houseEdge)} house edge.`,
    );
  } else {
    warnings.push(
      `${PRETTY[bet]} costs ${asPercent(valuation.houseEdge)} per unit; ${PRETTY[cheapest.bet]} costs ${asPercent(cheapest.houseEdge)}. Switching saves ${asPercent(valuation.houseEdge - cheapest.houseEdge)} of every stake.`,
    );
  }

  if (progression.requestedUnits > progression.units + 1e-9) {
    warnings.push(
      `Your progression wants ${progression.requestedUnits} units but the table caps you at ${progression.units}. The ladder is broken — it can no longer recover the loss it is chasing.`,
    );
  }

  const requestedAmount = progression.units * bankroll.unitSize;
  if (requestedAmount > bankroll.bankroll) {
    warnings.push(
      `The next step needs ${money(requestedAmount)} and you have ${money(bankroll.bankroll)}. The progression has outrun your bankroll.`,
    );
  }
  if (requestedAmount > bankroll.tableMax) {
    warnings.push(
      `The next step needs ${money(requestedAmount)}, over the ${money(bankroll.tableMax)} table maximum.`,
    );
  }

  if (amount > 0 && bankroll.bankroll > 0 && amount / bankroll.bankroll > 0.1) {
    warnings.push(
      `This stake is ${asPercent(amount / bankroll.bankroll, 1)} of your remaining bankroll.`,
    );
  }

  if (progressionOptions.maxUnits !== null && progression.requestedUnits > progressionOptions.maxUnits) {
    warnings.push("The progression has passed the unit ceiling you configured.");
  }

  if (valuation.houseEdge > 0.05) {
    warnings.push(
      `${PRETTY[bet]} is a side bet with a ${asPercent(valuation.houseEdge)} edge — several times the cost of Banker.`,
    );
  }

  const expectedCost = amount * valuation.houseEdge;
  const action: AdviceAction = amount <= 0 ? "sit-out" : "bet";
  if (action === "sit-out") {
    reasons.push("The computed stake rounds to zero at your table minimum and bankroll.");
  }

  return {
    action,
    bet,
    amount,
    sizingReason,
    units: bankroll.unitSize > 0 ? amount / bankroll.unitSize : 0,
    probabilities,
    valuations,
    ranked,
    kelly,
    expectedCost,
    reasons,
    warnings,
    shoe: shoeInfo,
  };
}
