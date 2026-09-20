import type { BankrollState } from "./advisor";
import type { Rank } from "./cards";
import {
  DEFAULT_PROGRESSION_OPTIONS,
  advanceProgression,
  initProgression,
  type ProgressionId,
  type ProgressionOptions,
  type ProgressionState,
} from "./progressions";
import { createShoe, dealCards } from "./shoe";
import { DEFAULT_RULES } from "./types";
import type { BetResult, BetType, CoupRecord, Outcome, ShoeState, TableRules } from "./types";

export interface PlacedWager {
  bet: BetType;
  /** Stake in currency. */
  amount: number;
}

/** Everything the user can tell the app about a coup that just settled. */
export interface CoupInput {
  outcome: Outcome;
  playerPair?: boolean;
  bankerPair?: boolean;
  /** Cards dealt this coup, for composition tracking. Optional. */
  cards?: readonly Rank[];
  /** How many cards the coup used. Required to settle Big/Small. */
  cardCount?: 4 | 5 | 6;
  /** Whether Banker won on a total of 6. Required to settle Banker on a no-commission table. */
  bankerWinOnSix?: boolean;
}

export interface Settlement {
  result: BetResult;
  /** Signed change to the bankroll, commission already applied. */
  profit: number;
  /** Set when the coup did not carry enough detail to settle the wager. */
  unsettled?: string;
}

/**
 * Work out what a wager paid.
 *
 * Two bets need information beyond the winner. Big/Small needs the card count,
 * and a no-commission Banker bet needs to know whether Banker won with 6.
 * Rather than guess — which would quietly corrupt the ledger the whole app is
 * built to keep honest — an incomplete coup comes back `unsettled` and the
 * client asks for the missing detail.
 */
export function settleWager(
  wager: PlacedWager,
  coup: CoupInput,
  rules: TableRules,
): Settlement {
  const { amount } = wager;
  const win = (multiplier: number): Settlement => ({
    result: "win",
    profit: amount * multiplier,
  });
  const loss: Settlement = { result: "loss", profit: -amount };
  const push: Settlement = { result: "push", profit: 0 };

  switch (wager.bet) {
    case "banker": {
      if (coup.outcome === "tie") return push;
      if (coup.outcome === "player") return loss;
      if (rules.bankerSixPayout === null) return win(1 - rules.bankerCommission);
      if (coup.bankerWinOnSix === undefined) {
        return {
          result: "win",
          profit: amount,
          unsettled:
            "This table pays a reduced rate on a Banker win with 6. Record whether Banker won on 6 to settle exactly.",
        };
      }
      return win(coup.bankerWinOnSix ? rules.bankerSixPayout : 1);
    }
    case "player":
      if (coup.outcome === "tie") return push;
      return coup.outcome === "player" ? win(1) : loss;
    case "tie":
      return coup.outcome === "tie" ? win(rules.tiePayout) : loss;
    case "playerPair":
      return coup.playerPair ? win(rules.pairPayout) : loss;
    case "bankerPair":
      return coup.bankerPair ? win(rules.pairPayout) : loss;
    case "eitherPair":
      return coup.playerPair || coup.bankerPair ? win(rules.eitherPairPayout) : loss;
    case "big":
      if (coup.cardCount === undefined) {
        return { ...push, unsettled: "Record how many cards were dealt to settle a Big bet." };
      }
      return coup.cardCount >= 5 ? win(rules.bigPayout) : loss;
    case "small":
      if (coup.cardCount === undefined) {
        return { ...push, unsettled: "Record how many cards were dealt to settle a Small bet." };
      }
      return coup.cardCount === 4 ? win(rules.smallPayout) : loss;
    default: {
      const exhaustive: never = wager.bet;
      throw new Error(`unhandled bet type ${String(exhaustive)}`);
    }
  }
}

export interface SessionState {
  /** Epoch ms when this session object was created. */
  startedAt: number;
  /**
   * Epoch ms of the first settled wager, or null while nothing has been staked.
   *
   * A session object is created at launch and again the moment the previous
   * one closes, so `startedAt` measures when the object appeared, not when
   * the sitting began. Dating an archived session from the first wager keeps
   * an overnight gap between launching the app and sitting down out of the
   * recorded duration.
   */
  firstWagerAt: number | null;
  /**
   * Index into `coups` where the current shoe's records begin.
   *
   * `coups` spans the whole SESSION, because the money does: a sitting that
   * runs through three shoes is one session, and its archived record has to
   * account for all of it. Clearing the list on a new shoe made
   * `sessionStats` see only the last shoe — and nothing at all if the session
   * ended right after a shoe change. The roads, which are per-shoe, read
   * `coups.slice(shoeStartIndex)` instead.
   */
  shoeStartIndex: number;
  rules: TableRules;
  shoe: ShoeState;
  bankroll: BankrollState;
  progressionOptions: ProgressionOptions;
  progression: ProgressionState;
  coups: CoupRecord[];
  preferredBet: BetType | "auto";
  kellyMultiplier: number;
}

