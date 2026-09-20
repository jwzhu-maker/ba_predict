import {
  DEFAULT_RULES,
  runBettingSystem,
  type Advice,
  type CoupRecord,
  type Outcome,
} from "@ba-predict/engine";
import { describe, expect, it } from "vitest";
import { callToWager, resolveTableCall, type TableCallInput } from "../table-call";

function coups(pattern: string): CoupRecord[] {
  return [...pattern.replace(/\s+/g, "")].map((char) => {
    const outcome: Outcome =
      char === "P" ? "player" : char === "B" ? "banker" : char === "T" ? "tie" : (null as never);
    if (outcome === null) throw new Error(`bad pattern character ${char}`);
    return { outcome, playerPair: false, bankerPair: false };
  });
}

const run = (pattern: string, extra = {}) =>
  runBettingSystem({ coups: coups(pattern), rules: DEFAULT_RULES, ...extra });

const WARMUP = "PPPPPPPPPPPP";

/** A minimal Advice standing in for the engine's recommendation. */
const ADVICE: Advice = {
  action: "bet",
  bet: "banker",
  amount: 10,
  expectedCost: 0.11,
  reasons: [],
  warnings: [],
  valuations: null,
} as unknown as Advice;

const base: TableCallInput = {
  advice: ADVICE,
  run: null,
  manualWager: null,
  skipped: false,
  bankroll: 1000,
};

