import { lifetimeStats } from "../archive";
import type { PlacedWager } from "@ba-predict/engine";
import { createShoe, cardsRemaining } from "@ba-predict/engine";
import { describe, expect, it } from "vitest";
import { createInitialState, reducer, type AppState } from "../reducer";
import { deserializeState, serializeState } from "../storage";

function play(state: AppState, ...actions: Parameters<typeof reducer>[1][]): AppState {
  return actions.reduce((current, action) => reducer(current, action), state);
}

describe("reducer", () => {
  it("settles a wager and advances the ladder", () => {
    const opening = createInitialState().session.bankroll.bankroll;
    const state = play(
      { ...createInitialState(), session: { ...createInitialState().session } },
      { type: "set-progression", progression: "martingale" },
      { type: "place-wager", wager: { bet: "banker", amount: 10 } },
      { type: "record-coup", coup: { outcome: "player" } },
    );
    expect(state.session.bankroll.bankroll).toBe(opening - 10);
    expect(state.session.progression.units).toBe(2);
    expect(state.pendingWager).toBeNull();
  });

  it("undoes a coup, money and all", () => {
    const start = createInitialState();
    const after = play(
      start,
      { type: "place-wager", wager: { bet: "banker", amount: 10 } },
      { type: "record-coup", coup: { outcome: "player" } },
    );
    const undone = reducer(after, { type: "undo" });
    expect(undone.session.bankroll.bankroll).toBe(start.session.bankroll.bankroll);
    expect(undone.session.coups).toHaveLength(0);
  });

  it("puts a hand-placed wager and its cards back, so the coup can be re-recorded", () => {
    // Undo reverses the settlement and restores the shoe; the stake and the
    // cards that went with that coup belong with it.
    const after = play(
      createInitialState(),
      { type: "place-wager", wager: { bet: "banker", amount: 50 } },
      { type: "add-card", rank: "9" },
      { type: "record-coup", coup: { outcome: "banker", bankerWinOnSix: false } },
    );
    expect(after.pendingWager).toBeNull();
    expect(after.cardEntry).toEqual([]);

    const undone = reducer(after, { type: "undo" });
    expect(undone.pendingWager).toEqual({ bet: "banker", amount: 50 });
    expect(undone.cardEntry).toEqual(["9"]);
  });

  it("leaves nothing pending when nothing was pending before the coup", () => {
    const after = play(createInitialState(), {
      type: "record-coup",
      wager: { bet: "banker", amount: 50 },
      coup: { outcome: "banker", bankerWinOnSix: false },
    });
    const undone = reducer(after, { type: "undo" });
    expect(undone.pendingWager).toBeNull();
    expect(undone.cardEntry).toEqual([]);
  });

  it("hands back the cards and the wager a new shoe threw away", () => {
    // `new-shoe` clears both, so undoing it has to put them back — the
    // other half of the rule that leaves them alone for a typed run.
    const state = play(
      createInitialState(),
      { type: "place-wager", wager: { bet: "banker", amount: 50 } },
      { type: "add-card", rank: "7" },
      { type: "new-shoe", now: 1 },
    );
    expect(state.pendingWager).toBeNull();
    expect(state.cardEntry).toEqual([]);

    const undone = reducer(state, { type: "undo" });
    expect(undone.pendingWager).toEqual({ bet: "banker", amount: 50 });
    expect(undone.cardEntry).toEqual(["7"]);
  });

  it("does nothing when there is nothing to undo", () => {
    const start = createInitialState();
    expect(reducer(start, { type: "undo" })).toBe(start);
  });

  it("applies tracked cards to the shoe when the coup is recorded", () => {
    const state = play(
      createInitialState(),
      { type: "add-card", rank: "A" },
      { type: "add-card", rank: "K" },
      { type: "record-coup", coup: { outcome: "banker" } },
    );
    expect(cardsRemaining(state.session.shoe)).toBe(414);
    expect(state.cardEntry).toEqual([]);
  });

  it("will not accept more than a coup's worth of cards", () => {
    let state = createInitialState();
    for (let i = 0; i < 8; i += 1) state = reducer(state, { type: "add-card", rank: "5" });
    expect(state.cardEntry).toHaveLength(6);
  });

  it("starts a fresh shoe without touching the bankroll or the ledger", () => {
    const played = play(
      createInitialState(),
      { type: "place-wager", wager: { bet: "banker", amount: 10 } },
      { type: "record-coup", coup: { outcome: "banker" } },
    );
    const fresh = reducer(played, { type: "new-shoe" });
    expect(cardsRemaining(fresh.session.shoe)).toBe(cardsRemaining(createShoe(8)));
    expect(fresh.session.bankroll.bankroll).toBe(played.session.bankroll.bankroll);
    // The wager ledger is money, not cards, so it survives the shoe change;
    // only the road's starting point moves.
    expect(fresh.session.coups).toHaveLength(1);
    expect(fresh.session.shoeStartIndex).toBe(1);
  });

  it("re-shoes when the deck count changes, because the tracked cards are void", () => {
    const state = play(
      createInitialState(),
      { type: "add-card", rank: "A" },
      { type: "place-wager", wager: { bet: "banker", amount: 10 } },
      { type: "record-coup", coup: { outcome: "banker" } },
      { type: "update-rules", rules: { decks: 6 } },
    );
    expect(state.session.rules.decks).toBe(6);
    expect(cardsRemaining(state.session.shoe)).toBe(312);
    // The cards are void; the night's wagers are not.
    expect(state.session.coups).toHaveLength(1);
    expect(state.session.shoeStartIndex).toBe(1);
  });

  it("keeps the unit ceiling in step with the money settings", () => {
    const state = reducer(createInitialState(), {
      type: "update-bankroll",
      bankroll: { tableMax: 500, unitSize: 25 },
    });
    expect(state.session.progressionOptions.maxUnits).toBe(20);
  });

  it("re-seeds the ladder when the ceiling moves", () => {
    const state = play(
      createInitialState(),
      { type: "set-progression", progression: "martingale" },
      { type: "place-wager", wager: { bet: "banker", amount: 10 } },
      { type: "record-coup", coup: { outcome: "player" } },
      { type: "update-bankroll", bankroll: { tableMax: 200 } },
    );
    expect(state.session.progression.units).toBe(1);
  });

  it("keeps the rules and the plan across a session reset", () => {
    const state = play(
      createInitialState(),
      { type: "set-progression", progression: "fibonacci" },
      { type: "update-rules", rules: { tiePayout: 9 } },
      { type: "place-wager", wager: { bet: "banker", amount: 10 } },
      { type: "record-coup", coup: { outcome: "player" } },
      { type: "reset-session" },
    );
    expect(state.session.rules.tiePayout).toBe(9);
    expect(state.session.progression.id).toBe("fibonacci");
    expect(state.session.bankroll.bankroll).toBe(state.session.bankroll.startingBankroll);
    expect(state.session.coups).toEqual([]);
  });
});

