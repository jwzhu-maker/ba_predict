import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROGRESSION_OPTIONS,
  advanceProgression,
  getProgression,
  initProgression,
  PROGRESSIONS,
  resetProgression,
  type ProgressionId,
  type ProgressionOptions,
  type ProgressionState,
} from "../progressions";

const OPTIONS: ProgressionOptions = { ...DEFAULT_PROGRESSION_OPTIONS };

const win = { result: "win" as const, profitUnits: 1 };
const loss = { result: "loss" as const, profitUnits: -1 };
const push = { result: "push" as const, profitUnits: 0 };

/** Play a scripted sequence and collect the stake offered before each coup. */
function ladder(
  id: ProgressionId,
  script: readonly ("win" | "loss" | "push")[],
  options: ProgressionOptions = OPTIONS,
): number[] {
  let state = initProgression(id, options);
  const stakes = [state.units];
  for (const step of script) {
    const settlement =
      step === "win" ? { ...win, profitUnits: state.units } :
      step === "loss" ? { ...loss, profitUnits: -state.units } : push;
    state = advanceProgression(state, settlement, options);
    stakes.push(state.units);
  }
  return stakes;
}

describe("progressions", () => {
  it("keeps a flat stake flat", () => {
    expect(ladder("flat", ["loss", "loss", "win", "win"])).toEqual([1, 1, 1, 1, 1]);
  });

  it("doubles a Martingale after each loss and resets on a win", () => {
    expect(ladder("martingale", ["loss", "loss", "loss", "win"])).toEqual([1, 2, 4, 8, 1]);
  });

  it("adds a unit on top for a Grand Martingale", () => {
    expect(ladder("grand-martingale", ["loss", "loss", "win"])).toEqual([1, 3, 7, 1]);
  });

  it("presses a Paroli for three wins then resets", () => {
    expect(ladder("paroli", ["win", "win", "win", "win"])).toEqual([1, 2, 4, 1, 2]);
  });

  it("steps a D'Alembert one unit at a time and floors at the base", () => {
    expect(ladder("dalembert", ["loss", "loss", "win", "win", "win"])).toEqual([1, 2, 3, 2, 1, 1]);
  });

  it("runs a Reverse D'Alembert the other way", () => {
    expect(ladder("reverse-dalembert", ["win", "win", "loss"])).toEqual([1, 2, 3, 2]);
  });

  it("walks the Fibonacci ladder up one and back two", () => {
    expect(ladder("fibonacci", ["loss", "loss", "loss", "loss", "win"])).toEqual([1, 1, 2, 3, 5, 2]);
  });

  it("cycles 1-3-2-6 on wins and resets on any loss", () => {
    expect(ladder("1-3-2-6", ["win", "win", "win", "win"])).toEqual([1, 3, 2, 6, 1]);
    expect(ladder("1-3-2-6", ["win", "win", "loss"])).toEqual([1, 3, 2, 1]);
  });

  it("crosses off the ends of a Labouchere line on a win", () => {
    // [1,2,3,4] stakes 1+4=5; a win leaves [2,3] and stakes 5 again.
    expect(ladder("labouchere", ["win"])).toEqual([5, 5]);
    // A loss appends the stake: [1,2,3,4,5] stakes 1+5=6.
    expect(ladder("labouchere", ["loss"])).toEqual([5, 6]);
  });

  it("grinds Oscar's to a one-unit profit without overshooting", () => {
    // Loss holds the stake; a win only raises while the cycle is still down,
    // and never by more than the cycle still needs.
    expect(ladder("oscars-grind", ["loss", "loss", "win", "win"])).toEqual([1, 1, 1, 2, 1]);
  });

  it("leaves every system untouched by a push", () => {
    for (const definition of PROGRESSIONS) {
      const state = initProgression(definition.id, OPTIONS);
      const after = advanceProgression(state, push, OPTIONS);
      expect(after.units).toBe(state.units);
      expect(after.requestedUnits).toBe(state.requestedUnits);
    }
  });

  it("clamps to the table maximum but remembers what was asked for", () => {
    const options: ProgressionOptions = { ...OPTIONS, maxUnits: 4 };
    let state: ProgressionState = initProgression("martingale", options);
    for (let i = 0; i < 4; i += 1) {
      state = advanceProgression(state, { ...loss, profitUnits: -state.units }, options);
    }
    expect(state.units).toBe(4);
    expect(state.requestedUnits).toBe(16);
    // The gap is the whole failure mode: the ladder can no longer recover.
    expect(state.requestedUnits).toBeGreaterThan(state.units);
  });

  it("tracks win and loss streaks", () => {
    let state = initProgression("flat", OPTIONS);
    state = advanceProgression(state, win, OPTIONS);
    state = advanceProgression(state, win, OPTIONS);
    expect(state.streak).toBe(2);
    state = advanceProgression(state, loss, OPTIONS);
    expect(state.streak).toBe(-1);
  });

  it("resets cleanly", () => {
    let state = initProgression("martingale", OPTIONS);
    state = advanceProgression(state, loss, OPTIONS);
    state = advanceProgression(state, loss, OPTIONS);
    expect(resetProgression(state, OPTIONS)).toEqual(initProgression("martingale", OPTIONS));
  });

  it("survives a round trip through JSON", () => {
    for (const definition of PROGRESSIONS) {
      const state = initProgression(definition.id, OPTIONS);
      expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    }
  });

  it("exposes every declared system", () => {
    for (const definition of PROGRESSIONS) {
      expect(getProgression(definition.id).id).toBe(definition.id);
    }
    expect(PROGRESSIONS).toHaveLength(10);
  });
});