describe("resolveTableCall", () => {
  it("falls back to the engine when no system is selected", () => {
    const call = resolveTableCall(base);
    expect(call).toMatchObject({ source: "advice", bet: "banker", amount: 10 });
    expect(callToWager(call)).toEqual({ bet: "banker", amount: 10 });
  });

  it("lets the active system speak instead of the engine", () => {
    // The whole point of the change: the system's $100 replaces the flat $10.
    const call = resolveTableCall({ ...base, run: run(WARMUP) });
    expect(call.source).toBe("system");
    expect(call.systemName).toBe("Reverse 12");
    expect(call.bet).toBe("banker");
    expect(call.amount).toBe(100);
    expect(callToWager(call)).toEqual({ bet: "banker", amount: 100 });
  });

  it("carries the system's ladder up, not the engine's flat stake", () => {
    expect(resolveTableCall({ ...base, run: run(`${WARMUP}B`) }).amount).toBe(200);
    expect(resolveTableCall({ ...base, run: run(`${WARMUP}BB`) }).amount).toBe(300);
    expect(resolveTableCall({ ...base, run: run(`${WARMUP}BBBBB`) }).amount).toBe(600);
  });

  it("stakes nothing while the system is watching, and says why", () => {
    const call = resolveTableCall({ ...base, run: run("PPPPP") });
    expect(call.source).toBe("system");
    expect(call.bet).toBeNull();
    expect(call.amount).toBe(0);
    expect(call.noBetReason).toMatch(/Watching\. 7 more hands/);
    expect(callToWager(call)).toBeNull();
  });

  it("stakes nothing while the system is sitting out a lost group", () => {
    const call = resolveTableCall({ ...base, run: run(`${WARMUP}P`) });
    expect(call.bet).toBeNull();
    expect(call.noBetReason).toMatch(/Group 1 lost/);
  });

  it("stakes nothing once the system has finished the shoe", () => {
    const call = resolveTableCall({ ...base, run: run("PB".repeat(31)) });
    expect(call.bet).toBeNull();
    expect(call.noBetReason).toMatch(/hand 60 is the last one/);
  });

  it("skipping outranks the system and the engine alike", () => {
    for (const withRun of [null, run(WARMUP)]) {
      const call = resolveTableCall({ ...base, run: withRun, skipped: true });
      expect(call.source).toBe("skipped");
      expect(call.bet).toBeNull();
      expect(call.amount).toBe(0);
      expect(callToWager(call)).toBeNull();
      expect(call.noBetReason).toMatch(/sitting this coup out/i);
    }
  });

  it("a hand-placed wager outranks everything, including a skip", () => {
    const call = resolveTableCall({
      ...base,
      run: run(WARMUP),
      skipped: true,
      manualWager: { bet: "tie", amount: 25 },
    });
    expect(call.source).toBe("manual");
    expect(call).toMatchObject({ bet: "tie", amount: 25 });
    expect(callToWager(call)).toEqual({ bet: "tie", amount: 25 });
  });

  it("passes the table-maximum clip through so the card can show both numbers", () => {
    const call = resolveTableCall({
      ...base,
      run: run(`${WARMUP}BBB`, { tableMax: 250 }),
    });
    expect(call.amount).toBe(250);
    expect(call.requestedAmount).toBe(400);
    expect(call.clipped).toBe(true);
    // What settles is the clipped amount, never the ask.
    expect(callToWager(call)).toEqual({ bet: "banker", amount: 250 });
  });

  it("flags a call the bankroll cannot cover, from either source", () => {
    expect(
      resolveTableCall({ ...base, run: run(`${WARMUP}BBB`, { bankroll: 50 }), bankroll: 50 })
        .unaffordable,
    ).toBe(true);
    expect(resolveTableCall({ ...base, bankroll: 5 }).unaffordable).toBe(true);
    expect(
      resolveTableCall({ ...base, manualWager: { bet: "banker", amount: 900 }, bankroll: 100 })
        .unaffordable,
    ).toBe(true);
    expect(resolveTableCall(base).unaffordable).toBe(false);
  });

  it("stakes nothing when the engine itself says not to bet", () => {
    for (const action of ["stop", "sit-out", "shuffle"] as const) {
      const call = resolveTableCall({
        ...base,
        advice: { ...ADVICE, action, bet: null } as unknown as Advice,
      });
      expect(call.bet).toBeNull();
      expect(call.amount).toBe(0);
      expect(callToWager(call)).toBeNull();
      expect(call.noBetReason).toMatch(/stake nothing/);
    }
  });

  it("claims the engine's sizing sentence only when the engine sets the stake", () => {
    // `Advice.sizingReason` reads "1 unit at 10.00 each". Rendering it beside
    // a system's 100 or a hand-placed 400 states a stake the card is not
    // about to place, which is the whole reason it is not in `reasons`.
    expect(resolveTableCall(base).engineSizes).toBe(true);
    expect(resolveTableCall({ ...base, run: run(WARMUP) }).engineSizes).toBe(false);
    expect(resolveTableCall({ ...base, run: run("PPP") }).engineSizes).toBe(false);
    expect(resolveTableCall({ ...base, skipped: true }).engineSizes).toBe(false);
    expect(
      resolveTableCall({ ...base, manualWager: { bet: "player", amount: 400 } }).engineSizes,
    ).toBe(false);
    // Not even when the engine is speaking but declining to bet.
    expect(
      resolveTableCall({
        ...base,
        advice: { ...ADVICE, action: "stop", bet: null } as unknown as Advice,
      }).engineSizes,
    ).toBe(false);
  });

  it("never returns an amount without a bet, or a bet without an amount", () => {
    const inputs: TableCallInput[] = [
      base,
      { ...base, run: run(WARMUP) },
      { ...base, run: run("PPP") },
      { ...base, run: run(`${WARMUP}P`) },
      { ...base, skipped: true },
      { ...base, manualWager: { bet: "player", amount: 40 } },
      { ...base, advice: { ...ADVICE, action: "stop", bet: null } as unknown as Advice },
    ];
    for (const input of inputs) {
      const call = resolveTableCall(input);
      if (call.bet === null) {
        expect(call.amount).toBe(0);
        expect(call.noBetReason).toBeTruthy();
        expect(callToWager(call)).toBeNull();
      } else {
        expect(call.amount).toBeGreaterThan(0);
        expect(call.noBetReason).toBeNull();
        expect(callToWager(call)).toEqual({ bet: call.bet, amount: call.amount });
      }
    }
  });
});