describe("persistence", () => {
  it("round-trips a played session", () => {
    const played = play(
      createInitialState(),
      { type: "set-progression", progression: "paroli" },
      { type: "place-wager", wager: { bet: "banker", amount: 10 } },
      { type: "record-coup", coup: { outcome: "banker" } },
      { type: "set-screen", screen: "roads" },
    );
    const restored = deserializeState(serializeState(played));
    expect(restored.session.bankroll.bankroll).toBe(played.session.bankroll.bankroll);
    expect(restored.session.coups).toEqual(played.session.coups);
    expect(restored.session.progression).toEqual(played.session.progression);
    expect(restored.screen).toBe("roads");
  });

  it("drops transient state rather than restoring it", () => {
    const state = play(createInitialState(), {
      type: "place-wager",
      wager: { bet: "tie", amount: 10 },
    });
    const restored = deserializeState(serializeState(state));
    expect(restored.pendingWager).toBeNull();
    expect(restored.history).toEqual([]);
  });

  it("falls back to a fresh session on junk", () => {
    expect(deserializeState(null).session.coups).toEqual([]);
    expect(deserializeState("not json").session.coups).toEqual([]);
    expect(deserializeState("{}").session.coups).toEqual([]);
    expect(deserializeState('{"session":{}}').session.bankroll.bankroll).toBe(
      createInitialState().session.bankroll.bankroll,
    );
  });
});

