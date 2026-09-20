import type { CoupRecord, Outcome } from "./types";

/**
 * The baccarat scoreboard: bead plate, big road, and the three derived roads.
 *
 * These are reproduced faithfully because they are what is on the screen above
 * every live table and a tool that omits them is useless at one. They are
 * bookkeeping, though, not signal: each coup is drawn from a shoe whose
 * composition barely moves, so no arrangement of past results shifts the next
 * one. The app renders the roads and reports, separately, the actual
 * probabilities from `odds.ts`. Where the two disagree, the roads are wrong.
 */

export interface BigRoadCell {
  outcome: Exclude<Outcome, "tie">;
  /** Ties settled on top of this cell, drawn as a slash in every casino display. */
  ties: number;
}

export type BigRoadColumn = BigRoadCell[];

/** Red means "the pattern repeated", blue means "it broke". */
export type DerivedMark = "red" | "blue";

export interface DerivedRoads {
  bigEyeBoy: DerivedMark[];
  smallRoad: DerivedMark[];
  cockroachPig: DerivedMark[];
}

export interface RoadSet extends DerivedRoads {
  /** Every coup in order, including ties, for the bead plate. */
  beadPlate: Outcome[];
  bigRoad: BigRoadColumn[];
  /** Ties that landed before any Player/Banker result existed to mark. */
  leadingTies: number;
}

/** Column offsets that define each derived road. */
const OFFSETS = { bigEyeBoy: 1, smallRoad: 2, cockroachPig: 3 } as const;

interface Placement {
  column: number;
  row: number;
}

function appendOutcome(
  columns: BigRoadColumn[],
  outcome: Exclude<Outcome, "tie">,
): Placement {
  const lastColumn = columns[columns.length - 1];
  const lastCell = lastColumn?.[lastColumn.length - 1];
  if (!lastColumn || !lastCell || lastCell.outcome !== outcome) {
    columns.push([{ outcome, ties: 0 }]);
    return { column: columns.length - 1, row: 0 };
  }
  lastColumn.push({ outcome, ties: 0 });
  return { column: columns.length - 1, row: lastColumn.length - 1 };
}

/**
 * The mark a derived road takes when a big-road entry lands at `placement`.
 *
 * Two cases, and they are different questions. A new column asks whether the
 * two columns `offset` back were the same height — did the shoe repeat its last
 * turn? A continuing column asks whether the column `offset` back had already
 * reached this row — is the current streak keeping up with its reference?
 *
 * Null when the road cannot be evaluated yet, which is why derived roads start
 * several columns into a shoe.
 */
function derivedMark(
  columns: readonly BigRoadColumn[],
  placement: Placement,
  offset: number,
): DerivedMark | null {
  const { column, row } = placement;
  if (row === 0) {
    const left = columns[column - offset - 1];
    const right = columns[column - offset];
    if (!left || !right) return null;
    return left.length === right.length ? "red" : "blue";
  }
  const reference = columns[column - offset];
  if (!reference) return null;
  return reference.length >= row + 1 ? "red" : "blue";
}

/** Build every road from an ordered list of coups. */
export function buildRoads(coups: readonly CoupRecord[]): RoadSet {
  const beadPlate: Outcome[] = [];
  const columns: BigRoadColumn[] = [];
  const bigEyeBoy: DerivedMark[] = [];
  const smallRoad: DerivedMark[] = [];
  const cockroachPig: DerivedMark[] = [];
  let leadingTies = 0;

  for (const coup of coups) {
    beadPlate.push(coup.outcome);

    if (coup.outcome === "tie") {
      const lastColumn = columns[columns.length - 1];
      const lastCell = lastColumn?.[lastColumn.length - 1];
      if (lastCell) lastCell.ties += 1;
      else leadingTies += 1;
      continue;
    }

    const placement = appendOutcome(columns, coup.outcome);
    const eye = derivedMark(columns, placement, OFFSETS.bigEyeBoy);
    if (eye) bigEyeBoy.push(eye);
    const small = derivedMark(columns, placement, OFFSETS.smallRoad);
    if (small) smallRoad.push(small);
    const cockroach = derivedMark(columns, placement, OFFSETS.cockroachPig);
    if (cockroach) cockroachPig.push(cockroach);
  }

  return { beadPlate, bigRoad: columns, bigEyeBoy, smallRoad, cockroachPig, leadingTies };
}

function cloneColumns(columns: readonly BigRoadColumn[]): BigRoadColumn[] {
  return columns.map((column) => column.map((cell) => ({ ...cell })));
}

/**
 * "Asking the road": which mark each derived road would take if the next coup
 * were Player, and if it were Banker.
 *
 * Every scoreboard at a live table offers this, so the app does too. It
 * describes the pattern the next result would create — it says nothing
 * whatsoever about which result is coming.
 */
