import { BET_TYPES } from "./types";
import type {
  BetType,
  BetValuation,
  CoupProbabilities,
  PayoffOutcome,
  TableRules,
} from "./types";

/**
 * Turn probabilities + rules into the discrete return distribution of each bet.
 *
 * Everything downstream — expected value, Kelly sizing, ruin simulation —
 * reads these distributions rather than re-deriving payouts, so a rule change
 * (no-commission table, 9:1 ties) propagates everywhere from one place.
 */

function normalise(payoffs: PayoffOutcome[]): PayoffOutcome[] {
  return payoffs.filter((payoff) => payoff.probability > 0);
}

function payoffsFor(
  bet: BetType,
  probabilities: CoupProbabilities,
  rules: TableRules,
): PayoffOutcome[] {
  const { banker, player, tie, bankerWinsWithSix, fourCards, fiveCards, sixCards } = probabilities;

  switch (bet) {
    case "banker": {
      if (rules.bankerSixPayout === null) {
        return normalise([
          { probability: banker, netReturn: 1 - rules.bankerCommission },
          { probability: tie, netReturn: 0 },
          { probability: player, netReturn: -1 },
        ]);
      }
      // No-commission table: the house takes its cut out of Banker wins on 6.
      const winsOnSix = Math.min(bankerWinsWithSix, banker);
      return normalise([
        { probability: banker - winsOnSix, netReturn: 1 },
        { probability: winsOnSix, netReturn: rules.bankerSixPayout },
        { probability: tie, netReturn: 0 },
        { probability: player, netReturn: -1 },
      ]);
    }
    case "player":
      return normalise([
        { probability: player, netReturn: 1 },
        { probability: tie, netReturn: 0 },
        { probability: banker, netReturn: -1 },
      ]);
    case "tie":
      return normalise([
        { probability: tie, netReturn: rules.tiePayout },
        { probability: 1 - tie, netReturn: -1 },
      ]);
    case "playerPair":
      return normalise([
        { probability: probabilities.playerPair, netReturn: rules.pairPayout },
        { probability: 1 - probabilities.playerPair, netReturn: -1 },
      ]);
    case "bankerPair":
      return normalise([
        { probability: probabilities.bankerPair, netReturn: rules.pairPayout },
        { probability: 1 - probabilities.bankerPair, netReturn: -1 },
      ]);
    case "eitherPair":
      return normalise([
        { probability: probabilities.eitherPair, netReturn: rules.eitherPairPayout },
        { probability: 1 - probabilities.eitherPair, netReturn: -1 },
      ]);
    case "big": {
      const win = fiveCards + sixCards;
      return normalise([
        { probability: win, netReturn: rules.bigPayout },
        { probability: 1 - win, netReturn: -1 },
      ]);
    }
    case "small":
      return normalise([
        { probability: fourCards, netReturn: rules.smallPayout },
        { probability: 1 - fourCards, netReturn: -1 },
      ]);
    default: {
      const exhaustive: never = bet;
      throw new Error(`unhandled bet type ${String(exhaustive)}`);
    }
  }
}

export function expectedValue(payoffs: readonly PayoffOutcome[]): number {
  let total = 0;
  for (const payoff of payoffs) total += payoff.probability * payoff.netReturn;
  return total;
}

export function valuateBet(
  bet: BetType,
  probabilities: CoupProbabilities,
  rules: TableRules,
): BetValuation {
  const payoffs = payoffsFor(bet, probabilities, rules);
  let winProbability = 0;
  let pushProbability = 0;
  for (const payoff of payoffs) {
    if (payoff.netReturn > 0) winProbability += payoff.probability;
    else if (payoff.netReturn === 0) pushProbability += payoff.probability;
  }
  const ev = expectedValue(payoffs);
  return {
    bet,
    expectedValue: ev,
    houseEdge: -ev,
    winProbability,
    pushProbability,
    payoffs,
  };
}

export function valuateAllBets(
  probabilities: CoupProbabilities,
  rules: TableRules,
): Record<BetType, BetValuation> {
  const out = {} as Record<BetType, BetValuation>;
  for (const bet of BET_TYPES) out[bet] = valuateBet(bet, probabilities, rules);
  return out;
}

/**
 * The bet with the highest expected value.
 *
 * On any normal shoe this is Banker, and its expected value is still negative.
 * "Best" here means "loses least per unit staked", which is the only sense in
 * which one baccarat bet beats another.
 */
export function bestBet(valuations: Record<BetType, BetValuation>): BetValuation {
  let best: BetValuation | null = null;
  for (const bet of BET_TYPES) {
    const candidate = valuations[bet];
    if (!best || candidate.expectedValue > best.expectedValue) best = candidate;
  }
  if (!best) throw new Error("no bets to compare");
  return best;
}

/**
 * House edge measured against resolved bets only, i.e. ignoring ties that push.
 *
 * Quoted for Banker as 1.17% rather than 1.06%. Both numbers are correct; they
 * answer different questions ("per unit I put out" vs "per unit that actually
 * settled"). The app reports the first, because that is the one that predicts
 * how fast a bankroll drains.
 */
export function houseEdgePerResolvedBet(valuation: BetValuation): number {
  const resolved = 1 - valuation.pushProbability;
  return resolved <= 0 ? 0 : valuation.houseEdge / resolved;
}
