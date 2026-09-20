import { describe, expect, it } from "vitest";
import { cardsRemaining } from "../shoe";
import { applyCoup, createSession, sessionStats, settleWager } from "../session";
import { DEFAULT_RULES } from "../types";

describe("settleWager", () => {
  const stake = { bet: "banker" as const, amount: 100 };

  it("takes commission out of a Banker win", () => {
    expect(settleWager(stake, { outcome: "banker" }, DEFAULT_RULES)).toEqual({
      result: "win",
      profit: 95,
    });
  });

  it("pushes a Banker bet on a tie rather than losing it", () => {
    expect(settleWager(stake, { outcome: "tie" }, DEFAULT_RULES)).toEqual({
      result: "push",
      profit: 0,
    });
  });

  it("pays Player at even money", () => {
    expect(
      settleWager({ bet: "player", amount: 100 }, { outcome: "player" }, DEFAULT_RULES),
    ).toEqual({ result: "win", profit: 100 });
  });

  it("pays a Tie bet at the table rate", () => {
    expect(settleWager({ bet: "tie", amount: 10 }, { outcome: "tie" }, DEFAULT_RULES)).toEqual({
      result: "win",
      profit: 80,
    });
  });

  it("settles pairs off the recorded flags", () => {
    const coup = { outcome: "player" as const, playerPair: true, bankerPair: false };
    expect(settleWager({ bet: "playerPair", amount: 10 }, coup, DEFAULT_RULES).profit).toBe(110);
    expect(settleWager({ bet: "bankerPair", amount: 10 }, coup, DEFAULT_RULES).profit).toBe(-10);
    expect(settleWager({ bet: "eitherPair", amount: 10 }, coup, DEFAULT_RULES).profit).toBe(50);
  });

  it("asks for the card count before settling Big or Small", () => {
    const coup = { outcome: "player" as const };
    const big = settleWager({ bet: "big", amount: 10 }, coup, DEFAULT_RULES);
    expect(big.unsettled).toBeTruthy();
    expect(big.profit).toBe(0);
    expect(settleWager({ bet: "big", amount: 10 }, { ...coup, cardCount: 6 }, DEFAULT_RULES).profit).toBeCloseTo(5.4, 10);
    expect(settleWager({ bet: "small", amount: 10 }, { ...coup, cardCount: 4 }, DEFAULT_RULES).profit).toBe(15);
    expect(settleWager({ bet: "small", amount: 10 }, { ...coup, cardCount: 5 }, DEFAULT_RULES).profit).toBe(-10);
  });

  it("asks whether Banker won on six at a no-commission table", () => {
    const rules = { ...DEFAULT_RULES, bankerSixPayout: 0.5 };
    const unknown = settleWager(stake, { outcome: "banker" }, rules);
    expect(unknown.unsettled).toBeTruthy();
    expect(settleWager(stake, { outcome: "banker", bankerWinOnSix: true }, rules).profit).toBe(50);
    expect(settleWager(stake, { outcome: "banker", bankerWinOnSix: false }, rules).profit).toBe(100);
  });
});

describe("applyCoup", () => {
  it("moves the bankroll, the progression and the history together", () => {
    const session = createSession({ progression: "martingale" });
    const { session: after, settlement } = applyCoup(
      session,
      { outcome: "player" },
      { bet: "banker", amount: 10 },
    );
    expect(settlement!.result).toBe("loss");
    expect(after.bankroll.bankroll).toBe(990);
    expect(after.progression.units).toBe(2);
    expect(after.coups).toHaveLength(1);
    expect(after.coups[0]!.wager).toEqual({
      bet: "banker",
      amount: 10,
      result: "loss",
      profit: -10,
    });
  });

  it("leaves the shoe alone when no cards were recorded", () => {
    const session = createSession();
    const before = cardsRemaining(session.shoe);
    const { session: after } = applyCoup(session, { outcome: "banker" });
    // Unknown cards come out in the proportions the shoe already holds, so
    // removing nothing keeps the composition estimate correct.
    expect(cardsRemaining(after.shoe)).toBe(before);
  });

  it("removes exactly the cards that were recorded", () => {
    const session = createSession();
    const before = cardsRemaining(session.shoe);
    const { session: after } = applyCoup(session, {
      outcome: "banker",
      cards: ["A", "K", "9", "7", "3"],
    });
    expect(cardsRemaining(after.shoe)).toBe(before - 5);
  });

  it("records a coup with no wager without touching the bankroll", () => {
    const session = createSession();
    const { session: after, settlement } = applyCoup(session, { outcome: "tie" });
    expect(settlement).toBeNull();
    expect(after.bankroll.bankroll).toBe(session.bankroll.bankroll);
    expect(after.progression).toBe(session.progression);
    expect(after.coups).toHaveLength(1);
  });

  it("does not mutate the session it was given", () => {
    const session = createSession();
    const snapshot = JSON.stringify(session);
    applyCoup(session, { outcome: "banker" }, { bet: "banker", amount: 10 });
    expect(JSON.stringify(session)).toBe(snapshot);
  });
});

describe("sessionStats", () => {
  it("tracks profit, action and drawdown", () => {
    let session = createSession();
    const script = [
      { outcome: "banker" as const, bet: "banker" as const }, // +95
      { outcome: "player" as const, bet: "banker" as const }, // -100
      { outcome: "player" as const, bet: "banker" as const }, // -100
      { outcome: "tie" as const, bet: "banker" as const }, //     0
      { outcome: "banker" as const, bet: "banker" as const }, // +95
    ];
    for (const step of script) {
      session = applyCoup(session, { outcome: step.outcome }, { bet: step.bet, amount: 100 }).session;
    }
    const stats = sessionStats(session);
    expect(stats.coups).toBe(5);
    expect(stats.wagers).toBe(5);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(2);
    expect(stats.pushes).toBe(1);
    expect(stats.totalWagered).toBe(500);
    expect(stats.netProfit).toBeCloseTo(-10, 10);
    expect(stats.actualEdge).toBeCloseTo(0.02, 10);
    expect(stats.largestWin).toBe(95);
    expect(stats.largestLoss).toBe(-100);
    // Peak 1095 after the first win, trough 895 after two losses.
    expect(stats.maxDrawdown).toBeCloseTo(200, 10);
    expect(stats.bankrollCurve[0]).toBe(1000);
    expect(stats.bankrollCurve.at(-1)).toBeCloseTo(990, 10);
  });

  it("reports nothing rather than dividing by zero on an untouched session", () => {
    const stats = sessionStats(createSession());
    expect(stats.actualEdge).toBe(0);
    expect(stats.totalWagered).toBe(0);
    expect(stats.bankrollCurve).toEqual([1000]);
  });
});