describe("remembering the shoe that just ended", () => {
  it("records where the previous shoe began", () => {
    let state = play(
      createInitialState(),
      { type: "record-coup", coup: { outcome: "banker" } },
      { type: "record-coup", coup: { outcome: "player" } },
      { type: "new-shoe" },
      { type: "record-coup", coup: { outcome: "banker" } },
    );
    expect(state.session.shoeStartIndex).toBe(2);
    expect(state.session.previousShoeStartIndex).toBe(0);
    // The finished shoe is still recoverable for the replay.
    const finished = state.session.coups.slice(
      state.session.previousShoeStartIndex!,
      state.session.shoeStartIndex,
    );
    expect(finished).toHaveLength(2);
  });

  it("is null until a second shoe starts", () => {
    const state = play(createInitialState(), { type: "record-coup", coup: { outcome: "banker" } });
    expect(state.session.previousShoeStartIndex).toBeNull();
  });

  it("tracks it across a deck-count change too", () => {
    const state = play(
      createInitialState(),
      { type: "record-coup", coup: { outcome: "banker" } },
      { type: "update-rules", rules: { decks: 6 } },
    );
    expect(state.session.previousShoeStartIndex).toBe(0);
    expect(state.session.shoeStartIndex).toBe(1);
  });
});

describe("betting the suggestion by default", () => {
  /**
   * The stake is now opt-OUT: recording a result settles against whatever the
   * Bet card was showing. That moves real money on every coup, so the rules
   * about WHEN it does not are the ones worth pinning.
   */
  const record = (state: AppState, wager: PlacedWager | null) =>
    reducer(state, {
      type: "record-coup",
      wager,
      coup: { outcome: "banker", playerPair: false, bankerPair: false },
    });

  it("settles the wager the card was showing", () => {
    const before = createInitialState();
    const after = record(before, { bet: "banker", amount: 100 });
    expect(after.session.coups.at(-1)!.wager).toMatchObject({ bet: "banker", amount: 100 });
    expect(after.session.bankroll.bankroll).toBeGreaterThan(before.session.bankroll.bankroll);
  });

  it("settles nothing when the card was showing no bet", () => {
    const before = createInitialState();
    const after = record(before, null);
    expect(after.session.coups.at(-1)!.wager).toBeUndefined();
    expect(after.session.bankroll.bankroll).toBe(before.session.bankroll.bankroll);
  });

  it("prefers a hand-placed wager over the suggestion", () => {
    let state = createInitialState();
    state = reducer(state, { type: "place-wager", wager: { bet: "player", amount: 40 } });
    const after = record(state, { bet: "banker", amount: 100 });
    expect(after.session.coups.at(-1)!.wager).toMatchObject({ bet: "player", amount: 40 });
  });

  it("stakes nothing at all for an older caller that passes no wager", () => {
    // `wager` is optional, so a caller that never learned about it must not
    // silently start staking the suggestion.
    const before = createInitialState();
    const after = reducer(before, {
      type: "record-coup",
      coup: { outcome: "banker", playerPair: false, bankerPair: false },
    });
    expect(after.session.coups.at(-1)!.wager).toBeUndefined();
    expect(after.session.bankroll.bankroll).toBe(before.session.bankroll.bankroll);
  });

  it("clears the skip after the coup it was pressed for", () => {
    let state = createInitialState();
    state = reducer(state, { type: "skip-next-coup", skip: true });
    expect(state.skipNextCoup).toBe(true);
    state = record(state, null);
    expect(state.skipNextCoup).toBe(false);
  });

  it("skipping drops a wager already on the table", () => {
    let state = createInitialState();
    state = reducer(state, { type: "place-wager", wager: { bet: "player", amount: 40 } });
    state = reducer(state, { type: "skip-next-coup", skip: true });
    expect(state.pendingWager).toBeNull();
  });

  it("placing by hand cancels a skip, taking it back does not", () => {
    let state = createInitialState();
    state = reducer(state, { type: "skip-next-coup", skip: true });
    state = reducer(state, { type: "place-wager", wager: { bet: "tie", amount: 10 } });
    expect(state.skipNextCoup).toBe(false);

    state = reducer(state, { type: "skip-next-coup", skip: true });
    state = reducer(state, { type: "place-wager", wager: null });
    expect(state.skipNextCoup).toBe(true);
  });

  it("choosing a system clears a skip left over from the previous one", () => {
    let state = createInitialState();
    expect(state.activeSystem).toBeNull();
    state = reducer(state, { type: "skip-next-coup", skip: true });
    state = reducer(state, { type: "set-active-system", system: "reverse-12" });
    expect(state.activeSystem).toBe("reverse-12");
    expect(state.skipNextCoup).toBe(false);
    state = reducer(state, { type: "set-active-system", system: null });
    expect(state.activeSystem).toBeNull();
  });
});

