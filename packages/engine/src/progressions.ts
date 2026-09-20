import type { BetResult } from "./types";

/**
 * Staking systems ("progressions").
 *
 * Worth being blunt about what these are, because the whole category is sold
 * as something it is not: a progression changes the *shape* of a session's
 * outcome distribution, never its mean. Every system below has the same
 * expected value as flat betting at the same average stake — the house edge
 * multiplied by total action. What a steep progression buys is a high chance
 * of a small win paid for by a small chance of a catastrophic loss, and the
 * table maximum is what turns "small chance" into "certain eventually".
 *
 * They are implemented faithfully anyway, because a player who is going to use
 * one is better served by a correct ladder and an honest ruin number than by
 * arithmetic done in their head at the table.
 */

export type ProgressionId =
  | "flat"
  | "martingale"
  | "grand-martingale"
  | "paroli"
  | "dalembert"
  | "reverse-dalembert"
  | "fibonacci"
  | "1-3-2-6"
  | "labouchere"
  | "oscars-grind";

export type ProgressionRisk = "flat" | "moderate" | "steep" | "extreme";

export interface ProgressionOptions {
  /** The base bet, in units. Almost always 1. */
  baseUnits: number;
  /** Table ceiling in units. Null means no ceiling is modelled. */
  maxUnits: number | null;
  /** Starting line for Labouchere. */
  labouchereLine: readonly number[];
}

export const DEFAULT_PROGRESSION_OPTIONS: ProgressionOptions = {
  baseUnits: 1,
  maxUnits: null,
  labouchereLine: [1, 2, 3, 4],
};

/**
 * One serializable snapshot of a progression. Every system shares this shape so
 * the whole thing survives a round trip through localStorage.
 */
export interface ProgressionState {
  id: ProgressionId;
  /** Stake for the next coup, in units, after the table ceiling is applied. */
  units: number;
  /** What the system asked for before the ceiling. Differs from `units` exactly when the ramp has outrun the table. */
  requestedUnits: number;
  /** Position in a fixed ladder (Fibonacci, 1-3-2-6). */
  step: number;
  /** Consecutive wins as a positive number, consecutive losses as a negative one. */
  streak: number;
  /** Labouchere's working line. */
  line: number[];
  /** Oscar's Grind: units of profit banked in the current cycle. */
  cycleProfit: number;
}

/** How a settled coup affected the wager. */
export interface CoupSettlement {
  result: BetResult;
  /** Realised profit in units, commission included. Negative on a loss, zero on a push. */
  profitUnits: number;
}

export interface ProgressionDefinition {
  id: ProgressionId;
  name: string;
  summary: string;
  risk: ProgressionRisk;
  /** Next stake in units, before clamping. */
  nextUnits(state: ProgressionState, settlement: CoupSettlement, options: ProgressionOptions): number;
  /** Extra bookkeeping this system needs. */
  reduce?(
    state: ProgressionState,
    settlement: CoupSettlement,
    options: ProgressionOptions,
  ): Partial<ProgressionState>;
}

function fibonacci(step: number): number {
  let previous = 1;
  let current = 1;
  for (let i = 0; i < step; i += 1) {
    const next = previous + current;
    previous = current;
    current = next;
  }
  return previous;
}

const LADDER_1326 = [1, 3, 2, 6];

/** Wins that close a Paroli cycle and return the stake to one unit. */
const PAROLI_CYCLE = 3;

