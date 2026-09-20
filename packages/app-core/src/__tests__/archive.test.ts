import { createSession, type SessionState } from "@ba-predict/engine";
import { describe, expect, it } from "vitest";
import { archiveSession, lifetimeStats } from "../archive";
import { createInitialState, reducer, type AppState } from "../reducer";
import { deserializeState, serializeState } from "../storage";

function play(state: AppState, ...actions: Parameters<typeof reducer>[1][]): AppState {
  return actions.reduce((current, action) => reducer(current, action), state);
}

/** Bet 10 on Banker and settle it the given way. */
function wager(outcome: "banker" | "player" | "tie") {
  return [
    { type: "place-wager", wager: { bet: "banker", amount: 10 } },
    { type: "record-coup", coup: { outcome } },
  ] as Parameters<typeof reducer>[1][];
}

describe("archiveSession", () => {
  it("summarises a played session", () => {
    let session: SessionState = createSession({ startedAt: 1000 });
    let state: AppState = { ...createInitialState(), session };
    state = play(state, ...wager("banker"), ...wager("player"), ...wager("tie"));

    const archived = archiveSession(state.session, 5000)!;
    expect(archived.startedAt).toBe(1000);
    expect(archived.endedAt).toBe(5000);
    expect(archived.wagers).toBe(3);
    expect(archived.wins).toBe(1);
    expect(archived.losses).toBe(1);
    expect(archived.pushes).toBe(1);
    expect(archived.totalWagered).toBe(30);
    expect(archived.netProfit).toBeCloseTo(-0.5, 10);
    expect(archived.endingBankroll).toBeCloseTo(999.5, 10);
  });

  it("refuses to archive a session that never placed a wager", () => {
    const state = play(createInitialState(), { type: "record-coup", coup: { outcome: "banker" } });
    expect(archiveSession(state.session, 1)).toBeNull();
  });
});

describe("ending a session", () => {
  it("files it and carries the money forward", () => {
    let state = play(createInitialState(), ...wager("banker"));
    const ending = state.session.bankroll.bankroll;
    expect(ending).toBeCloseTo(1009.5, 10);

    state = reducer(state, { type: "end-session", now: 9999 });
    expect(state.archive).toHaveLength(1);
    expect(state.archive[0]!.netProfit).toBeCloseTo(9.5, 10);
    // The new session opens on the money actually in hand, at zero profit.
    expect(state.session.bankroll.bankroll).toBeCloseTo(ending, 10);
    expect(state.session.bankroll.startingBankroll).toBeCloseTo(ending, 10);
    expect(state.session.coups).toEqual([]);
  });

  it("puts the original stake back on a reset instead", () => {
    let state = play(createInitialState(), ...wager("banker"));
    const original = state.session.bankroll.startingBankroll;
    state = reducer(state, { type: "reset-session" });
    expect(state.archive).toHaveLength(1);
    expect(state.session.bankroll.bankroll).toBe(original);
    expect(state.session.bankroll.startingBankroll).toBe(original);
  });

  it("files nothing when there was no action", () => {
    const state = reducer(createInitialState(), { type: "end-session", now: 1 });
    expect(state.archive).toEqual([]);
  });

  it("drops undo history, which cannot span the boundary", () => {
    let state = play(createInitialState(), ...wager("banker"));
    expect(state.history.length).toBeGreaterThan(0);
    state = reducer(state, { type: "end-session", now: 1 });
    expect(state.history).toEqual([]);
    // Undo must not resurrect the session that was just filed, or the next
    // close would archive it a second time.
    const undone = reducer(state, { type: "undo" });
    expect(undone.archive).toHaveLength(1);
    expect(undone.session.coups).toEqual([]);
  });

  it("keeps the rules and the staking plan", () => {
    let state = play(
      createInitialState(),
      { type: "set-progression", progression: "fibonacci" },
      { type: "update-rules", rules: { tiePayout: 9 } },
      ...wager("player"),
    );
    state = reducer(state, { type: "end-session", now: 1 });
    expect(state.session.rules.tiePayout).toBe(9);
    expect(state.session.progression.id).toBe("fibonacci");
  });

  it("clears the archive on request", () => {
    let state = play(createInitialState(), ...wager("banker"));
    state = reducer(state, { type: "end-session", now: 1 });
    expect(reducer(state, { type: "clear-archive" }).archive).toEqual([]);
  });
});