describe("the skip and the system choice are per coup, not forever", () => {
  /**
   * `skipNextCoup` is documented as per-coup. Every transition that ends the
   * coup it was pressed on has to clear it, or a fresh shoe — or a brand-new
   * session — silently opens on "SITTING OUT".
   */
  const skipped = () => reducer(createInitialState(), { type: "skip-next-coup", skip: true });

  it("clears the skip on a new shoe", () => {
    expect(reducer(skipped(), { type: "new-shoe", now: 1 }).skipNextCoup).toBe(false);
  });

  it("clears the skip when a session ends or resets", () => {
    expect(reducer(skipped(), { type: "end-session", now: 1 }).skipNextCoup).toBe(false);
    expect(reducer(skipped(), { type: "reset-session" }).skipNextCoup).toBe(false);
  });

  it("drops a stale hand-placed wager when the system changes", () => {
    // Otherwise it outranks the system the user just chose, on the very next
    // coup, and they never see that system's first call.
    let state = createInitialState();
    state = reducer(state, { type: "place-wager", wager: { bet: "player", amount: 40 } });
    state = reducer(state, { type: "set-active-system", system: "reverse-12" });
    expect(state.pendingWager).toBeNull();
    expect(state.activeSystem).toBe("reverse-12");
  });

  it("carries observe mode across a relaunch but never the skip", () => {
    let state = reducer(createInitialState(), { type: "set-table-mode", mode: "observe" });
    state = reducer(state, { type: "skip-next-coup", skip: true });
    const restored = deserializeState(serializeState(state));
    expect(restored.tableMode).toBe("observe");
    expect(restored.skipNextCoup).toBe(false);
  });

  it("defaults to playing, and falls back to playing on a junk value", () => {
    expect(createInitialState().tableMode).toBe("play");
    expect(deserializeState('{"session":null}').tableMode).toBe("play");
    const state = { ...createInitialState(), tableMode: "nonsense" } as unknown as AppState;
    expect(deserializeState(serializeState(state)).tableMode).toBe("play");
  });
});

