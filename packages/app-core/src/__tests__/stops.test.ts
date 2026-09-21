import { createSession } from "@ba-predict/engine";
import { describe, expect, it } from "vitest";
import { reachedStop, stopProfit } from "../stops";
import { createInitialState, reducer, type AppState } from "../reducer";
import { deserializeState, serializeState } from "../storage";

function play(state: AppState, ...actions: Parameters<typeof reducer>[1][]): AppState {
  return actions.reduce((current, action) => reducer(current, action), state);
}

/** A session sitting at exactly the given profit, with the given limits. */
function at(profit: number, limits: { stopWin?: number | null; stopLoss?: number | null } = {}) {
  return createSession({
    bankroll: {
      startingBankroll: 1000,
      bankroll: 1000 + profit,
      stopWin: limits.stopWin === undefined ? 200 : limits.stopWin,
      stopLoss: limits.stopLoss === undefined ? 300 : limits.stopLoss,
    },
  });
}

describe("reachedStop", () => {
  it("says nothing while the session is between its limits", () => {
    expect(reachedStop(at(0))).toBeNull();
    expect(reachedStop(at(199))).toBeNull();
    expect(reachedStop(at(-299))).toBeNull();
  });

  it("counts a limit as reached the moment it is touched", () => {
    // `>=`, matching the advisor exactly. Two definitions of "at your
    // limit" that could disagree would be worse than no dialog at all.
    expect(reachedStop(at(200))).toEqual({ kind: "stop-win", limit: 200 });
    expect(reachedStop(at(-300))).toEqual({ kind: "stop-loss", limit: 300 });
  });

  it("reports a limit overshot in one coup, with the limit that was set", () => {
    expect(reachedStop(at(5000))).toEqual({ kind: "stop-win", limit: 200 });
    expect(reachedStop(at(-5000))).toEqual({ kind: "stop-loss", limit: 300 });
  });

  it("says nothing when the limit is switched off", () => {
    expect(reachedStop(at(5000, { stopWin: null }))).toBeNull();
    expect(reachedStop(at(-5000, { stopLoss: null }))).toBeNull();
  });

  it("reports how far past the limit the session is, as a positive amount", () => {
    expect(stopProfit(at(250), "stop-win")).toBe(250);
    expect(stopProfit(at(-350), "stop-loss")).toBe(350);
  });
});

