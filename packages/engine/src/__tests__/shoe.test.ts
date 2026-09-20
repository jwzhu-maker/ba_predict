import { describe, expect, it } from "vitest";
import type { Rank } from "../cards";
import { RANKS, handTotal, rankValue } from "../cards";
import {
  canDealCoup,
  cardsDealt,
  cardsRemaining,
  createShoe,
  dealCard,
  dealCards,
  penetration,
  rankImbalance,
  undoCard,
  valueCounts,
} from "../shoe";

describe("cards", () => {
  it("values tens and court cards at zero", () => {
    expect(rankValue("10")).toBe(0);
    expect(rankValue("K")).toBe(0);
    expect(rankValue("A")).toBe(1);
    expect(rankValue("9")).toBe(9);
  });

  it("totals a hand modulo ten", () => {
    expect(handTotal([9, 8])).toBe(7);
    expect(handTotal([5, 5])).toBe(0);
    expect(handTotal([2, 3, 4])).toBe(9);
  });
});

describe("shoe", () => {
  it("starts full", () => {
    const shoe = createShoe(8);
    expect(cardsRemaining(shoe)).toBe(416);
    expect(cardsDealt(shoe)).toBe(0);
    expect(penetration(shoe)).toBe(0);
    expect(shoe.byRank.every((count) => count === 32)).toBe(true);
  });

  it("rejects a nonsensical deck count", () => {
    expect(() => createShoe(0)).toThrow(RangeError);
    expect(() => createShoe(1.5)).toThrow(RangeError);
  });

  it("deals and undoes without losing track", () => {
    const shoe = createShoe(8);
    const dealt = dealCards(shoe, ["A", "K", "9"]);
    expect(cardsRemaining(dealt)).toBe(413);
    expect(dealt.discards).toEqual(["A", "K", "9"]);
    const undone = undoCard(dealt);
    expect(cardsRemaining(undone)).toBe(414);
    expect(undone.discards).toEqual(["A", "K"]);
  });

  it("treats undo on an untouched shoe as a no-op", () => {
    const shoe = createShoe(8);
    expect(undoCard(shoe)).toBe(shoe);
  });

  it("refuses to deal a rank that is exhausted", () => {
    // Only 32 fives exist in an 8-deck shoe, and a miscount at a live table
    // should not silently invent a 33rd.
    let shoe = createShoe(8);
    shoe = dealCards(shoe, Array.from({ length: 40 }, () => "5" as Rank));
    expect(cardsRemaining(shoe)).toBe(416 - 32);
    expect(shoe.byRank[RANKS.indexOf("5")]).toBe(0);
  });

  it("never mutates the shoe it was handed", () => {
    const shoe = createShoe(8);
    const snapshot = JSON.stringify(shoe);
    dealCards(shoe, ["A", "2", "3"]);
    expect(JSON.stringify(shoe)).toBe(snapshot);
  });

  it("reports penetration", () => {
    const ranks: Rank[] = [...RANKS];
    const shoe = dealCards(
      createShoe(8),
      Array.from({ length: 104 }, (_, index) => ranks[index % ranks.length]!),
    );
    expect(penetration(shoe)).toBeCloseTo(0.25, 10);
  });

  it("collapses ranks into point-value buckets", () => {
    const counts = valueCounts(createShoe(8));
    // Four ranks are worth zero, so that bucket is four times as big.
    expect(counts[0]).toBe(128);
    for (let value = 1; value <= 9; value += 1) expect(counts[value]).toBe(32);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(416);
  });

  it("reports a flat imbalance on a fresh shoe", () => {
    for (const entry of rankImbalance(createShoe(8))) {
      expect(entry.delta).toBeCloseTo(0, 9);
    }
  });

  it("reports which ranks are over-represented in what is left", () => {
    const shoe = dealCards(createShoe(8), Array.from({ length: 32 }, () => "A" as Rank));
    const imbalance = rankImbalance(shoe);
    const aces = imbalance.find((entry) => entry.rank === "A")!;
    expect(aces.delta).toBeLessThan(0);
    expect(imbalance.find((entry) => entry.rank === "K")!.delta).toBeGreaterThan(0);
  });

  it("knows when it can no longer deal a coup", () => {
    let shoe = createShoe(1);
    expect(canDealCoup(shoe)).toBe(true);
    const ranks: Rank[] = [...RANKS];
    for (let round = 0; round < 4; round += 1) {
      for (const rank of ranks) shoe = dealCard(shoe, rank);
    }
    expect(cardsRemaining(shoe)).toBe(0);
    expect(canDealCoup(shoe)).toBe(false);
  });
});
