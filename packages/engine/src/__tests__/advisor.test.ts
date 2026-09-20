import { describe, expect, it } from "vitest";
import { betLabel, recommendBet, type AdviceInput } from "../advisor";
import { advanceProgression, initProgression } from "../progressions";
import { createShoe, dealCards } from "../shoe";
import { createSession } from "../session";
import type { Rank } from "../cards";

function input(overrides: Partial<AdviceInput> = {}): AdviceInput {
  const session = createSession();
  return {
    shoe: session.shoe,
    rules: session.rules,
    bankroll: session.bankroll,
    progression: session.progression,
    progressionOptions: session.progressionOptions,
    preferredBet: session.preferredBet,
    kellyMultiplier: session.kellyMultiplier,
    ...overrides,
  };
}

describe("recommendBet", () => {
  it("picks Banker on a fresh shoe and sizes it from the staking plan", () => {
    const advice = recommendBet(input());
    expect(advice.action).toBe("bet");
    expect(advice.bet).toBe("banker");
    expect(advice.amount).toBe(10);
    expect(advice.units).toBe(1);
  });

  it("returns a zero Kelly stake, because nothing is +EV", () => {
    const advice = recommendBet(input());
    expect(advice.kelly.fraction).toBe(0);
    expect(advice.kelly.stake).toBe(0);
    expect(advice.reasons.join(" ")).toContain("positive expectation");
  });

  it("states the expected cost of the bet it recommends", () => {
    const advice = recommendBet(input());
    // 10 staked at a 1.06% edge costs about 10.6 cents in expectation.
    expect(advice.expectedCost).toBeCloseTo(10 * 0.010579, 5);
  });

  it("ranks every bet from cheapest to most expensive", () => {
    const advice = recommendBet(input());
    expect(advice.ranked[0]!.bet).toBe("banker");
    expect(advice.ranked[1]!.bet).toBe("player");
    expect(advice.ranked.at(-1)!.bet).toBe("tie");
    for (let i = 1; i < advice.ranked.length; i += 1) {
      expect(advice.ranked[i]!.houseEdge).toBeGreaterThanOrEqual(advice.ranked[i - 1]!.houseEdge);
    }
  });

  it("warns when the chosen bet is not the cheapest one", () => {
    const advice = recommendBet(input({ preferredBet: "tie" }));
    expect(advice.bet).toBe("tie");
    expect(advice.warnings.join(" ")).toContain("Banker");
    expect(advice.warnings.join(" ")).toContain("side bet");
  });

  it("stops on a stop-win", () => {
    const session = createSession();
    const advice = recommendBet(
      input({ bankroll: { ...session.bankroll, bankroll: 1200 } }),
    );
    expect(advice.action).toBe("stop");
    expect(advice.amount).toBe(0);
    expect(advice.reasons.join(" ")).toContain("Stop-win");
    // The numbers are still there for the screen behind the notice.
    expect(advice.probabilities).not.toBeNull();
  });

  it("stops on a stop-loss", () => {
    const session = createSession();
    const advice = recommendBet(input({ bankroll: { ...session.bankroll, bankroll: 700 } }));
    expect(advice.action).toBe("stop");
    expect(advice.reasons.join(" ")).toContain("Stop-loss");
  });

  it("stops when the bankroll is under the table minimum", () => {
    const session = createSession();
    const advice = recommendBet(
      input({
        bankroll: { ...session.bankroll, bankroll: 5, stopLoss: null, stopWin: null },
      }),
    );
    expect(advice.action).toBe("stop");
    expect(advice.reasons.join(" ")).toContain("below the table minimum");
  });

  it("calls for a shuffle when the shoe cannot finish a coup", () => {
    let shoe = createShoe(1);
    const ranks: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    for (let round = 0; round < 4; round += 1) {
      for (const rank of ranks) {
        if (round === 3 && rank === "Q") break;
        shoe = dealCards(shoe, [rank]);
      }
    }
    const advice = recommendBet(input({ shoe }));
    expect(advice.action).toBe("shuffle");
    expect(advice.amount).toBe(0);
  });

  it("says out loud when a progression has outrun the table", () => {
    const session = createSession({
      progression: "martingale",
      bankroll: { tableMax: 40, unitSize: 10, stopLoss: null, stopWin: null },
    });
    let progression = session.progression;
    for (let i = 0; i < 5; i += 1) {
      progression = advanceProgression(
        progression,
        { result: "loss", profitUnits: -progression.units },
        session.progressionOptions,
      );
    }
    const advice = recommendBet(
      input({
        bankroll: session.bankroll,
        progression,
        progressionOptions: session.progressionOptions,
      }),
    );
    expect(progression.requestedUnits).toBeGreaterThan(progression.units);
    expect(advice.warnings.join(" ")).toContain("ladder is broken");
  });

  it("never advises a stake the bankroll cannot cover", () => {
    const session = createSession();
    const advice = recommendBet(
      input({
        bankroll: { ...session.bankroll, bankroll: 25, stopLoss: null, stopWin: null },
        progression: initProgression("flat", {
          ...session.progressionOptions,
          baseUnits: 10,
        }),
      }),
    );
    expect(advice.amount).toBeLessThanOrEqual(25);
  });

  it("flags a stake that is a large slice of the bankroll", () => {
    const session = createSession();
    const advice = recommendBet(
      input({
        bankroll: { ...session.bankroll, bankroll: 50, stopLoss: null, stopWin: null },
      }),
    );
    expect(advice.warnings.join(" ")).toContain("of your remaining bankroll");
  });

  it("reports how deep into the shoe it is", () => {
    // Spread the 208 cards across ranks: a shoe holds only 32 of any one.
    const ranks: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const shoe = dealCards(
      createShoe(8),
      Array.from({ length: 208 }, (_, index) => ranks[index % ranks.length]!),
    );
    const advice = recommendBet(input({ shoe }));
    expect(advice.shoe.remaining).toBe(416 - 208);
    expect(advice.shoe.penetration).toBeCloseTo(0.5, 10);
  });

  it("labels every bet for display", () => {
    expect(betLabel("banker")).toBe("Banker");
    expect(betLabel("eitherPair")).toBe("Either Pair");
  });
});
