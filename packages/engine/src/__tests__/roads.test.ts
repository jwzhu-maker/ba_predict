import { describe, expect, it } from "vitest";
import {
  askRoads,
  buildRoads,
  layoutBigRoad,
  layoutDerivedRoad,
  summariseRoads,
} from "../roads";
import type { CoupRecord, Outcome } from "../types";

function coups(outcomes: readonly Outcome[]): CoupRecord[] {
  return outcomes.map((outcome) => ({ outcome, playerPair: false, bankerPair: false }));
}

const SEQUENCE: Outcome[] = ["banker", "banker", "player", "banker", "banker", "banker", "player", "player"];

describe("big road", () => {
  it("starts a new column whenever the winner changes", () => {
    const roads = buildRoads(coups(SEQUENCE));
    expect(roads.bigRoad.map((column) => column.length)).toEqual([2, 1, 3, 2]);
    expect(roads.bigRoad.map((column) => column[0]!.outcome)).toEqual([
      "banker",
      "player",
      "banker",
      "player",
    ]);
  });

  it("marks a tie on the current cell instead of opening a column", () => {
    const roads = buildRoads(coups(["banker", "tie", "player"]));
    expect(roads.bigRoad).toHaveLength(2);
    expect(roads.bigRoad[0]![0]!.ties).toBe(1);
    expect(roads.beadPlate).toEqual(["banker", "tie", "player"]);
  });

  it("holds a tie that arrives before any result to mark", () => {
    const roads = buildRoads(coups(["tie", "tie", "banker"]));
    expect(roads.leadingTies).toBe(2);
    expect(roads.bigRoad).toHaveLength(1);
    expect(roads.bigRoad[0]![0]!.ties).toBe(0);
  });

  it("handles an empty shoe", () => {
    const roads = buildRoads([]);
    expect(roads.bigRoad).toEqual([]);
    expect(roads.bigEyeBoy).toEqual([]);
  });
});

describe("derived roads", () => {
  /**
   * Worked by hand from the big road [B B][P][B B B][P P]:
   *
   * Big eye boy (one column back) cannot start until column 2. There it asks
   * whether columns 0 and 1 were the same height — 2 vs 1, so blue — then
   * whether column 1 had reached each new row, which it had not.
   */
  it("computes the big eye boy", () => {
    const roads = buildRoads(coups(SEQUENCE));
    expect(roads.bigEyeBoy).toEqual(["blue", "blue", "blue", "blue", "red"]);
  });

  it("computes the small road", () => {
    const roads = buildRoads(coups(SEQUENCE));
    expect(roads.smallRoad).toEqual(["red", "blue", "blue", "blue"]);
  });

  it("computes the cockroach pig", () => {
    const roads = buildRoads(coups(SEQUENCE));
    expect(roads.cockroachPig).toEqual(["red"]);
  });

  it("paints a perfect chop entirely red", () => {
    // Alternating results make every column one tall, so every comparison matches.
    const chop: Outcome[] = Array.from({ length: 12 }, (_, index) =>
      index % 2 === 0 ? "player" : "banker",
    );
    const roads = buildRoads(coups(chop));
    expect(roads.bigRoad.every((column) => column.length === 1)).toBe(true);
    expect(new Set(roads.bigEyeBoy)).toEqual(new Set(["red"]));
  });

  it("paints repeating equal streaks red", () => {
    const streaks: Outcome[] = [
      "player", "player", "player",
      "banker", "banker", "banker",
      "player", "player", "player",
      "banker", "banker", "banker",
    ];
    const roads = buildRoads(coups(streaks));
    expect(roads.bigRoad.map((column) => column.length)).toEqual([3, 3, 3, 3]);
    expect(new Set(roads.bigEyeBoy)).toEqual(new Set(["red"]));
  });

  it("ignores ties entirely", () => {
    const withTies: Outcome[] = [];
    for (const outcome of SEQUENCE) {
      withTies.push(outcome);
      withTies.push("tie");
    }
    const plain = buildRoads(coups(SEQUENCE));
    const tied = buildRoads(coups(withTies));
    expect(tied.bigEyeBoy).toEqual(plain.bigEyeBoy);
    expect(tied.smallRoad).toEqual(plain.smallRoad);
    expect(tied.cockroachPig).toEqual(plain.cockroachPig);
  });
});