describe("lifetimeStats", () => {
  it("is empty with nothing played", () => {
    const totals = lifetimeStats([], createSession());
    expect(totals.sessions).toBe(0);
    expect(totals.actualEdge).toBe(0);
  });

  it("counts the running session alongside the archive", () => {
    let state = play(createInitialState(), ...wager("banker"));
    state = reducer(state, { type: "end-session", now: 1 });
    state = play(state, ...wager("player"));

    const withCurrent = lifetimeStats(state.archive, state.session);
    expect(withCurrent.sessions).toBe(2);
    expect(withCurrent.wagers).toBe(2);
    expect(withCurrent.totalWagered).toBe(20);
    expect(withCurrent.netProfit).toBeCloseTo(-0.5, 10);
    expect(withCurrent.winningSessions).toBe(1);

    const archiveOnly = lifetimeStats(state.archive);
    expect(archiveOnly.sessions).toBe(1);
  });

  it("reports the cost as a positive fraction of everything staked", () => {
    let state = play(createInitialState(), ...wager("player"), ...wager("player"));
    state = reducer(state, { type: "end-session", now: 1 });
    const totals = lifetimeStats(state.archive);
    // Two losses of 10 on 20 staked is a 100% cost — arithmetic, not a claim
    // about the table.
    expect(totals.totalWagered).toBe(20);
    expect(totals.netProfit).toBe(-20);
    expect(totals.actualEdge).toBeCloseTo(1, 10);
  });

  it("tracks the best and worst nights", () => {
    let state = play(createInitialState(), ...wager("banker"));
    state = reducer(state, { type: "end-session", now: 1 });
    state = play(state, ...wager("player"), ...wager("player"));
    state = reducer(state, { type: "end-session", now: 2 });

    const totals = lifetimeStats(state.archive);
    expect(totals.bestSession).toBeCloseTo(9.5, 10);
    expect(totals.worstSession).toBe(-20);
    expect(totals.worstDrawdown).toBe(20);
  });
});

describe("persistence of the archive", () => {
  it("survives a round trip", () => {
    let state = play(createInitialState(), ...wager("banker"));
    state = reducer(state, { type: "end-session", now: 4242 });
    state = reducer(state, { type: "set-currency", currency: "MYR" });

    const restored = deserializeState(serializeState(state));
    expect(restored.archive).toEqual(state.archive);
    expect(restored.currency).toBe("MYR");
  });

  it("repairs a payload whose archive is not a list", () => {
    const restored = deserializeState(
      JSON.stringify({ ...createInitialState(), archive: "nonsense", currency: 7 }),
    );
    expect(restored.archive).toEqual([]);
    expect(restored.currency).toBe(createInitialState().currency);
  });
});

describe("best and worst nights", () => {
  it("reports nothing rather than zero before there is one", () => {
    let state = play(createInitialState(), ...wager("banker"));
    state = reducer(state, { type: "end-session", now: 1 });
    const totals = lifetimeStats(state.archive);
    // One winning session, so there is no worst night to name. Reporting 0
    // here would claim a break-even session that never happened.
    expect(totals.bestSession).toBeCloseTo(9.5, 10);
    expect(totals.worstSession).toBeNull();
  });

  it("ignores a break-even session for both", () => {
    // A single pushed wager: action taken, nothing won or lost.
    let state = play(createInitialState(), ...wager("tie"));
    state = reducer(state, { type: "end-session", now: 1 });
    const totals = lifetimeStats(state.archive);
    expect(totals.sessions).toBe(1);
    expect(totals.bestSession).toBeNull();
    expect(totals.worstSession).toBeNull();
  });
});