describe("deleting one archived session", () => {
  /** Close two sessions so there is an archive to delete from. */
  function withTwoSessions(): AppState {
    let state = createInitialState();
    let clock = 1_000_000;
    for (const bet of ["banker", "player"] as const) {
      state = reducer(state, { type: "place-wager", wager: { bet, amount: 20 } });
      state = reducer(state, {
        type: "record-coup",
        now: (clock += 1000),
        coup: { outcome: "banker", playerPair: false, bankerPair: false },
      });
      state = reducer(state, { type: "end-session", now: (clock += 1000) });
    }
    return state;
  }

  it("never files two sessions under the same id", () => {
    // The id is `${startedAt}-${endedAt}`, so two sittings closed in the
    // same millisecond used to collide — harmless as a React key, but now
    // a delete BY id would take both rows.
    let state = createInitialState();
    for (let i = 0; i < 3; i += 1) {
      state = reducer(state, { type: "place-wager", wager: { bet: "banker", amount: 20 } });
      state = reducer(state, {
        type: "record-coup",
        now: 5_000,
        coup: { outcome: "banker", playerPair: false, bankerPair: false },
      });
      state = reducer(state, { type: "end-session", now: 5_000 });
    }
    const ids = state.archive.map((row) => row.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);

    // ...and deleting one takes exactly one.
    const after = reducer(state, { type: "delete-session", id: ids[0]! });
    expect(after.archive).toHaveLength(2);
  });

  it("removes only the named row", () => {
    const state = withTwoSessions();
    expect(state.archive).toHaveLength(2);
    const target = state.archive[0]!.id;
    const after = reducer(state, { type: "delete-session", id: target });
    expect(after.archive).toHaveLength(1);
    expect(after.archive.map((row) => row.id)).not.toContain(target);
  });

  it("takes the row's numbers out of the lifetime totals exactly once", () => {
    // `lifetimeStats` sums the archive and ADDS `evicted`, so dropping the
    // row is the whole job — subtracting from `evicted` as well would
    // remove its figures twice and could drive the lifetime total negative.
    const state = withTwoSessions();
    const before = lifetimeStats(state.archive, undefined, state.evicted);
    const removed = state.archive[0]!;
    const after = reducer(state, { type: "delete-session", id: removed.id });
    const now = lifetimeStats(after.archive, undefined, after.evicted);

    expect(now.sessions).toBe(before.sessions - 1);
    expect(now.totalWagered).toBeCloseTo(before.totalWagered - removed.totalWagered, 8);
    expect(now.netProfit).toBeCloseTo(before.netProfit - removed.netProfit, 8);
    expect(now.wagers).toBe(before.wagers - removed.wagers);
    expect(after.evicted).toBe(state.evicted);
  });

  it("is a no-op for an id that is not there, and keeps the same object", () => {
    const state = withTwoSessions();
    expect(reducer(state, { type: "delete-session", id: "nope" })).toBe(state);
  });

  it("survives a round trip through storage", () => {
    const state = withTwoSessions();
    const after = reducer(state, { type: "delete-session", id: state.archive[0]!.id });
    expect(deserializeState(serializeState(after)).archive).toHaveLength(1);
  });
});

describe("the Why this fold", () => {
  it("is closed to begin with", () => {
    expect(createInitialState().adviceReasonsOpen).toBe(false);
  });

  it("opens and closes on the action", () => {
    let state = reducer(createInitialState(), { type: "set-advice-reasons-open", open: true });
    expect(state.adviceReasonsOpen).toBe(true);
    state = reducer(state, { type: "set-advice-reasons-open", open: false });
    expect(state.adviceReasonsOpen).toBe(false);
  });

  it("survives a round trip through storage", () => {
    // It lives in app state precisely BECAUSE a `useState` in the card did
    // not survive a tab switch. Persisting it is the same promise one step
    // further: the app should not re-fold an explanation you asked for.
    const open = reducer(createInitialState(), { type: "set-advice-reasons-open", open: true });
    expect(deserializeState(serializeState(open)).adviceReasonsOpen).toBe(true);

    const shut = reducer(open, { type: "set-advice-reasons-open", open: false });
    expect(deserializeState(serializeState(shut)).adviceReasonsOpen).toBe(false);
  });

  it("defaults to closed for state stored before it existed", () => {
    const before = JSON.parse(serializeState(createInitialState())) as Record<string, unknown>;
    delete before.adviceReasonsOpen;
    expect(deserializeState(JSON.stringify(before)).adviceReasonsOpen).toBe(false);
  });

  it("does not disturb anything else", () => {
    const state = reducer(createInitialState(), { type: "set-active-system", system: "reverse-12" });
    const after = reducer(state, { type: "set-advice-reasons-open", open: true });
    expect(after.activeSystem).toBe("reverse-12");
    expect(after.session).toBe(state.session);
  });
});

