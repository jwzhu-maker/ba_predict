import type { CoupRecord, Outcome } from "@ba-predict/engine";
import { describe, expect, it } from "vitest";
import {
  SHOE_ARCHIVE_LIMIT,
  archiveShoe,
  decodeCoups,
  encodeCoups,
  isArchivedShoe,
} from "../shoe-archive";
import { createInitialState, reducer, type AppState } from "../reducer";
import { deserializeState, serializeState } from "../storage";

function play(state: AppState, ...actions: Parameters<typeof reducer>[1][]): AppState {
  return actions.reduce((current, action) => reducer(current, action), state);
}

function coup(outcome: Outcome, playerPair = false, bankerPair = false): CoupRecord {
  return { outcome, playerPair, bankerPair };
}

describe("coup encoding", () => {
  it("round-trips every combination of outcome and pairs", () => {
    const all: CoupRecord[] = [];
    for (const outcome of ["player", "banker", "tie"] as const) {
      for (const playerPair of [false, true]) {
        for (const bankerPair of [false, true]) {
          all.push(coup(outcome, playerPair, bankerPair));
        }
      }
    }
    expect(decodeCoups(encodeCoups(all))).toEqual(all);
    // Twelve distinct symbols, one per combination.
    expect(new Set(encodeCoups(all)).size).toBe(12);
  });

  it("uses one character per coup", () => {
    const shoe = Array.from({ length: 80 }, () => coup("banker"));
    expect(encodeCoups(shoe)).toHaveLength(80);
  });

  it("is far smaller than the object form", () => {
    const shoe = Array.from({ length: 80 }, (_, i) =>
      coup(i % 3 === 0 ? "player" : "banker", i % 7 === 0),
    );
    const encoded = JSON.stringify(archiveShoe({ coups: shoe, decks: 8, startedAt: 1, endedAt: 2 }));
    const raw = JSON.stringify(shoe);
    expect(encoded.length).toBeLessThan(raw.length / 10);
  });

  it("handles an empty shoe", () => {
    expect(encodeCoups([])).toBe("");
    expect(decodeCoups("")).toEqual([]);
  });

  it("skips characters it does not recognise rather than throwing", () => {
    // A payload corrupted or written by a future version.
    expect(decodeCoups("B?P")).toEqual([coup("banker"), coup("player")]);
    expect(decodeCoups("!!!")).toEqual([]);
  });
});

describe("archiveShoe", () => {
  it("summarises a played shoe", () => {
    const shoe = archiveShoe({
      coups: [coup("banker"), coup("player", true)],
      decks: 8,
      startedAt: 100,
      endedAt: 200,
    })!;
    expect(shoe.startedAt).toBe(100);
    expect(shoe.endedAt).toBe(200);
    expect(shoe.decks).toBe(8);
    expect(decodeCoups(shoe.coups)).toHaveLength(2);
    expect(decodeCoups(shoe.coups)[1]!.playerPair).toBe(true);
  });

  it("refuses to archive a shoe with no coups", () => {
    expect(archiveShoe({ coups: [], decks: 8, startedAt: 1, endedAt: 2 })).toBeNull();
  });
});

describe("isArchivedShoe", () => {
  it("accepts a well-formed shoe", () => {
    const shoe = archiveShoe({ coups: [coup("banker")], decks: 8, startedAt: 1, endedAt: 2 })!;
    expect(isArchivedShoe(shoe)).toBe(true);
  });

  it("rejects what corruption actually produces", () => {
    expect(isArchivedShoe(null)).toBe(false);
    expect(isArchivedShoe("shoe")).toBe(false);
    expect(isArchivedShoe({})).toBe(false);
    expect(isArchivedShoe({ id: "x", coups: "BB", startedAt: 1, endedAt: 2 })).toBe(false);
    expect(isArchivedShoe({ id: 1, coups: "BB", startedAt: 1, endedAt: 2, decks: 8 })).toBe(false);
    expect(isArchivedShoe({ id: "x", coups: 5, startedAt: 1, endedAt: 2, decks: 8 })).toBe(false);
  });
});

describe("filing shoes as they finish", () => {
  it("archives the shoe when a new one starts", () => {
    let state = play(
      createInitialState(),
      { type: "place-wager", wager: { bet: "banker", amount: 10 } },
      { type: "record-coup", coup: { outcome: "banker" }, now: 100 },
      { type: "record-coup", coup: { outcome: "player" }, now: 100 },
      { type: "new-shoe", now: 500 },
    );
    expect(state.shoeArchive).toHaveLength(1);
    const filed = state.shoeArchive[0]!;
    expect(filed.endedAt).toBe(500);
    expect(filed.decks).toBe(8);
    expect(decodeCoups(filed.coups)).toHaveLength(2);
  });

  it("files nothing for a shoe with no coups", () => {
    const state = reducer(createInitialState(), { type: "new-shoe", now: 1 });
    expect(state.shoeArchive).toEqual([]);
  });

  it("files a shoe when the deck count changes too", () => {
    const state = play(
      createInitialState(),
      { type: "record-coup", coup: { outcome: "banker" } },
      { type: "update-rules", rules: { decks: 6 } },
    );
    expect(state.shoeArchive).toHaveLength(1);
    expect(state.shoeArchive[0]!.decks).toBe(8);
  });

  it("accumulates across many shoes", () => {
    let state = createInitialState();
    for (let i = 0; i < 5; i += 1) {
      state = play(
        state,
        { type: "record-coup", coup: { outcome: "banker" } },
        { type: "record-coup", coup: { outcome: "player" } },
        { type: "new-shoe", now: i + 1 },
      );
    }
    expect(state.shoeArchive).toHaveLength(5);
    expect(state.shoeArchive.reduce((n, s) => n + decodeCoups(s.coups).length, 0)).toBe(10);
  });

  it("caps the archive oldest-first", () => {
    let state = createInitialState();
    for (let i = 0; i < SHOE_ARCHIVE_LIMIT + 3; i += 1) {
      state = play(
        state,
        { type: "record-coup", coup: { outcome: "banker" } },
        { type: "new-shoe", now: i + 1 },
      );
    }
    expect(state.shoeArchive).toHaveLength(SHOE_ARCHIVE_LIMIT);
    // The survivors are the newest ones.
    expect(state.shoeArchive[state.shoeArchive.length - 1]!.endedAt).toBe(SHOE_ARCHIVE_LIMIT + 3);
  });

  it("clears on request", () => {
    let state = play(
      createInitialState(),
      { type: "record-coup", coup: { outcome: "banker" } },
      { type: "new-shoe", now: 1 },
    );
    expect(reducer(state, { type: "clear-shoe-archive" }).shoeArchive).toEqual([]);
  });

  it("survives a round trip and drops corrupt rows", () => {
    let state = play(
      createInitialState(),
      { type: "record-coup", coup: { outcome: "banker" } },
      { type: "new-shoe", now: 7 },
    );
    expect(deserializeState(serializeState(state)).shoeArchive).toEqual(state.shoeArchive);

    const repaired = deserializeState(
      JSON.stringify({ ...state, shoeArchive: [null, state.shoeArchive[0], "junk", {}] }),
    );
    expect(repaired.shoeArchive).toEqual([state.shoeArchive[0]]);
    expect(deserializeState(JSON.stringify({ ...state, shoeArchive: "nope" })).shoeArchive).toEqual([]);
  });
});
