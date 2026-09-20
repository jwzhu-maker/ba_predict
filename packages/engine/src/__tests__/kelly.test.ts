import { describe, expect, it } from "vitest";
import { valuateAllBets } from "../ev";
import { kellyFraction, kellyStake, logGrowthRate } from "../kelly";
import { coupProbabilities } from "../odds";
import { createShoe } from "../shoe";
import { DEFAULT_RULES } from "../types";

describe("kellyFraction", () => {
  it("matches the textbook formula on an even-money bet", () => {
    // f* = 2p - 1 when the payout is 1:1.
    const fraction = kellyFraction([
      { probability: 0.6, netReturn: 1 },
      { probability: 0.4, netReturn: -1 },
    ]);
    expect(fraction).toBeCloseTo(0.2, 9);
  });

  it("handles a push, which the two-outcome formula cannot", () => {
    // 0.5/(1+f) = 0.3/(1-f)  =>  f = 0.25
    const fraction = kellyFraction([
      { probability: 0.5, netReturn: 1 },
      { probability: 0.2, netReturn: 0 },
      { probability: 0.3, netReturn: -1 },
    ]);
    expect(fraction).toBeCloseTo(0.25, 9);
  });

  it("scales with the payout", () => {
    // f* = (bp - q) / b with b = 2, p = 0.4  =>  (0.8 - 0.6) / 2 = 0.1
    const fraction = kellyFraction([
      { probability: 0.4, netReturn: 2 },
      { probability: 0.6, netReturn: -1 },
    ]);
    expect(fraction).toBeCloseTo(0.1, 9);
  });

  it("finds the actual maximum of the growth rate", () => {
    const payoffs = [
      { probability: 0.55, netReturn: 1 },
      { probability: 0.45, netReturn: -1 },
    ];
    const best = kellyFraction(payoffs);
    const growth = logGrowthRate(payoffs, best);
    expect(growth).toBeGreaterThan(logGrowthRate(payoffs, best - 0.01));
    expect(growth).toBeGreaterThan(logGrowthRate(payoffs, best + 0.01));
  });

  it("stakes nothing on a negative-expectation bet", () => {
    expect(
      kellyFraction([
        { probability: 0.49, netReturn: 1 },
        { probability: 0.51, netReturn: -1 },
      ]),
    ).toBe(0);
  });

  it("stakes nothing on any real baccarat bet", () => {
    const probabilities = coupProbabilities(createShoe(8))!;
    const valuations = valuateAllBets(probabilities, DEFAULT_RULES);
    for (const valuation of Object.values(valuations)) {
      expect(kellyFraction(valuation.payoffs)).toBe(0);
    }
  });

  it("applies a fractional-Kelly multiplier", () => {
    const payoffs = [
      { probability: 0.6, netReturn: 1 },
      { probability: 0.4, netReturn: -1 },
    ];
    const half = kellyStake({ bankroll: 1000, payoffs, multiplier: 0.5 });
    expect(half.fraction).toBeCloseTo(0.1, 9);
    expect(half.stake).toBeCloseTo(100, 6);
  });

  it("never returns a fraction that can bankrupt the bettor outright", () => {
    const fraction = kellyFraction([
      { probability: 0.99, netReturn: 1 },
      { probability: 0.01, netReturn: -1 },
    ]);
    expect(fraction).toBeLessThan(1);
    expect(Number.isFinite(logGrowthRate([
      { probability: 0.99, netReturn: 1 },
      { probability: 0.01, netReturn: -1 },
    ], fraction))).toBe(true);
  });
});
