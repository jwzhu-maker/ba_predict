import { describe, expect, it } from "vitest";
import { bestBet, houseEdgePerResolvedBet, valuateAllBets, valuateBet } from "../ev";
import { coupProbabilities } from "../odds";
import { createShoe } from "../shoe";
import { DEFAULT_RULES } from "../types";

const probabilities = coupProbabilities(createShoe(8))!;

describe("bet valuation", () => {
  it("reproduces the documented house edges on an 8-deck commission table", () => {
    const banker = valuateBet("banker", probabilities, DEFAULT_RULES);
    const player = valuateBet("player", probabilities, DEFAULT_RULES);
    const tie = valuateBet("tie", probabilities, DEFAULT_RULES);

    expect(banker.houseEdge).toBeCloseTo(0.010579, 6);
    expect(player.houseEdge).toBeCloseTo(0.012351, 6);
    expect(tie.houseEdge).toBeCloseTo(0.143596, 6);
  });

  it("prices a 9:1 tie correctly", () => {
    const tie = valuateBet("tie", probabilities, { ...DEFAULT_RULES, tiePayout: 9 });
    // 4.84403%, not the 4.8439% some tables quote. The two differ in the
    // seventh decimal of P(tie), and the 8:1 edge above settles which is
    // right: 14.3596% needs P(tie) = 0.09515597, and 0.0951561 would give
    // 14.3595%. The enumeration agrees with the 8:1 figure, so it is exact
    // here too, and the cross-check against dealt cards in odds.test.ts
    // confirms it independently.
    expect(tie.houseEdge).toBeCloseTo(0.0484403, 6);
  });

  it("prices pairs at 11:1", () => {
    const pair = valuateBet("playerPair", probabilities, DEFAULT_RULES);
    expect(pair.houseEdge).toBeCloseTo(0.103614, 5);
  });

  it("prices Big and Small close to their published edges", () => {
    const small = valuateBet("small", probabilities, DEFAULT_RULES);
    const big = valuateBet("big", probabilities, DEFAULT_RULES);
    expect(small.houseEdge).toBeCloseTo(0.0527, 3);
    expect(big.houseEdge).toBeCloseTo(0.0435, 3);
  });

  it("makes a no-commission table worse for the player than it looks", () => {
    const commissioned = valuateBet("banker", probabilities, DEFAULT_RULES);
    const noCommission = valuateBet("banker", probabilities, {
      ...DEFAULT_RULES,
      bankerSixPayout: 0.5,
    });
    // The headline "no commission!" costs about half a percent more per unit.
    expect(noCommission.houseEdge).toBeGreaterThan(commissioned.houseEdge);
    expect(noCommission.houseEdge).toBeCloseTo(0.0146, 3);
  });

  it("treats a tie as a push on Banker and Player, not a loss", () => {
    const banker = valuateBet("banker", probabilities, DEFAULT_RULES);
    expect(banker.pushProbability).toBeCloseTo(probabilities.tie, 12);
    // Quoted per resolved bet, Banker's edge is the familiar 1.17%.
    expect(houseEdgePerResolvedBet(banker)).toBeCloseTo(0.0117, 4);
  });

  it("ranks Banker as the cheapest bet on the table", () => {
    const valuations = valuateAllBets(probabilities, DEFAULT_RULES);
    expect(bestBet(valuations).bet).toBe("banker");
  });

  it("has no bet with a positive expectation", () => {
    const valuations = valuateAllBets(probabilities, DEFAULT_RULES);
    for (const valuation of Object.values(valuations)) {
      expect(valuation.expectedValue).toBeLessThan(0);
    }
  });

  it("gives every bet a probability distribution that sums to one", () => {
    const valuations = valuateAllBets(probabilities, DEFAULT_RULES);
    for (const valuation of Object.values(valuations)) {
      const total = valuation.payoffs.reduce((sum, payoff) => sum + payoff.probability, 0);
      expect(total).toBeCloseTo(1, 10);
    }
  });
});