export interface CreateSessionOptions {
  rules?: Partial<TableRules>;
  bankroll?: Partial<BankrollState>;
  progression?: ProgressionId;
  progressionOptions?: Partial<ProgressionOptions>;
  preferredBet?: BetType | "auto";
  kellyMultiplier?: number;
  /** Override the clock. Only tests should need this. */
  startedAt?: number;
}

export const DEFAULT_BANKROLL: BankrollState = {
  startingBankroll: 1000,
  bankroll: 1000,
  unitSize: 10,
  tableMin: 10,
  tableMax: 1000,
  stopWin: 200,
  stopLoss: 300,
};

export function createSession(options: CreateSessionOptions = {}): SessionState {
  const rules: TableRules = { ...DEFAULT_RULES, ...options.rules };
  const bankroll: BankrollState = { ...DEFAULT_BANKROLL, ...options.bankroll };
  const progressionOptions: ProgressionOptions = {
    ...DEFAULT_PROGRESSION_OPTIONS,
    maxUnits: bankroll.unitSize > 0 ? Math.floor(bankroll.tableMax / bankroll.unitSize) : null,
    ...options.progressionOptions,
  };
  return {
    startedAt: options.startedAt ?? Date.now(),
    firstWagerAt: null,
    shoeStartIndex: 0,
    rules,
    shoe: createShoe(rules.decks),
    bankroll,
    progressionOptions,
    progression: initProgression(options.progression ?? "flat", progressionOptions),
    coups: [],
    preferredBet: options.preferredBet ?? "auto",
    kellyMultiplier: options.kellyMultiplier ?? 1,
  };
}

/**
 * Fold one settled coup into the session.
 *
 * Note what this deliberately does *not* do: when the user records an outcome
 * without naming the cards, the shoe is left alone. Removing "about five
 * unknown cards" would be worse than removing nothing, because unknown cards
 * come out in the same proportions the shoe already holds — so the untouched
 * composition remains the correct estimate. Only cards the user actually saw
 * move the odds.
 */
export function applyCoup(
  session: SessionState,
  coup: CoupInput,
  wager?: PlacedWager | null,
): { session: SessionState; settlement: Settlement | null } {
  const settlement = wager ? settleWager(wager, coup, session.rules) : null;

  const record: CoupRecord = {
    outcome: coup.outcome,
    playerPair: coup.playerPair ?? false,
    bankerPair: coup.bankerPair ?? false,
    ...(wager && settlement
      ? {
          wager: {
            bet: wager.bet,
            amount: wager.amount,
            result: settlement.result,
            profit: settlement.profit,
          },
        }
      : {}),
  };

  const shoe = coup.cards && coup.cards.length > 0 ? dealCards(session.shoe, coup.cards) : session.shoe;

  const bankroll: BankrollState = settlement
    ? { ...session.bankroll, bankroll: session.bankroll.bankroll + settlement.profit }
    : session.bankroll;

  const progression = settlement
    ? advanceProgression(
        session.progression,
        {
          result: settlement.result,
          profitUnits:
            session.bankroll.unitSize > 0 ? settlement.profit / session.bankroll.unitSize : 0,
        },
        session.progressionOptions,
      )
    : session.progression;

  return {
    session: { ...session, shoe, bankroll, progression, coups: [...session.coups, record] },
    settlement,
  };
}

export interface SessionStats {
  coups: number;
  wagers: number;
  wins: number;
  losses: number;
  pushes: number;
  totalWagered: number;
  netProfit: number;
  /** Net profit as a fraction of everything staked. Compare it to the house edge. */
  actualEdge: number;
  largestWin: number;
  largestLoss: number;
  /** Deepest peak-to-trough fall in the bankroll curve, in currency. */
  maxDrawdown: number;
  /** Bankroll after each wager, starting from the session's opening balance. */
  bankrollCurve: number[];
}

export function sessionStats(session: SessionState): SessionStats {
  let wagers = 0;
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let totalWagered = 0;
  let netProfit = 0;
  let largestWin = 0;
  let largestLoss = 0;

  let balance = session.bankroll.startingBankroll;
  let peak = balance;
  let maxDrawdown = 0;
  const bankrollCurve: number[] = [balance];

  for (const coup of session.coups) {
    const wager = coup.wager;
    if (!wager) continue;
    wagers += 1;
    totalWagered += wager.amount;
    netProfit += wager.profit;
    if (wager.result === "win") wins += 1;
    else if (wager.result === "loss") losses += 1;
    else pushes += 1;
    if (wager.profit > largestWin) largestWin = wager.profit;
    if (wager.profit < largestLoss) largestLoss = wager.profit;

    balance += wager.profit;
    bankrollCurve.push(balance);
    if (balance > peak) peak = balance;
    const drawdown = peak - balance;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return {
    coups: session.coups.length,
    wagers,
    wins,
    losses,
    pushes,
    totalWagered,
    netProfit,
    actualEdge: totalWagered === 0 ? 0 : -netProfit / totalWagered,
    largestWin,
    largestLoss,
    maxDrawdown,
    bankrollCurve,
  };
}
