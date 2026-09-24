import { describe, expect, it } from "vitest";
import { clearProbabilityCache, coupProbabilities } from "../odds";
import { createShoe, dealCards, valueCounts } from "../shoe";

/**
 * The published 8-deck figures. These are not "close enough" targets — the
 * enumeration is exact, so it has to reproduce them to the last quoted digit.
 */
const BANKER = 0.458597;
const PLAYER = 0.446247;
const TIE = 0.095156;

describe("coupProbabilities", () => {
  it("reproduces the standard 8-deck probabilities", () => {
    const probabilities = coupProbabilities(createShoe(8));
    expect(probabilities).not.toBeNull();
    expect(probabilities!.banker).toBeCloseTo(BANKER, 6);
    expect(probabilities!.player).toBeCloseTo(PLAYER, 6);
    expect(probabilities!.tie).toBeCloseTo(TIE, 6);
  });

  it("produces a complete distribution", () => {
    const p = coupProbabilities(createShoe(8))!;
    expect(p.banker + p.player + p.tie).toBeCloseTo(1, 12);
    expect(p.fourCards + p.fiveCards + p.sixCards).toBeCloseTo(1, 12);
  });

  it("prices the larger 10- and 12-deck shoes Settings offers", () => {
    // More decks tend toward the infinite-deck figures, so each sits within a
    // hair of the 8-deck numbers and still sums to one.
    for (const decks of [10, 12]) {
      const p = coupProbabilities(createShoe(decks))!;
      expect(p.banker + p.player + p.tie).toBeCloseTo(1, 12);
      expect(p.banker).toBeCloseTo(BANKER, 3);
      expect(p.player).toBeCloseTo(PLAYER, 3);
      expect(p.tie).toBeCloseTo(TIE, 3);
    }
  });

  it("matches the known six-deck and one-deck figures", () => {
    const six = coupProbabilities(createShoe(6))!;
    expect(six.banker).toBeCloseTo(0.458653, 5);
    expect(six.player).toBeCloseTo(0.446279, 5);
    expect(six.tie).toBeCloseTo(0.095069, 5);

    const one = coupProbabilities(createShoe(1))!;
    expect(one.banker + one.player + one.tie).toBeCloseTo(1, 12);
    // A single deck tips very slightly further toward Banker.
    expect(one.banker).toBeGreaterThan(one.player);
  });

  it("prices Small (a four-card coup) at the documented rate", () => {
    const p = coupProbabilities(createShoe(8))!;
    expect(p.fourCards).toBeCloseTo(0.3789, 3);
  });

  it("derives pairs from rank counts, not point values", () => {
    const p = coupProbabilities(createShoe(8))!;
    // After the first card, 31 of the remaining 415 cards share its rank.
    expect(p.playerPair).toBeCloseTo(31 / 415, 12);
    expect(p.bankerPair).toBeCloseTo(31 / 415, 12);
    // Either Pair is less than twice a single pair, because they overlap.
    expect(p.eitherPair).toBeLessThan(2 * p.playerPair);
    expect(p.eitherPair).toBeGreaterThan(p.playerPair);
  });

  it("moves with the composition", () => {
    clearProbabilityCache();
    const fresh = coupProbabilities(createShoe(8))!;
    // Strip a large block of low cards; the odds must not be the fresh ones.
    const stripped = dealCards(
      createShoe(8),
      Array.from({ length: 96 }, (_, index) => (["A", "2", "3"] as const)[index % 3]!),
    );
    const depleted = coupProbabilities(stripped)!;
    expect(depleted.banker).not.toBeCloseTo(fresh.banker, 6);
    expect(depleted.banker + depleted.player + depleted.tie).toBeCloseTo(1, 12);
  });

  it("refuses to price a shoe that cannot complete a coup", () => {
    let shoe = createShoe(1);
    const toRemove = 52 - 5;
    for (let index = 0; index < toRemove; index += 1) {
      const counts = shoe.byRank;
      const rankIndex = counts.findIndex((count) => count > 0);
      shoe = dealCards(shoe, [(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const)[rankIndex]!]);
    }
    expect(coupProbabilities(shoe)).toBeNull();
  });

  it("stays exact on a tiny contrived shoe", () => {
    // Six cards, all worth zero: every hand totals 0, so every coup is a tie.
    const counts = valueCounts(createShoe(8));
    expect(counts).toHaveLength(10);
    expect(counts[0]).toBe(128);
    expect(counts[1]).toBe(32);
  });
});
