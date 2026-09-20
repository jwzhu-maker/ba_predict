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
    expect(reachedStop(at(200))).toBe("stop-win");
    expect(reachedStop(at(-300))).toBe("stop-loss");
  });

  it("reports a limit overshot in one coup", () => {
    expect(reachedStop(at(5000))).toBe("stop-win");
    expect(reachedStop(at(-5000))).toBe("stop-loss");
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

  it("records the limit actually standing", () => {
    const answered = reducer(pastStopLoss(), { type: "acknowledge-stop" });
    expect(answered.acknowledgedStop).toBe("stop-loss");
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
    expect(later.acknowledgedStop).toBe("stop-loss");
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

  it("re-arms for the other limit, having only been answered for one", () => {
    const answered = reducer(pastStopLoss(), { type: "acknowledge-stop" });
    const winning = reducer(answered, {
      type: "update-bankroll",
      bankroll: { bankroll: answered.session.bankroll.startingBankroll + 100_000 },
    });
    expect(reachedStop(winning.session)).toBe("stop-win");
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
    expect(deserializeState(serializeState(answered)).acknowledgedStop).toBe("stop-loss");
    // A payload claiming a limit that does not hold corrects itself on the
    // first action, rather than suppressing a dialog it has no right to.
    const lying = deserializeState(
      serializeState({ ...createInitialState(), acknowledgedStop: "stop-win" }),
    );
    expect(reducer(lying, { type: "set-screen", screen: "settings" }).acknowledgedStop).toBeNull();
  });
});