export function askRoads(roads: RoadSet): Record<"player" | "banker", DerivedRoads> {
  const ask = (outcome: Exclude<Outcome, "tie">): DerivedRoads => {
    const columns = cloneColumns(roads.bigRoad);
    const placement = appendOutcome(columns, outcome);
    const mark = (offset: number): DerivedMark[] => {
      const value = derivedMark(columns, placement, offset);
      return value ? [value] : [];
    };
    return {
      bigEyeBoy: mark(OFFSETS.bigEyeBoy),
      smallRoad: mark(OFFSETS.smallRoad),
      cockroachPig: mark(OFFSETS.cockroachPig),
    };
  };
  return { player: ask("player"), banker: ask("banker") };
}

export interface RoadSummary {
  total: number;
  playerWins: number;
  bankerWins: number;
  ties: number;
  playerPairs: number;
  bankerPairs: number;
  /** Current run of the same outcome, ties excluded. */
  currentStreak: { outcome: Exclude<Outcome, "tie"> | null; length: number };
  longestStreak: { outcome: Exclude<Outcome, "tie"> | null; length: number };
}

export function summariseRoads(coups: readonly CoupRecord[], roads: RoadSet): RoadSummary {
  let playerWins = 0;
  let bankerWins = 0;
  let ties = 0;
  let playerPairs = 0;
  let bankerPairs = 0;
  for (const coup of coups) {
    if (coup.outcome === "player") playerWins += 1;
    else if (coup.outcome === "banker") bankerWins += 1;
    else ties += 1;
    if (coup.playerPair) playerPairs += 1;
    if (coup.bankerPair) bankerPairs += 1;
  }

  let longest: RoadSummary["longestStreak"] = { outcome: null, length: 0 };
  for (const column of roads.bigRoad) {
    const first = column[0];
    if (first && column.length > longest.length) {
      longest = { outcome: first.outcome, length: column.length };
    }
  }

  const lastColumn = roads.bigRoad[roads.bigRoad.length - 1];
  const lastCell = lastColumn?.[0];
  const currentStreak = lastColumn && lastCell
    ? { outcome: lastCell.outcome, length: lastColumn.length }
    : { outcome: null, length: 0 };

  return {
    total: coups.length,
    playerWins,
    bankerWins,
    ties,
    playerPairs,
    bankerPairs,
    currentStreak,
    longestStreak: longest,
  };
}

export interface BigRoadPlacement {
  cell: BigRoadCell;
  row: number;
  column: number;
  /** Index of the logical streak this cell belongs to. */
  streak: number;
}

export interface BigRoadLayout {
  placements: BigRoadPlacement[];
  rows: number;
  columns: number;
}

/**
 * Lay the big road out on a fixed-height grid, including the "dragon tail".
 *
 * A streak longer than the board is tall does not keep going down — it turns
 * right and runs along the bottom, which is why a long run looks like an L on
 * a casino display. Reproducing that matters more than it sounds: a user
 * matching this screen against the board above the table needs the shapes to
 * agree, and a naive column-per-streak grid diverges the moment a dragon
 * appears.
 *
 * Lives here rather than in either client so the two cannot drift, and so the
 * turn logic is testable without a renderer.
 */
export function layoutBigRoad(
  columns: readonly BigRoadColumn[],
  maxRows = 6,
): BigRoadLayout {
  const placements: BigRoadPlacement[] = [];
  const occupied = new Set<string>();
  const key = (row: number, column: number) => `${row}:${column}`;
  let widest = 0;
  let startColumn = 0;

  columns.forEach((streak, streakIndex) => {
    // A previous streak's tail may already have taken this column's head.
    while (occupied.has(key(0, startColumn))) startColumn += 1;

    let row = 0;
    let column = startColumn;

    streak.forEach((cell, index) => {
      if (index > 0) {
        const canDescend = row + 1 < maxRows && !occupied.has(key(row + 1, column));
        if (canDescend) row += 1;
        else column += 1;
      }
      occupied.add(key(row, column));
      placements.push({ cell, row, column, streak: streakIndex });
      if (column + 1 > widest) widest = column + 1;
    });

    startColumn += 1;
  });

  return { placements, rows: maxRows, columns: widest };
}

/** Lay a derived road's marks out in the same fixed-height, column-major grid. */
export function layoutDerivedRoad(
  marks: readonly DerivedMark[],
  maxRows = 6,
): { mark: DerivedMark; row: number; column: number }[] {
  return marks.map((mark, index) => ({
    mark,
    row: index % maxRows,
    column: Math.floor(index / maxRows),
  }));
}
