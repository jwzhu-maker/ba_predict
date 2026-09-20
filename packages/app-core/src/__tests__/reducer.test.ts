import { createShoe, cardsRemaining } from "@ba-predict/engine";
import { describe, expect, it } from "vitest";
import { createInitialState, reducer, type AppState } from "../reducer";
import { deserializeState, serializeState } from "../storage";

function play(state: AppState, ...actions: Parameters<typeof reducer>[1][]): AppState {
  return actions.reduce((current, action) => reducer(current, action), state);
}

describe("reducer", () => {
  it("settles a wager and advances the ladder", () => {
    const state = play(
      { ...createInitialState(), session: { ...createInitialState().session } },
      { type: "set-progression", progression: "martingale" },
      { type: "place-wager", wager: { bet: "banker", amount: 10 } },
      { type: "record-coup", coup: { outcome: "player" } },
    );
    expect(state.session.bankroll.bankroll).toBe(990);
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

  it("starts a fresh shoe without touching the bankroll", () => {
    const played = play(
      createInitialState(),
      { type: "place-wager", wager: { bet: "banker", amount: 10 } },
      { type: "record-coup", coup: { outcome: "banker" } },
    );
    const fresh = reducer(played, { type: "new-shoe" });
    expect(fresh.session.coups).toEqual([]);
    expect(cardsRemaining(fresh.session.shoe)).toBe(cardsRemaining(createShoe(8)));
    expect(fresh.session.bankroll.bankroll).toBe(played.session.bankroll.bankroll);
  });

  it("re-shoes when the deck count changes, because the tracked cards are void", () => {
    const state = play(
      createInitialState(),
      { type: "add-card", rank: "A" },
      { type: "record-coup", coup: { outcome: "banker" } },
      { type: "update-rules", rules: { decks: 6 } },
    );
    expect(state.session.rules.decks).toBe(6);
    expect(cardsRemaining(state.session.shoe)).toBe(312);
    expect(state.session.coups).toEqual([]);
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
    expect(deserializeState('{"session":{}}').session.bankroll.bankroll).toBe(1000);
  });
});
