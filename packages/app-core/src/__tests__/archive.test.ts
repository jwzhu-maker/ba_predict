import { createSession, type SessionState } from "@ba-predict/engine";
import { describe, expect, it } from "vitest";
import {
  ARCHIVE_LIMIT,
  EMPTY_EVICTED,
  archiveSession,
  isArchivedSession,
  lifetimeStats,
  parseEvictedTotals,
} from "../archive";
import { createInitialState, reducer, type AppState } from "../reducer";
import { deserializeState, serializeState } from "../storage";

function play(state: AppState, ...actions: Parameters<typeof reducer>[1][]): AppState {
  return actions.reduce((current, action) => reducer(current, action), state);
}

/** Bet 10 on Banker and settle it the given way. */
function wager(outcome: "banker" | "player" | "tie", now?: number) {
  return [
    { type: "place-wager", wager: { bet: "banker", amount: 10 } },
    { type: "record-coup", coup: { outcome }, ...(now === undefined ? {} : { now }) },
  ] as Parameters<typeof reducer>[1][];
}

describe("archiveSession", () => {
  it("summarises a played session", () => {
    const session: SessionState = createSession({ startedAt: 1000 });
    let state: AppState = { ...createInitialState(), session };
    state = play(state, ...wager("banker", 2000), ...wager("player", 3000), ...wager("tie", 4000));

    const archived = archiveSession(state.session, 5000)!;
    // Dated from the first WAGER (2000), not from when the session object was
    // created (1000): the gap between launching the app and sitting down is
    // not play.
    expect(archived.startedAt).toBe(2000);
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

/**
 * Regressions from the first review round. Each of these was a way the app
 * quietly understated what play had cost, which is the one direction it must
 * not be wrong in.
 */
describe("a session that spans several shoes", () => {
  it("archives every wager, not just the last shoe's", () => {
    let state = play(createInitialState(), ...wager("banker", 10));
    state = reducer(state, { type: "new-shoe" });
    state = play(state, ...wager("player", 20));
    state = reducer(state, { type: "new-shoe" });
    state = play(state, ...wager("player", 30));

    // Three shoes, three wagers, one sitting.
    expect(state.session.coups).toHaveLength(3);
    const archived = archiveSession(state.session, 40)!;
    expect(archived.wagers).toBe(3);
    expect(archived.totalWagered).toBe(30);
    expect(archived.netProfit).toBeCloseTo(9.5 - 10 - 10, 10);
  });

  it("still files the session when a new shoe was the last thing that happened", () => {
    let state = play(createInitialState(), ...wager("banker", 10));
    state = reducer(state, { type: "new-shoe" });
    // Clearing the ledger here used to make this archive nothing at all.
    state = reducer(state, { type: "end-session", now: 50 });
    expect(state.archive).toHaveLength(1);
    expect(state.archive[0]!.wagers).toBe(1);
  });

  it("keeps the archived profit consistent with the bankroll that carried forward", () => {
    let state = play(createInitialState(), ...wager("banker", 10));
    const opening = createInitialState().session.bankroll.startingBankroll;
    state = reducer(state, { type: "new-shoe" });
    state = play(state, ...wager("player", 20));
    const closing = state.session.bankroll.bankroll;

    state = reducer(state, { type: "end-session", now: 30 });
    const row = state.archive[0]!;
    expect(row.netProfit).toBeCloseTo(closing - opening, 10);
    expect(row.endingBankroll).toBeCloseTo(closing, 10);
  });
});

describe("dating a session from the first wager", () => {
  it("ignores an idle gap between opening the app and sitting down", () => {
    const session = createSession({ startedAt: 0 });
    let state: AppState = { ...createInitialState(), session };
    // Six hours pass, then one wager.
    state = play(state, ...wager("banker", 21_600_000));
    const archived = archiveSession(state.session, 21_700_000)!;
    expect(archived.startedAt).toBe(21_600_000);
    expect(archived.endedAt - archived.startedAt).toBe(100_000);
  });

  it("falls back to the session's creation when nothing stamped it", () => {
    // A session restored from storage written before the field existed.
    const session = { ...createSession({ startedAt: 777 }), firstWagerAt: null };
    let state: AppState = { ...createInitialState(), session };
    state = play(state, ...wager("banker"));
    const archived = archiveSession({ ...state.session, firstWagerAt: null }, 999)!;
    expect(archived.startedAt).toBe(777);
  });
});

describe("the archive cap", () => {
  it("keeps evicted sessions in the lifetime totals", () => {
    let state = createInitialState();
    const rounds = ARCHIVE_LIMIT + 5;
    for (let i = 0; i < rounds; i += 1) {
      state = play(state, ...wager("player", i + 1));
      state = reducer(state, { type: "end-session", now: i + 1 });
    }

    expect(state.archive).toHaveLength(ARCHIVE_LIMIT);
    expect(state.evicted.sessions).toBe(5);

    // Every session lost 10 on a losing Player bet, so the lifetime totals
    // must still account for all of them — not just the retained window.
    const totals = lifetimeStats(state.archive, state.session, state.evicted);
    expect(totals.sessions).toBe(rounds);
    expect(totals.wagers).toBe(rounds);
    expect(totals.totalWagered).toBe(rounds * 10);
    expect(totals.netProfit).toBeCloseTo(rounds * -10, 10);
    expect(totals.worstSession).toBe(-10);
  });

  it("clears the evicted totals along with the archive", () => {
    let state = createInitialState();
    for (let i = 0; i < ARCHIVE_LIMIT + 2; i += 1) {
      state = play(state, ...wager("player", i + 1));
      state = reducer(state, { type: "end-session", now: i + 1 });
    }
    expect(state.evicted.sessions).toBeGreaterThan(0);
    const cleared = reducer(state, { type: "clear-archive" });
    expect(cleared.archive).toEqual([]);
    expect(cleared.evicted.sessions).toBe(0);
    expect(lifetimeStats(cleared.archive, undefined, cleared.evicted).totalWagered).toBe(0);
  });
});

describe("restoring a damaged archive", () => {
  it("recognises a well-formed row", () => {
    let state = play(createInitialState(), ...wager("banker", 1));
    state = reducer(state, { type: "end-session", now: 2 });
    expect(isArchivedSession(state.archive[0])).toBe(true);
  });

  it("rejects the shapes a corrupt payload actually produces", () => {
    expect(isArchivedSession(null)).toBe(false);
    expect(isArchivedSession(undefined)).toBe(false);
    expect(isArchivedSession("a session")).toBe(false);
    expect(isArchivedSession({})).toBe(false);
    expect(isArchivedSession({ id: "x", progression: "flat" })).toBe(false);
    expect(isArchivedSession({ id: 1, progression: "flat", netProfit: 0 })).toBe(false);
  });

  it("drops bad rows instead of crashing the History screen", () => {
    let state = play(createInitialState(), ...wager("banker", 1));
    state = reducer(state, { type: "end-session", now: 2 });
    const good = state.archive[0]!;

    const restored = deserializeState(
      JSON.stringify({ ...state, archive: [null, good, { id: "broken" }, 42] }),
    );
    expect(restored.archive).toEqual([good]);
    // The screen's own maths must survive the round trip.
    expect(() => lifetimeStats(restored.archive, restored.session, restored.evicted)).not.toThrow();
    expect(lifetimeStats(restored.archive, undefined, restored.evicted).sessions).toBe(1);
  });

  it("restores evicted totals, and repairs a missing or malformed block", () => {
    let state = createInitialState();
    for (let i = 0; i < ARCHIVE_LIMIT + 3; i += 1) {
      state = play(state, ...wager("player", i + 1));
      state = reducer(state, { type: "end-session", now: i + 1 });
    }
    const restored = deserializeState(serializeState(state));
    expect(restored.evicted).toEqual(state.evicted);

    const repaired = deserializeState(JSON.stringify({ ...state, evicted: "nonsense" }));
    expect(repaired.evicted.sessions).toBe(0);
  });
});

describe("restoring evicted totals", () => {
  it("accepts a well-formed block", () => {
    const block = {
      sessions: 3,
      netProfit: -30,
      totalWagered: 300,
      wagers: 30,
      wins: 10,
      losses: 20,
      pushes: 0,
      coups: 30,
      winningSessions: 1,
      worstDrawdown: 40,
      worstSession: -25,
      bestSession: 5,
    };
    expect(parseEvictedTotals(block)).toEqual(block);
  });

  it("accepts nulls where the type allows them", () => {
    const parsed = parseEvictedTotals({
      sessions: 1,
      netProfit: 0,
      totalWagered: 10,
      wagers: 1,
      wins: 0,
      losses: 0,
      pushes: 1,
      coups: 1,
      winningSessions: 0,
      worstDrawdown: 0,
      worstSession: null,
      bestSession: null,
    });
    expect(parsed.worstSession).toBeNull();
    expect(parsed.bestSession).toBeNull();
  });

  it("discards a block with a non-numeric field rather than half-trusting it", () => {
    // Spreading this over the defaults used to leave a string in `sessions`,
    // which lifetimeStats then concatenates instead of adding.
    const parsed = parseEvictedTotals({ ...EMPTY_EVICTED, sessions: "oops" });
    expect(parsed).toEqual(EMPTY_EVICTED);
    expect(parseEvictedTotals({ ...EMPTY_EVICTED, netProfit: null })).toEqual(EMPTY_EVICTED);
    expect(parseEvictedTotals({ ...EMPTY_EVICTED, worstSession: "x" })).toEqual(EMPTY_EVICTED);
    expect(parseEvictedTotals({ ...EMPTY_EVICTED, totalWagered: Number.NaN })).toEqual(EMPTY_EVICTED);
    expect(parseEvictedTotals(null)).toEqual(EMPTY_EVICTED);
    expect(parseEvictedTotals("nope")).toEqual(EMPTY_EVICTED);
    expect(parseEvictedTotals({})).toEqual(EMPTY_EVICTED);
  });

  it("keeps lifetime arithmetic numeric after a corrupt restore", () => {
    const restored = deserializeState(
      JSON.stringify({ ...createInitialState(), evicted: { sessions: "oops" } }),
    );
    const totals = lifetimeStats(restored.archive, undefined, restored.evicted);
    expect(typeof totals.sessions).toBe("number");
    expect(totals.sessions).toBe(0);
    expect(Number.isFinite(totals.netProfit)).toBe(true);
  });
});
