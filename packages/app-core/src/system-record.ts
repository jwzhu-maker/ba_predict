import {
  runBettingSystem,
  type BettingSystemConfig,
  type BettingSystemId,
  type CoupRecord,
  type SystemRun,
  type TableRules,
} from "@ba-predict/engine";
import { decodeCoups, type ArchivedShoe } from "./shoe-archive";

/**
 * How a betting system has done across every shoe on this device.
 *
 * The single-shoe run answers "what did it make me tonight", which is the
 * question you have while the cards are still on the table. This answers
 * "does it work", which needs a lot more shoes and is the only one of the two
 * that can be answered at all.
 *
 * The pairing to read is `shoesAhead` against `perUnit`, the same pairing the
 * staking-plan record exists to show. A system that sits out the first twelve
 * hands, stops a group on its first loss and quits at hand 60 stakes far less
 * money than flat-betting the whole shoe — so it loses less in total, and the
 * shoe-win rate can look good. Per unit staked it pays the same house edge,
 * because nothing about when you bet changes what a bet costs.
 */

export interface SystemShoeResult {
  /** Index of the shoe, oldest first. The live shoe is last. */
  shoe: number;
  /** Signed money result for that shoe. */
  net: number;
  staked: number;
  bets: number;
  wins: number;
  perfectGroups: number;
  peakStake: number;
  incomplete: boolean;
}

export interface SystemRecord {
  id: BettingSystemId;
  name: string;
  config: BettingSystemConfig;
  /** Shoes with at least one hand. */
  shoes: number;
  /** Shoes that reached the betting range at all. */
  shoesWithBets: number;
  shoesAhead: number;
  /** shoesAhead / shoesWithBets, or 0 with none. */
  successRate: number;
  bets: number;
  wins: number;
  /** wins / bets, or 0 with none. */
  hitRate: number;
  net: number;
  staked: number;
  /** Net over everything staked, signed. Positive is ahead. */
  perUnit: number;
  worstShoe: number;
  bestShoe: number;
  peakStake: number;
  /** Groups that won every hand they covered, across all shoes. */
  perfectGroups: number;
  /** Groups played across all shoes, so `perfectGroups` has a denominator. */
  groups: number;
  /** Shoes that ran out before the system's last hand. */
  incompleteShoes: number;
  /** Per-shoe results, oldest first, for a sparkline or a scan down the list. */
  perShoe: SystemShoeResult[];
  approximate: boolean;
}

export interface SystemRecordOptions {
  /** Finished shoes, oldest first. */
  shoes: readonly ArchivedShoe[];
  /** The shoe still in progress, if it has any coups. */
  currentShoe?: readonly CoupRecord[];
  rules: TableRules;
  /**
   * Which system to replay. Null or omitted replays the default.
   *
   * Every shoe is replayed through the SAME system, which is what makes the
   * totals comparable — the archive stores coups, not what was staked on
   * them, so switching systems re-reads the whole history under the new rule
   * rather than reporting a mixture of both.
   */
  system?: BettingSystemId | null;
  config?: Partial<BettingSystemConfig>;
  tableMax?: number | null;
  /** Table floor; a stake under it is replayed as unplaced. See `runBettingSystem`. */
  tableMin?: number | null;
}

export function aggregateSystemRecord(options: SystemRecordOptions): SystemRecord {
  const { shoes, currentShoe, ...runOptions } = options;

  const hands: CoupRecord[][] = shoes.map((shoe) => decodeCoups(shoe.coups));
  if (currentShoe && currentShoe.length > 0) hands.push([...currentShoe]);

  const perShoe: SystemShoeResult[] = [];
  let firstRun: SystemRun | null = null;

  let shoesWithBets = 0;
  let shoesAhead = 0;
  let bets = 0;
  let wins = 0;
  let net = 0;
  let staked = 0;
  let worstShoe = 0;
  let bestShoe = 0;
  let peakStake = 0;
  let perfectGroups = 0;
  let groups = 0;
  let incompleteShoes = 0;
  let approximate = false;
  let counted = 0;

  for (let index = 0; index < hands.length; index += 1) {
    const shoeCoups = hands[index]!;
    if (shoeCoups.length === 0) continue;
    counted += 1;

    const run = runBettingSystem({ ...runOptions, coups: shoeCoups });
    firstRun ??= run;
    if (run.approximate) approximate = true;

    perShoe.push({
      shoe: index,
      net: run.net,
      staked: run.staked,
      bets: run.bets,
      wins: run.wins,
      perfectGroups: run.perfectGroups,
      peakStake: run.peakStake,
      incomplete: run.incomplete,
    });

    bets += run.bets;
    wins += run.wins;
    net += run.net;
    staked += run.staked;
    perfectGroups += run.perfectGroups;
    groups += run.groups.length;
    if (run.incomplete) incompleteShoes += 1;
    if (run.peakStake > peakStake) peakStake = run.peakStake;

    // A shoe too short to reach hand 13 is not a shoe this system played, so
    // it must not dilute the win rate in either direction.
    if (run.bets > 0) {
      shoesWithBets += 1;
      if (run.net > 0) shoesAhead += 1;
      if (run.net < worstShoe) worstShoe = run.net;
      if (run.net > bestShoe) bestShoe = run.net;
    }
  }

  // The config is echoed back from a real run so the card cannot describe one
  // rule while the numbers came from another; with no shoes there is nothing
  // to echo, so one bare run supplies the defaults merged with any overrides.
  const describing = firstRun ?? runBettingSystem({ ...runOptions, coups: [] });

  return {
    id: describing.id,
    name: describing.name,
    config: describing.config,
    shoes: counted,
    shoesWithBets,
    shoesAhead,
    successRate: shoesWithBets === 0 ? 0 : shoesAhead / shoesWithBets,
    bets,
    wins,
    hitRate: bets === 0 ? 0 : wins / bets,
    net,
    staked,
    perUnit: staked === 0 ? 0 : net / staked,
    worstShoe,
    bestShoe,
    peakStake,
    perfectGroups,
    groups,
    incompleteShoes,
    perShoe,
    approximate,
  };
}