const DEFINITIONS: Record<ProgressionId, ProgressionDefinition> = {
  flat: {
    id: "flat",
    name: "Flat",
    summary: "Same stake every coup. The only system whose worst case is bounded by your patience.",
    risk: "flat",
    nextUnits: (_state, _settlement, options) => options.baseUnits,
  },

  martingale: {
    id: "martingale",
    name: "Martingale",
    summary: "Double after a loss, reset after a win. Wins often, loses everything rarely.",
    risk: "extreme",
    nextUnits: (state, settlement, options) => {
      if (settlement.result === "push") return state.requestedUnits;
      if (settlement.result === "loss") return state.requestedUnits * 2;
      return options.baseUnits;
    },
  },

  "grand-martingale": {
    id: "grand-martingale",
    name: "Grand Martingale",
    summary: "Double and add a unit after a loss. Martingale's failure mode, reached sooner.",
    risk: "extreme",
    nextUnits: (state, settlement, options) => {
      if (settlement.result === "push") return state.requestedUnits;
      if (settlement.result === "loss") return state.requestedUnits * 2 + options.baseUnits;
      return options.baseUnits;
    },
  },

  paroli: {
    id: "paroli",
    name: "Paroli",
    summary: "Double after a win, reset after three. Risks winnings rather than bankroll.",
    risk: "moderate",
    // `step` counts wins inside the current cycle, which is not the same as
    // the global streak: the cycle resets after three wins while the streak
    // keeps climbing, and reading the streak here left Paroli stuck at one
    // unit for the whole of a long winning run.
    nextUnits: (state, settlement, options) => {
      if (settlement.result === "push") return state.requestedUnits;
      if (settlement.result === "loss") return options.baseUnits;
      return state.step + 1 >= PAROLI_CYCLE ? options.baseUnits : state.requestedUnits * 2;
    },
    reduce: (state, settlement) => {
      if (settlement.result === "push") return {};
      if (settlement.result === "loss") return { step: 0 };
      const winsInCycle = state.step + 1;
      return { step: winsInCycle >= PAROLI_CYCLE ? 0 : winsInCycle };
    },
  },

  dalembert: {
    id: "dalembert",
    name: "D'Alembert",
    summary: "Up one unit after a loss, down one after a win. A gentler Martingale, same maths.",
    risk: "moderate",
    nextUnits: (state, settlement, options) => {
      if (settlement.result === "push") return state.requestedUnits;
      if (settlement.result === "loss") return state.requestedUnits + options.baseUnits;
      return Math.max(options.baseUnits, state.requestedUnits - options.baseUnits);
    },
  },

  "reverse-dalembert": {
    id: "reverse-dalembert",
    name: "Reverse D'Alembert",
    summary: "Up one unit after a win, down one after a loss. Presses streaks, bleeds on chop.",
    risk: "moderate",
    nextUnits: (state, settlement, options) => {
      if (settlement.result === "push") return state.requestedUnits;
      if (settlement.result === "win") return state.requestedUnits + options.baseUnits;
      return Math.max(options.baseUnits, state.requestedUnits - options.baseUnits);
    },
  },

  fibonacci: {
    id: "fibonacci",
    name: "Fibonacci",
    summary: "Up one rung after a loss, back two after a win. Slower ramp than Martingale.",
    risk: "steep",
    nextUnits: (state, settlement, options) => {
      if (settlement.result === "push") return state.requestedUnits;
      const step =
        settlement.result === "loss" ? state.step + 1 : Math.max(0, state.step - 2);
      return options.baseUnits * fibonacci(step);
    },
    reduce: (state, settlement) => {
      if (settlement.result === "push") return {};
      return {
        step: settlement.result === "loss" ? state.step + 1 : Math.max(0, state.step - 2),
      };
    },
  },

  "1-3-2-6": {
    id: "1-3-2-6",
    name: "1-3-2-6",
    summary: "A four-step win ladder. Any loss returns you to one unit.",
    risk: "moderate",
    nextUnits: (state, settlement, options) => {
      if (settlement.result === "push") return state.requestedUnits;
      const step = settlement.result === "win" ? (state.step + 1) % LADDER_1326.length : 0;
      return options.baseUnits * (LADDER_1326[step] ?? 1);
    },
    reduce: (state, settlement) => {
      if (settlement.result === "push") return {};
      return { step: settlement.result === "win" ? (state.step + 1) % LADDER_1326.length : 0 };
    },
  },

  labouchere: {
    id: "labouchere",
    name: "Labouchere",
    summary: "Cross off the ends of a line on a win, append the loss on a loss.",
    risk: "steep",
    nextUnits: (state, settlement, options) => {
      const line = nextLabouchereLine(state, settlement, options);
      return labouchereStake(line, options);
    },
    reduce: (state, settlement, options) => ({
      line: nextLabouchereLine(state, settlement, options),
    }),
  },

  "oscars-grind": {
    id: "oscars-grind",
    name: "Oscar's Grind",
    summary: "Grind to one unit of profit per cycle: raise only after a win, never overshoot.",
    risk: "moderate",
    nextUnits: (state, settlement, options) => {
      if (settlement.result === "push") return state.requestedUnits;
      const cycleProfit = state.cycleProfit + settlement.profitUnits;
      if (cycleProfit >= options.baseUnits) return options.baseUnits;
      if (settlement.result === "loss") return state.requestedUnits;
      const raised = state.requestedUnits + options.baseUnits;
      // Never stake more than is needed to close the cycle at +1 unit.
      const needed = options.baseUnits - cycleProfit;
      return Math.max(options.baseUnits, Math.min(raised, needed));
    },
    reduce: (state, settlement, options) => {
      if (settlement.result === "push") return {};
      const cycleProfit = state.cycleProfit + settlement.profitUnits;
      return { cycleProfit: cycleProfit >= options.baseUnits ? 0 : cycleProfit };
    },
  },
};