describe("undo leaves settings alone", () => {
  /**
   * The reported case, and the reason this matters at all: you hit your
   * stop-win, raise it in Settings to keep playing, mis-tap the next result
   * — and a whole-snapshot undo puts the old stop-win back, so the app
   * starts refusing to stake again with nothing on screen saying why.
   */
  it("keeps a stop-win raised after the coup being undone", () => {
    const state = play(
      createInitialState(),
      { type: "place-wager", wager: { bet: "banker", amount: 10 } },
      { type: "record-coup", coup: { outcome: "banker" } },
      { type: "update-bankroll", bankroll: { stopWin: 5000 } },
    );
    expect(state.session.bankroll.stopWin).toBe(5000);

    const undone = reducer(state, { type: "undo" });
    expect(undone.session.bankroll.stopWin).toBe(5000);
    // And the coup really was undone.
    expect(undone.session.coups).toHaveLength(0);
    expect(undone.session.bankroll.bankroll).toBe(
      createInitialState().session.bankroll.bankroll,
    );
  });

  it("keeps every other setting changed since the coup", () => {
    const before = createInitialState();
    const state = play(
      before,
      { type: "place-wager", wager: { bet: "banker", amount: 10 } },
      { type: "record-coup", coup: { outcome: "banker" } },
      { type: "update-bankroll", bankroll: { stopLoss: 4000, tableMax: 9000, unitSize: 50 } },
      { type: "update-rules", rules: { decks: 6 } },
      { type: "set-progression", progression: "martingale" },
      { type: "set-preferred-bet", bet: "player" },
      { type: "set-kelly-multiplier", multiplier: 0.5 },
    );

    const undone = reducer(state, { type: "undo" });
    expect(undone.session.bankroll.stopLoss).toBe(4000);
    expect(undone.session.bankroll.tableMax).toBe(9000);
    expect(undone.session.bankroll.unitSize).toBe(50);
    expect(undone.session.rules.decks).toBe(6);
    // The plan the player switched to survives; only its live position is
    // rolled back, and switching plans already reset that.
    expect(undone.session.progression.id).toBe("martingale");
    expect(undone.session.preferredBet).toBe("player");
    expect(undone.session.kellyMultiplier).toBe(0.5);
    expect(undone.session.coups).toHaveLength(0);
  });

  it("reverses the coup by delta, so a corrected balance survives", () => {
    // Banker at 10 on the default no-commission table, not won with 6, pays
    // 10 — so the balance goes opening -> opening + 10. The player then
    // corrects it to 9000 (they miscounted their chips), and undo must
    // leave 8990 rather than snapping back to the opening balance.
    const opening = createInitialState().session.bankroll.bankroll;
    const state = play(
      createInitialState(),
      { type: "place-wager", wager: { bet: "banker", amount: 10 } },
      { type: "record-coup", coup: { outcome: "banker", bankerWinOnSix: false } },
    );
    expect(state.session.bankroll.bankroll).toBeCloseTo(opening + 10, 8);

    const corrected = reducer(state, { type: "update-bankroll", bankroll: { bankroll: 9000 } });
    const undone = reducer(corrected, { type: "undo" });
    expect(undone.session.bankroll.bankroll).toBeCloseTo(8990, 8);
  });

  it("still restores the shoe, the ladder and the coup list", () => {
    const state = play(
      createInitialState(),
      { type: "set-progression", progression: "martingale" },
      { type: "add-card", rank: "5" },
      { type: "add-card", rank: "K" },
      { type: "place-wager", wager: { bet: "banker", amount: 10 } },
      { type: "record-coup", coup: { outcome: "player" } },
    );
    expect(state.session.progression.units).toBe(2);
    const dealt = cardsRemaining(createShoe(8)) - cardsRemaining(state.session.shoe);
    expect(dealt).toBe(2);

    const undone = reducer(state, { type: "undo" });
    expect(undone.session.progression.units).toBe(1);
    expect(undone.session.coups).toHaveLength(0);
    expect(cardsRemaining(undone.session.shoe)).toBe(cardsRemaining(createShoe(8)));
  });

  it("undoes a new shoe without moving any money", () => {
    // `new-shoe` is undoable too and removes no coups, so the delta must be
    // zero rather than "the last coup's profit".
    const state = play(
      createInitialState(),
      { type: "place-wager", wager: { bet: "banker", amount: 10 } },
      { type: "record-coup", coup: { outcome: "banker" } },
      { type: "new-shoe" },
      { type: "update-bankroll", bankroll: { stopWin: 777 } },
    );
    const balance = state.session.bankroll.bankroll;
    const undone = reducer(state, { type: "undo" });

    expect(undone.session.bankroll.bankroll).toBeCloseTo(balance, 8);
    expect(undone.session.bankroll.stopWin).toBe(777);
    expect(undone.session.shoeStartIndex).toBe(0);
    expect(undone.session.coups).toHaveLength(1);
  });
});