describe("answering for a limit", () => {
  /** A fresh install, one coup past its stop-loss. */
  function pastStopLoss(): AppState {
    const state = createInitialState();
    return reducer(state, {
      type: "update-bankroll",
      bankroll: { bankroll: state.session.bankroll.startingBankroll - 1000 },
    });
  }

  it("starts with nothing answered for", () => {
    expect(createInitialState().acknowledgedStop).toBeNull();
    expect(pastStopLoss().acknowledgedStop).toBeNull();
  });

  it("records the limit actually standing, and the number it was set to", () => {
    const answered = reducer(pastStopLoss(), { type: "acknowledge-stop" });
    expect(answered.acknowledgedStop).toEqual({ kind: "stop-loss", limit: 1000 });
  });

  it("stays answered while the session is still at that limit", () => {
    // Playing on past a stop-loss must not re-raise the dialog on every
    // single coup; that is nagging, not a limit.
    const answered = reducer(pastStopLoss(), { type: "acknowledge-stop" });
    const later = play(
      answered,
      { type: "record-coup", coup: { outcome: "banker", bankerWinOnSix: false } },
      { type: "record-coup", coup: { outcome: "player" } },
    );
    expect(later.acknowledgedStop).toEqual({ kind: "stop-loss", limit: 1000 });
  });

  it("re-arms once the limit is raised past where the session stands", () => {
    const answered = reducer(pastStopLoss(), { type: "acknowledge-stop" });
    const raised = reducer(answered, {
      type: "update-bankroll",
      bankroll: { stopLoss: 100_000 },
    });
    expect(reachedStop(raised.session)).toBeNull();
    expect(raised.acknowledgedStop).toBeNull();
  });

  it("re-arms when the balance is corrected back inside the limits", () => {
    const answered = reducer(pastStopLoss(), { type: "acknowledge-stop" });
    const corrected = reducer(answered, {
      type: "update-bankroll",
      bankroll: { bankroll: answered.session.bankroll.startingBankroll },
    });
    expect(corrected.acknowledgedStop).toBeNull();
  });

  it("re-arms when the limit is MOVED to a number the session is still past", () => {
    // The reported case: answered for a stop-loss of 1000 while 2000 down,
    // then the limit is changed to 1500. Same kind, still reached — but the
    // number now standing is one nobody has been asked about.
    const deep = reducer(createInitialState(), {
      type: "update-bankroll",
      // Down 2000, so the session stays past the limit on BOTH numbers —
      // which is the whole point: only the number changes.
      bankroll: { bankroll: createInitialState().session.bankroll.startingBankroll - 2000 },
    });
    const answered = reducer(deep, { type: "acknowledge-stop" });
    expect(answered.acknowledgedStop).toEqual({ kind: "stop-loss", limit: 1000 });

    const moved = reducer(answered, { type: "update-bankroll", bankroll: { stopLoss: 1500 } });
    expect(reachedStop(moved.session)).toEqual({ kind: "stop-loss", limit: 1500 });
    expect(moved.acknowledgedStop).toBeNull();

    // And answering the new one sticks, rather than re-asking every action.
    const reanswered = reducer(moved, { type: "acknowledge-stop" });
    expect(reanswered.acknowledgedStop).toEqual({ kind: "stop-loss", limit: 1500 });
    expect(
      reducer(reanswered, { type: "set-screen", screen: "table" }).acknowledgedStop,
    ).toEqual({ kind: "stop-loss", limit: 1500 });
  });

  it("does not re-ask when the limit setting is rewritten to the same number", () => {
    const answered = reducer(pastStopLoss(), { type: "acknowledge-stop" });
    const rewritten = reducer(answered, {
      type: "update-bankroll",
      bankroll: { stopLoss: answered.session.bankroll.stopLoss },
    });
    expect(rewritten.acknowledgedStop).toEqual({ kind: "stop-loss", limit: 1000 });
  });

  it("re-arms for the other limit, having only been answered for one", () => {
    const answered = reducer(pastStopLoss(), { type: "acknowledge-stop" });
    const winning = reducer(answered, {
      type: "update-bankroll",
      bankroll: { bankroll: answered.session.bankroll.startingBankroll + 100_000 },
    });
    expect(reachedStop(winning.session)).toEqual({ kind: "stop-win", limit: 3300 });
    expect(winning.acknowledgedStop).toBeNull();
  });

  it("re-arms for the next session once this one is closed", () => {
    const answered = reducer(pastStopLoss(), { type: "acknowledge-stop" });
    const closed = reducer(answered, { type: "end-session", now: 1 });
    expect(closed.acknowledgedStop).toBeNull();
  });

  it("does nothing when no limit is standing", () => {
    const state = createInitialState();
    expect(reducer(state, { type: "acknowledge-stop" })).toBe(state);
  });

  it("survives a relaunch, and is re-checked against the restored session", () => {
    const answered = reducer(pastStopLoss(), { type: "acknowledge-stop" });
    expect(deserializeState(serializeState(answered)).acknowledgedStop).toEqual({
      kind: "stop-loss",
      limit: 1000,
    });
    // A payload claiming a limit that does not hold corrects itself on the
    // first action, rather than suppressing a dialog it has no right to.
    const lying = deserializeState(
      serializeState({
        ...createInitialState(),
        acknowledgedStop: { kind: "stop-win", limit: 3300 },
      }),
    );
    expect(reducer(lying, { type: "set-screen", screen: "settings" }).acknowledgedStop).toBeNull();
  });
});
