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
  finished: false,
  manualWager: null,
  skipped: false,
  bankroll: 1000,
  mode: "play",
};

describe("resolveTableCall", () => {
  it("falls back to the engine when no system is selected", () => {
    const call = resolveTableCall(base);
    expect(call).toMatchObject({ source: "advice", bet: "banker", amount: 10, stakes: true });
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

  it("refuses to stake more than the bankroll has, from any source", () => {
    // Before opt-out this was a disabled button. There is no button now, so
    // refusing here is the only thing standing between a $600 ladder step
    // and a negative bankroll.
    const poorSystem = resolveTableCall({
      ...base,
      run: run(`${WARMUP}BBB`, { bankroll: 50 }),
      bankroll: 50,
    });
    expect(poorSystem.unaffordable).toBe(true);
    expect(poorSystem.stakes).toBe(false);
    expect(callToWager(poorSystem)).toBeNull();
    // ...while still SAYING what the rule wanted.
    expect(poorSystem.bet).toBe("banker");
    expect(poorSystem.amount).toBe(400);
    expect(poorSystem.blockedReason).toMatch(/bankroll/i);

    const poorManual = resolveTableCall({
      ...base,
      manualWager: { bet: "banker", amount: 900 },
      bankroll: 100,
    });
    expect(poorManual.stakes).toBe(false);
    expect(callToWager(poorManual)).toBeNull();

    expect(resolveTableCall(base).unaffordable).toBe(false);
    expect(resolveTableCall(base).stakes).toBe(true);
  });

  it("stakes nothing once the shoe the system ran on is finished", () => {
    // Otherwise "New shoe" carries the finished shoe's ladder step into the
    // fresh one and stakes it against a side read from the old shoe.
    const call = resolveTableCall({ ...base, run: run(`${WARMUP}BBB`), finished: true });
    expect(call.bet).toBeNull();
    expect(call.stakes).toBe(false);
    expect(callToWager(call)).toBeNull();
    expect(call.noBetReason).toMatch(/finished/i);
    // The same run on a live shoe is a real call.
    expect(resolveTableCall({ ...base, run: run(`${WARMUP}BBB`) }).amount).toBe(400);
  });

  it("refuses to stake past the engine's stop, even with a system running", () => {
    // The system branch used to return before the engine was consulted, so
    // selecting a system quietly switched the stop-loss off.
    for (const action of ["stop", "shuffle"] as const) {
      const advice = { ...ADVICE, action, bet: null } as unknown as Advice;
      const call = resolveTableCall({ ...base, advice, run: run(WARMUP) });
      expect(call.bet).toBe("banker");
      expect(call.amount).toBe(100);
      expect(call.stakes).toBe(false);
      expect(callToWager(call)).toBeNull();
      expect(call.blockedReason).toBeTruthy();
    }
  });

  it("observe mode keeps score and never stakes, whatever is speaking", () => {
    const inputs: TableCallInput[] = [
      base,
      { ...base, run: run(WARMUP) },
      { ...base, manualWager: { bet: "player", amount: 40 } },
    ];
    for (const input of inputs) {
      const call = resolveTableCall({ ...input, mode: "observe" });
      expect(call.stakes).toBe(false);
      expect(callToWager(call)).toBeNull();
      expect(call.blockedReason).toMatch(/observ/i);
      // ...and still says what it would have done.
      expect(call.bet).not.toBeNull();
    }
  });

  it("stakes nothing when the engine itself says not to bet", () => {
    for (const action of ["stop", "sit-out", "shuffle"] as const) {
      const call = resolveTableCall({
        ...base,
        advice: { ...ADVICE, action, bet: null } as unknown as Advice,
      });
      expect(call.bet).toBeNull();
      expect(call.amount).toBe(0);
      expect(call.stakes).toBe(false);
      expect(callToWager(call)).toBeNull();
      // "Recording will stake nothing" is the CARD's line now; the reason
      // says why the app is pointing at nothing.
      expect(call.noBetReason).toBeTruthy();
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
        expect(call.stakes).toBe(false);
        expect(callToWager(call)).toBeNull();
      } else {
        expect(call.amount).toBeGreaterThan(0);
        expect(call.noBetReason).toBeNull();
        // A live instruction either stakes, or says why it does not.
        if (call.stakes) {
          expect(call.blockedReason).toBeNull();
          expect(callToWager(call)).toEqual({ bet: call.bet, amount: call.amount });
        } else {
          expect(call.blockedReason).toBeTruthy();
          expect(callToWager(call)).toBeNull();
        }
      }
    }
  });
});

describe("the call under a second system", () => {
  const streak = (pattern: string, extra = {}) =>
    runBettingSystem({
      coups: coups(pattern),
      rules: DEFAULT_RULES,
      system: "reverse-streak-4" as const,
      ...extra,
    });

  it("carries the chosen system's name, stake and detail", () => {
    const call = resolveTableCall({ ...base, run: streak(`${WARMUP}BBB`) });
    expect(call).toMatchObject({
      source: "system",
      systemName: "Reverse Streak 4",
      bet: "banker",
      amount: 400,
      stakes: true,
    });
    expect(call.detail).toContain("ladder step 4 of 4");
    // The group step is 4 here too, which is the coincidence that makes the
    // divergence below worth pinning rather than assumed.
    expect(call.detail).not.toContain("group");
  });

  it("names the ladder rung rather than the group step after a loss", () => {
    // Group step 5, ladder rung 1. The old hardcoded line said "bet 5 of 6"
    // over a 100 stake, which reads as the fifth rung of a climbing ladder.
    const call = resolveTableCall({ ...base, run: streak(`${WARMUP}BBPB`) });
    expect(call.amount).toBe(200);
    expect(call.detail).toBe("Hand 17 · ladder step 2 of 4 · mirroring hand 5");
  });

  it("never sits a coup out once it is past the warm-up", () => {
    // The same hands under Reverse 12 are a dead group.
    const hands = `${WARMUP}BBPP`;
    expect(resolveTableCall({ ...base, run: run(hands) })).toMatchObject({
      bet: null,
      stakes: false,
    });
    expect(resolveTableCall({ ...base, run: streak(hands) })).toMatchObject({
      bet: "banker",
      amount: 100,
      stakes: true,
    });
  });

  it("still refuses to stake what the bankroll cannot cover", () => {
    // Every gate applies to the new system exactly as to the old one; this
    // is the one that used to be a disabled button.
    const call = resolveTableCall({ ...base, run: streak(`${WARMUP}BBB`), bankroll: 50 });
    expect(call).toMatchObject({ bet: "banker", amount: 400, stakes: false, unaffordable: true });
    expect(callToWager(call)).toBeNull();
  });
});

describe("the call under the Martingale system", () => {
  const martingale = (pattern: string) =>
    runBettingSystem({
      coups: coups(pattern),
      rules: DEFAULT_RULES,
      system: "reverse-streak-4-martingale" as const,
    });

  it("stakes eight units after three losses", () => {
    const call = resolveTableCall({ ...base, run: martingale(`${WARMUP}PPP`), bankroll: 5000 });
    expect(call).toMatchObject({ source: "system", bet: "banker", amount: 400, stakes: true });
  });

  it("stops staking once it is eight hands up", () => {
    // Every reference hand is Player, so eight Bankers are eight wins.
    const call = resolveTableCall({ ...base, run: martingale(`${WARMUP}BBBBBBBB`) });
    expect(call).toMatchObject({ source: "system", bet: null, stakes: false });
    expect(call.noBetReason).toContain("stop-win");
    expect(callToWager(call)).toBeNull();
  });
});
