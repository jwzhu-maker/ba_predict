import { PROGRESSIONS, type BetType, type CoupRecord, type ProgressionId } from "@ba-predict/engine";
import { decodeCoups, type ArchivedShoe } from "./shoe-archive";
import { replayStrategies, type StrategyReplayOptions } from "./replay";

/**
 * Each staking plan's record across every shoe you have played.
 *
 * This is the question "which system works" asked properly: not on one lucky
 * shoe, but on all of them. The honest expectation is that the success RATES
 * will differ a lot — a Martingale finishes a shoe ahead most of the time —
 * while the per-unit column converges on the same number for every plan.
 * Seeing both at once is the point: the rate is what makes a system feel
 * like it works, and the per-unit figure is what it actually costs.
 */

export interface StrategyRecordRow {
  progression: ProgressionId;
  name: string;
  /** Shoes this plan was replayed over. */
  shoes: number;
  /** Shoes it finished ahead on. */
  shoesAhead: number;
  /** shoesAhead / shoes, or 0 with no shoes. */
  successRate: number;
  netUnits: number;
  stakedUnits: number;
  /** Net over everything staked, signed: positive means ahead. */
  perUnit: number;
  /** Worst single-shoe result, in units. */
  worstShoeUnits: number;
  /** Best single-shoe result, in units. */
  bestShoeUnits: number;
  /** Largest stake the plan ever reached. */
  peakStakeUnits: number;
  /** Shoes where the plan hit the table maximum or ran out of bankroll. */
  breakdowns: number;
}

export interface StrategyRecord {
  /** The bet every plan was replayed on. */
  bet: BetType;
  shoes: number;
  coups: number;
  rows: StrategyRecordRow[];
  /** True when any shoe could not be settled exactly (no-commission Banker). */
  approximate: boolean;
}

export interface StrategyRecordOptions extends Omit<StrategyReplayOptions, "coups"> {
  /** Finished shoes, oldest first. */
  shoes: readonly ArchivedShoe[];
  /** The shoe still in progress, if it has any coups. */
  currentShoe?: readonly CoupRecord[];
}

/**
 * Replay every plan over every shoe and total the results.
 *
 * Sorted by success rate, because that is the column the user came for — but
 * every row carries its per-unit figure alongside, so the ranking cannot be
 * read without the cost next to it.
 */
export function aggregateStrategyRecord(options: StrategyRecordOptions): StrategyRecord {
  const { shoes, currentShoe, ...replayOptions } = options;

  const hands: CoupRecord[][] = shoes.map((shoe) => decodeCoups(shoe.coups));
  if (currentShoe && currentShoe.length > 0) hands.push([...currentShoe]);

  const accumulators = new Map<ProgressionId, StrategyRecordRow>();
  for (const definition of PROGRESSIONS) {
    accumulators.set(definition.id, {
      progression: definition.id,
      name: definition.name,
      shoes: 0,
      shoesAhead: 0,
      successRate: 0,
      netUnits: 0,
      stakedUnits: 0,
      perUnit: 0,
      worstShoeUnits: 0,
      bestShoeUnits: 0,
      peakStakeUnits: 0,
      breakdowns: 0,
    });
  }

  let approximate = false;
  let coups = 0;

  for (const shoeCoups of hands) {
    if (shoeCoups.length === 0) continue;
    coups += shoeCoups.length;
    const replay = replayStrategies({ ...replayOptions, coups: shoeCoups });
    if (replay.approximate) approximate = true;

    for (const row of replay.rows) {
      const total = accumulators.get(row.progression);
      if (!total) continue;
      total.shoes += 1;
      if (row.netUnits > 0) total.shoesAhead += 1;
      total.netUnits += row.netUnits;
      total.stakedUnits += row.totalStakedUnits;
      if (row.netUnits < total.worstShoeUnits) total.worstShoeUnits = row.netUnits;
      if (row.netUnits > total.bestShoeUnits) total.bestShoeUnits = row.netUnits;
      if (row.peakStakeUnits > total.peakStakeUnits) total.peakStakeUnits = row.peakStakeUnits;
      if (row.brokeDownAt !== null) total.breakdowns += 1;
    }
  }

  const rows = [...accumulators.values()].map((row) => ({
    ...row,
    successRate: row.shoes === 0 ? 0 : row.shoesAhead / row.shoes,
    perUnit: row.stakedUnits === 0 ? 0 : row.netUnits / row.stakedUnits,
  }));

  rows.sort((a, b) => b.successRate - a.successRate || b.netUnits - a.netUnits);

  return {
    bet: replayOptions.bet,
    shoes: hands.filter((hand) => hand.length > 0).length,
    coups,
    rows,
    approximate,
  };
}