describe("redo", () => {
  const recorded = () =>
    play(
      createInitialState(),
      { type: "place-wager", wager: { bet: "banker", amount: 50 } },
      { type: "add-card", rank: "9" },
      { type: "record-coup", coup: { outcome: "player" } },
    );

  it("puts an undone coup back, money and all", () => {
    const after = recorded();
    const redone = play(after, { type: "undo" }, { type: "redo" });
    expect(redone.session.coups).toEqual(after.session.coups);
    expect(redone.session.shoe).toEqual(after.session.shoe);
    expect(redone.session.bankroll.bankroll).toBeCloseTo(after.session.bankroll.bankroll, 8);
    expect(redone.session.progression).toEqual(after.session.progression);
    // The wager and cards go back into the coup they were consumed by.
    expect(redone.pendingWager).toBeNull();
    expect(redone.cardEntry).toEqual([]);
    expect(redone.future).toHaveLength(0);
  });

  it("can be undone again", () => {
    const start = createInitialState();
    const state = play(recorded(), { type: "undo" }, { type: "redo" }, { type: "undo" });
    expect(state.session.coups).toHaveLength(0);
    expect(state.session.bankroll.bankroll).toBeCloseTo(start.session.bankroll.bankroll, 8);
    expect(state.pendingWager).toEqual({ bet: "banker", amount: 50 });
    expect(state.cardEntry).toEqual(["9"]);
  });

  it("walks several steps back and forward in order", () => {
    const after = play(
      createInitialState(),
      { type: "record-coup", coup: { outcome: "player" } },
      { type: "record-coup", coup: { outcome: "banker" } },
      { type: "record-coup", coup: { outcome: "tie" } },
    );
    const back = play(after, { type: "undo" }, { type: "undo" });
    expect(back.session.coups.map((c) => c.outcome)).toEqual(["player"]);
    const forward = play(back, { type: "redo" });
    expect(forward.session.coups.map((c) => c.outcome)).toEqual(["player", "banker"]);
    expect(play(forward, { type: "redo" }).session.coups).toEqual(after.session.coups);
  });

  it("does nothing when there is nothing to redo", () => {
    const start = recorded();
    expect(reducer(start, { type: "redo" })).toBe(start);
  });

  it("is cleared by a new coup", () => {
    const state = play(
      recorded(),
      { type: "undo" },
      { type: "record-coup", coup: { outcome: "banker" } },
    );
    expect(state.future).toHaveLength(0);
    expect(reducer(state, { type: "redo" })).toBe(state);
  });

  it("keeps a setting changed between the undo and the redo", () => {
    const state = play(
      recorded(),
      { type: "undo" },
      { type: "update-bankroll", bankroll: { stopWin: 5000 } },
      { type: "redo" },
    );
    expect(state.session.bankroll.stopWin).toBe(5000);
    expect(state.session.coups).toHaveLength(1);
  });

  it("leaves pending inputs alone when redoing a typed run", () => {
    const state = play(
      createInitialState(),
      { type: "record-coups", outcomes: ["player", "banker"] },
      { type: "undo" },
      { type: "place-wager", wager: { bet: "player", amount: 100 } },
      { type: "redo" },
    );
    expect(state.session.coups).toHaveLength(2);
    expect(state.pendingWager).toEqual({ bet: "player", amount: 100 });
  });

  it("is not persisted", () => {
    const state = play(recorded(), { type: "undo" });
    expect(deserializeState(serializeState(state)).future).toEqual([]);
  });
});