function labouchereStake(line: readonly number[], options: ProgressionOptions): number {
  if (line.length === 0) return options.baseUnits;
  if (line.length === 1) return line[0] ?? options.baseUnits;
  return (line[0] ?? 0) + (line[line.length - 1] ?? 0);
}

function nextLabouchereLine(
  state: ProgressionState,
  settlement: CoupSettlement,
  options: ProgressionOptions,
): number[] {
  if (settlement.result === "push") return state.line.slice();
  if (settlement.result === "loss") {
    return [...state.line, state.requestedUnits];
  }
  const line = state.line.slice();
  if (line.length <= 2) return [...options.labouchereLine];
  line.shift();
  line.pop();
  return line.length === 0 ? [...options.labouchereLine] : line;
}

export const PROGRESSIONS: readonly ProgressionDefinition[] = Object.values(DEFINITIONS);

export function getProgression(id: ProgressionId): ProgressionDefinition {
  const definition = DEFINITIONS[id];
  if (!definition) throw new Error(`unknown progression ${id}`);
  return definition;
}

function clamp(units: number, options: ProgressionOptions): number {
  const positive = Math.max(0, units);
  return options.maxUnits === null ? positive : Math.min(positive, options.maxUnits);
}

export function initProgression(
  id: ProgressionId,
  options: ProgressionOptions = DEFAULT_PROGRESSION_OPTIONS,
): ProgressionState {
  const line = [...options.labouchereLine];
  const requested =
    id === "labouchere" ? labouchereStake(line, options) : options.baseUnits;
  return {
    id,
    units: clamp(requested, options),
    requestedUnits: requested,
    step: 0,
    streak: 0,
    line,
    cycleProfit: 0,
  };
}

/**
 * Advance a progression past one settled coup.
 *
 * `requestedUnits` deliberately records the un-clamped stake: once a ramp has
 * outrun the table maximum, continuing to double a clamped number would quietly
 * pretend the system is still working. The advisor reads the gap between
 * `requestedUnits` and `units` and says so out loud.
 */
export function advanceProgression(
  state: ProgressionState,
  settlement: CoupSettlement,
  options: ProgressionOptions = DEFAULT_PROGRESSION_OPTIONS,
): ProgressionState {
  const definition = getProgression(state.id);
  const requested = definition.nextUnits(state, settlement, options);
  const extra = definition.reduce?.(state, settlement, options) ?? {};

  let streak = state.streak;
  if (settlement.result === "win") streak = streak >= 0 ? streak + 1 : 1;
  else if (settlement.result === "loss") streak = streak <= 0 ? streak - 1 : -1;

  return {
    ...state,
    ...extra,
    requestedUnits: requested,
    units: clamp(requested, options),
    streak,
  };
}

/** Reset a progression to its opening stake without changing which system is selected. */
export function resetProgression(
  state: ProgressionState,
  options: ProgressionOptions = DEFAULT_PROGRESSION_OPTIONS,
): ProgressionState {
  return initProgression(state.id, options);
}
