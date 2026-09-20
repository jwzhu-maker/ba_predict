import {
  CARDS_PER_RANK_PER_DECK,
  RANKS,
  RANK_COUNT,
  RANK_VALUES,
  VALUE_COUNT,
  rankIndex,
  type Rank,
} from "./cards";
import type { ShoeState } from "./types";

/** A fresh, unplayed shoe of `decks` decks. */
export function createShoe(decks: number): ShoeState {
  if (!Number.isInteger(decks) || decks < 1) {
    throw new RangeError(`decks must be a positive integer, received ${decks}`);
  }
  return {
    decks,
    byRank: new Array<number>(RANK_COUNT).fill(decks * CARDS_PER_RANK_PER_DECK),
    discards: [],
  };
}

export function cardsRemaining(shoe: ShoeState): number {
  let total = 0;
  for (const count of shoe.byRank) total += count;
  return total;
}

export function cardsDealt(shoe: ShoeState): number {
  return shoe.decks * RANK_COUNT * CARDS_PER_RANK_PER_DECK - cardsRemaining(shoe);
}

/** Fraction of the shoe already dealt, 0..1. */
export function penetration(shoe: ShoeState): number {
  const total = shoe.decks * RANK_COUNT * CARDS_PER_RANK_PER_DECK;
  return total === 0 ? 0 : cardsDealt(shoe) / total;
}

/**
 * Remove one card of `rank` from the shoe.
 *
 * Returns the shoe unchanged when that rank is exhausted — a miscount while
 * tracking a live table should not throw in the user's face mid-coup.
 */
export function dealCard(shoe: ShoeState, rank: Rank): ShoeState {
  const index = rankIndex(rank);
  const remaining = shoe.byRank[index] ?? 0;
  if (remaining <= 0) return shoe;
  const byRank = shoe.byRank.slice();
  byRank[index] = remaining - 1;
  return { ...shoe, byRank, discards: [...shoe.discards, rank] };
}

export function dealCards(shoe: ShoeState, ranks: readonly Rank[]): ShoeState {
  return ranks.reduce<ShoeState>((state, rank) => dealCard(state, rank), shoe);
}

/** Put the most recently dealt card back. */
export function undoCard(shoe: ShoeState): ShoeState {
  if (shoe.discards.length === 0) return shoe;
  const discards = shoe.discards.slice();
  const rank = discards.pop() as Rank;
  const byRank = shoe.byRank.slice();
  const index = rankIndex(rank);
  byRank[index] = (byRank[index] ?? 0) + 1;
  return { ...shoe, byRank, discards };
}

/**
 * Collapse the 13 rank counts into the 10 point-value counts the hand
 * enumeration works on.
 */
export function valueCounts(shoe: ShoeState): number[] {
  const counts = new Array<number>(VALUE_COUNT).fill(0);
  for (let index = 0; index < RANK_COUNT; index += 1) {
    const value = RANK_VALUES[index] ?? 0;
    counts[value] = (counts[value] ?? 0) + (shoe.byRank[index] ?? 0);
  }
  return counts;
}

/**
 * How far each rank's remaining density sits from a fresh shoe's, in cards.
 *
 * Positive means the rank is over-represented in what is left. This is the raw
 * material for composition-dependent play; on its own it is descriptive, not a
 * signal — see `docs` in the README about how small baccarat's edges really are.
 */
export function rankImbalance(shoe: ShoeState): { rank: Rank; delta: number }[] {
  const remaining = cardsRemaining(shoe);
  const total = shoe.decks * RANK_COUNT * CARDS_PER_RANK_PER_DECK;
  if (total === 0 || remaining === 0) {
    return RANKS.map((rank) => ({ rank, delta: 0 }));
  }
  const expectedShare = 1 / RANK_COUNT;
  return RANKS.map((rank, index) => {
    const share = (shoe.byRank[index] ?? 0) / remaining;
    return { rank, delta: (share - expectedShare) * remaining };
  });
}

/** True when the shoe can still deal a complete coup (six cards, worst case). */
export function canDealCoup(shoe: ShoeState): boolean {
  return cardsRemaining(shoe) >= 6;
}
