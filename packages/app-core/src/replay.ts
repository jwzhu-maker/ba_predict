import {
  PROGRESSIONS,
  advanceProgression,
  initProgression,
  settleWager,
  type BetType,
  type CoupRecord,
  type ProgressionId,
  type ProgressionOptions,
  type TableRules,
} from "@ba-predict/engine";

/**
 * Replay a finished shoe through every staking plan.
 *
 * This is hindsight on real results, not a forecast: the coups are the ones
 * that actually came out, so there is no randomness and no sampling. It
 * answers "what would each plan have done on the shoe I just played", which
 * is a different question from the Monte Carlo alongside it — that one asks
 * what a plan does in general.
 *
 * Both answers matter and neither is a recommendation. Whichever plan tops
 * this table won on one shoe of variance; the forward simulation is where the
 * shape of a plan actually shows, and the edge column here is the reminder
 * that every one of them paid the same rate for its action.
 */

/** Bets that a recorded coup carries enough information to settle. */
export const REPLAYABLE_BETS: readonly BetType[] = [
  "banker",
  "player",
  "tie",
  "playerPair",
  "bankerPair",
  "eitherPair",
];

export function isReplayableBet(bet: BetType): boolean {
  return REPLAYABLE_BETS.includes(bet);
}

export interface StrategyReplayRow {
  progression: ProgressionId;
  name: string;
  /** Net result in units. */
  netUnits: number;
  wagers: number;
  wins: number;
  losses: number;
  pushes: number;
  totalStakedUnits: number;
  peakStakeUnits: number;
  /** Deepest peak-to-trough fall during the shoe, in units. */
  maxDrawdownUnits: number;
  /** Net over total staked, as a positive cost. */
  actualEdge: number;
  /**
   * Set when the plan could not continue — it asked for more than the table
   * allows, or more than the bankroll had left. The coups after that point
   * are not counted, because the plan was not playing them.
   */
  brokeDownAt: number | null;
  brokeDownReason: "table-limit" | "bankroll" | null;
}

export interface StrategyReplay {
  bet: BetType;
  coups: number;
  rows: StrategyReplayRow[];
  /**
   * True when at least one coup lacked a detail the rules needed to settle
   * exactly — a no-commission Banker win where the winning total was not
   * recorded. The numbers are then slightly optimistic for Banker.
   */
  approximate: boolean;
}

export interface StrategyReplayOptions {
  coups: readonly CoupRecord[];
  rules: TableRules;
  /** Which bet to assume on every coup. */
  bet: BetType;
  progressionOptions: ProgressionOptions;
  /** Bankroll available to each plan, in units. */
  bankrollUnits: number;
}

function replayOne(
  id: ProgressionId,
  name: string,
  options: StrategyReplayOptions,
): { row: StrategyReplayRow; approximate: boolean } {
  const { coups, rules, bet, progressionOptions, bankrollUnits } = options;
  let progression = initProgression(id, progressionOptions);
  let balance = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let staked = 0;
  let wagers = 0;
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let peakStake = 0;
  let brokeDownAt: number | null = null;
  let brokeDownReason: StrategyReplayRow["brokeDownReason"] = null;
  let approximate = false;

  for (let index = 0; index < coups.length; index += 1) {
    const stake = progression.units;
    // The gap between what the ladder asked for and what the table allows is
    // how these plans actually fail, so it stops the replay rather than being
    // silently clipped.
    if (progression.requestedUnits > stake + 1e-9) {
      brokeDownAt = index;
      brokeDownReason = "table-limit";
      break;
    }
    if (stake > bankrollUnits + balance + 1e-9) {
      brokeDownAt = index;
      brokeDownReason = "bankroll";
      break;
    }

    const coup = coups[index]!;
    const settlement = settleWager(
      { bet, amount: stake },
      // `CoupRecord` carries outcome and the two pair flags and nothing
      // else, so a Banker leg on a no-commission table always comes back
      // `unsettled` here — the "slightly generous" caveat the run card
      // shows. Fixing that means persisting `bankerWinOnSix` on the coup,
      // which the shoe archive's one-character-per-coup encoding cannot
      // carry as it stands. Deliberately not done here.
      {
        outcome: coup.outcome,
        playerPair: coup.playerPair,
        bankerPair: coup.bankerPair,
      },
      rules,
    );
    if (settlement.unsettled) approximate = true;

    balance += settlement.profit;
    staked += stake;
    wagers += 1;
    if (settlement.result === "win") wins += 1;
    else if (settlement.result === "loss") losses += 1;
    else pushes += 1;
    if (stake > peakStake) peakStake = stake;
    if (balance > peak) peak = balance;
    if (peak - balance > maxDrawdown) maxDrawdown = peak - balance;

    progression = advanceProgression(
      progression,
      { result: settlement.result, profitUnits: settlement.profit },
      progressionOptions,
    );
  }

  return {
    approximate,
    row: {
      progression: id,
      name,
      netUnits: balance,
      wagers,
      wins,
      losses,
      pushes,
      totalStakedUnits: staked,
      peakStakeUnits: peakStake,
      maxDrawdownUnits: maxDrawdown,
      actualEdge: staked === 0 ? 0 : -balance / staked,
      brokeDownAt,
      brokeDownReason,
    },
  };
}

/** Replay every staking plan over the same coups, best result first. */
export function replayStrategies(options: StrategyReplayOptions): StrategyReplay {
  let approximate = false;
  const rows: StrategyReplayRow[] = [];
  for (const definition of PROGRESSIONS) {
    const result = replayOne(definition.id, definition.name, options);
    if (result.approximate) approximate = true;
    rows.push(result.row);
  }
  rows.sort((a, b) => b.netUnits - a.netUnits);
  return { bet: options.bet, coups: options.coups.length, rows, approximate };
}
