/**
 * Card model.
 *
 * Baccarat only cares about a card's *value* (A=1, 2-9 face value, 10/J/Q/K=0),
 * but pair side bets care about its *rank* (two Kings are a pair; a King and a
 * Ten are not, even though both count as 0). So the shoe tracks 13 ranks and
 * projects down to 10 values whenever the main hand enumeration runs.
 */

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

export type Rank = (typeof RANKS)[number];

/** Baccarat point value of each rank, indexed to match {@link RANKS}. */
export const RANK_VALUES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 0, 0, 0];

export const RANK_COUNT = RANKS.length;

/** Number of distinct point values (0-9). */
export const VALUE_COUNT = 10;

/** Cards of a single rank in one 52-card deck. */
export const CARDS_PER_RANK_PER_DECK = 4;

export const CARDS_PER_DECK = RANK_COUNT * CARDS_PER_RANK_PER_DECK;

export function rankIndex(rank: Rank): number {
  return RANKS.indexOf(rank);
}

export function rankValue(rank: Rank): number {
  const value = RANK_VALUES[rankIndex(rank)];
  return value ?? 0;
}

/** Total of a baccarat hand: the sum of its card values, modulo 10. */
export function handTotal(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) sum += value;
  return sum % 10;
}