describe("asking the road", () => {
  it("reports the mark each next result would produce without mutating the road", () => {
    const roads = buildRoads(coups(SEQUENCE));
    const before = JSON.stringify(roads.bigRoad);
    const ask = askRoads(roads);
    expect(JSON.stringify(roads.bigRoad)).toBe(before);
    // Continuing the Player column vs opening a Banker one give different marks.
    expect(ask.player.bigEyeBoy).toEqual(["red"]);
    expect(ask.banker.bigEyeBoy).toEqual(["blue"]);
  });
});

describe("summary", () => {
  it("counts outcomes and streaks", () => {
    const records = coups(SEQUENCE);
    records[0]!.playerPair = true;
    records[3]!.bankerPair = true;
    const summary = summariseRoads(records, buildRoads(records));
    expect(summary.total).toBe(8);
    expect(summary.bankerWins).toBe(5);
    expect(summary.playerWins).toBe(3);
    expect(summary.ties).toBe(0);
    expect(summary.playerPairs).toBe(1);
    expect(summary.bankerPairs).toBe(1);
    expect(summary.longestStreak).toEqual({ outcome: "banker", length: 3 });
    expect(summary.currentStreak).toEqual({ outcome: "player", length: 2 });
  });
});

describe("big road layout", () => {
  it("stacks a streak downwards", () => {
    const roads = buildRoads(coups(["banker", "banker", "banker"]));
    const layout = layoutBigRoad(roads.bigRoad);
    expect(layout.placements.map((p) => [p.row, p.column])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    expect(layout.columns).toBe(1);
  });

  it("turns a dragon along the bottom instead of running off the board", () => {
    const roads = buildRoads(coups(Array.from({ length: 9 }, () => "banker" as Outcome)));
    const layout = layoutBigRoad(roads.bigRoad);
    expect(layout.placements.map((p) => [p.row, p.column])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
      [5, 1],
      [5, 2],
      [5, 3],
    ]);
  });

  it("pushes a following streak clear of the tail", () => {
    const outcomes: Outcome[] = [
      ...Array.from({ length: 8 }, () => "banker" as Outcome),
      "player",
      "player",
    ];
    const layout = layoutBigRoad(buildRoads(coups(outcomes)).bigRoad);
    const players = layout.placements.filter((p) => p.cell.outcome === "player");
    // The banker tail occupies (5,1) and (5,2), so Player cannot start at
    // column 1's head only if that head is taken — it is not, so it starts there.
    expect(players.map((p) => [p.row, p.column])).toEqual([
      [0, 1],
      [1, 1],
    ]);
  });

  it("never places two cells on the same square", () => {
    const outcomes: Outcome[] = [];
    for (let i = 0; i < 40; i += 1) {
      outcomes.push(i % 7 < 5 ? "banker" : "player");
    }
    const layout = layoutBigRoad(buildRoads(coups(outcomes)).bigRoad);
    const squares = new Set(layout.placements.map((p) => `${p.row}:${p.column}`));
    expect(squares.size).toBe(layout.placements.length);
    expect(layout.placements.every((p) => p.row < 6)).toBe(true);
  });

  it("fills a derived road column-major", () => {
    const marks = layoutDerivedRoad(["red", "blue", "red", "blue", "red", "blue", "red"]);
    expect(marks[0]).toEqual({ mark: "red", row: 0, column: 0 });
    expect(marks[5]).toEqual({ mark: "blue", row: 5, column: 0 });
    expect(marks[6]).toEqual({ mark: "red", row: 0, column: 1 });
  });
});
