import { describe, expect, it } from "vitest";
import { describeOutcomes, parseOutcomeString } from "../coup-string";
import { createInitialState, reducer, type AppState } from "../reducer";

function play(state: AppState, ...actions: Parameters<typeof reducer>[1][]): AppState {
  return actions.reduce((current, action) => reducer(current, action), state);
}

describe("parseOutcomeString", () => {
  it("reads a run of results in order", () => {
    expect(parseOutcomeString("BPPBT")).toEqual({
      outcomes: ["banker", "player", "player", "banker", "tie"],
      invalid: [],
    });
  });

  it("does not care about case", () => {
    expect(parseOutcomeString("bPt").outcomes).toEqual(["banker", "player", "tie"]);
  });

  it("ignores the separators a road gets copied with", () => {
    expect(parseOutcomeString(" B P, P-B\nT | P ").outcomes).toEqual([
      "banker",
      "player",
      "player",
      "banker",
      "tie",
      "player",
    ]);
  });

  it("reports a stray character rather than dropping it", () => {
    // Silently skipping would record a shoe one coup shorter than the one
    // that was typed — a road that looks right and is not.
    const parsed = parseOutcomeString("BPXB");
    expect(parsed.outcomes).toEqual(["banker", "player", "banker"]);
    expect(parsed.invalid).toEqual(["X"]);
  });

  it("names each unknown character once, in the order met", () => {
    expect(parseOutcomeString("BxByxz").invalid).toEqual(["x", "y", "z"]);
  });

  it("reads nothing out of an empty box", () => {
    expect(parseOutcomeString("")).toEqual({ outcomes: [], invalid: [] });
    expect(parseOutcomeString("   ")).toEqual({ outcomes: [], invalid: [] });
  });

  it("counts what it read", () => {
    expect(describeOutcomes(parseOutcomeString("BPPBT").outcomes)).toBe(
      "2 Player · 2 Banker · 1 Tie",
    );
  });
});

describe("recording a run of results", () => {
  it("appends every result, in order", () => {
    const state = reducer(createInitialState(), {
      type: "record-coups",
      outcomes: parseOutcomeString("BPPBT").outcomes,
    });
    expect(state.session.coups.map((coup) => coup.outcome)).toEqual([
      "banker",
      "player",
      "player",
      "banker",
      "tie",
    ]);
  });

  it("moves no money and no ladder", () => {
    // These are hands that were dealt before the app was watching. Staking
    // the app's own suggestion on each of them retrospectively would invent
    // a ledger nobody played.
    const before = createInitialState();
    const after = reducer(before, {
      type: "record-coups",
      outcomes: parseOutcomeString("BBBBPPPP").outcomes,
    });
    expect(after.session.bankroll).toEqual(before.session.bankroll);
    expect(after.session.progression).toEqual(before.session.progression);
    expect(after.session.coups.every((coup) => coup.wager === undefined)).toBe(true);
  });

  it("leaves the shoe composition alone, having seen no cards", () => {
    const before = createInitialState();
    const after = reducer(before, { type: "record-coups", outcomes: ["banker", "player"] });
    expect(after.session.shoe).toEqual(before.session.shoe);
  });

  it("takes one Undo to take the whole run back", () => {
    const before = createInitialState();
    const after = reducer(before, {
      type: "record-coups",
      outcomes: parseOutcomeString("BPPBTBPB").outcomes,
    });
    expect(after.session.coups).toHaveLength(8);
    const undone = reducer(after, { type: "undo" });
    expect(undone.session.coups).toHaveLength(0);
  });

  it("leaves a wager already on the table standing", () => {
    // None of these settled it, so it is still the money on the felt for
    // the hand about to be dealt.
    const state = play(
      createInitialState(),
      { type: "place-wager", wager: { bet: "player", amount: 50 } },
      { type: "record-coups", outcomes: ["banker", "banker"] },
    );
    expect(state.pendingWager).toEqual({ bet: "player", amount: 50 });
  });

  it("keeps the wager and the tracked cards through the undo as well", () => {
    // The one-step undo advertised for a mistyped run must take back the
    // run and NOTHING else. Both of these belong to the hand about to be
    // dealt, which the run never touched, so a generic "clear the pending
    // inputs" undo would quietly throw away a stake on the felt and a
    // half-counted coup.
    const state = play(
      createInitialState(),
      { type: "place-wager", wager: { bet: "player", amount: 50 } },
      { type: "add-card", rank: "8" },
      { type: "add-card", rank: "K" },
      { type: "record-coups", outcomes: parseOutcomeString("BPPBT").outcomes },
    );
    const undone = reducer(state, { type: "undo" });
    expect(undone.session.coups).toHaveLength(0);
    expect(undone.pendingWager).toEqual({ bet: "player", amount: 50 });
    expect(undone.cardEntry).toEqual(["8", "K"]);
  });

  it("does nothing at all with nothing to record", () => {
    const before = createInitialState();
    expect(reducer(before, { type: "record-coups", outcomes: [] })).toBe(before);
  });

  it("lands in the current shoe's road, not the session's older one", () => {
    const state = play(
      createInitialState(),
      { type: "record-coups", outcomes: ["banker", "banker"] },
      { type: "new-shoe" },
      { type: "record-coups", outcomes: ["player"] },
    );
    expect(state.session.coups).toHaveLength(3);
    expect(state.session.coups.slice(state.session.shoeStartIndex)).toHaveLength(1);
  });
});
