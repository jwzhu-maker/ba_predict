import {
  DEFAULT_PROGRESSION_OPTIONS,
  DEFAULT_RULES,
  type CoupRecord,
  type Outcome,
} from "@ba-predict/engine";
import { describe, expect, it } from "vitest";
import { archiveShoe, type ArchivedShoe } from "../shoe-archive";
import { aggregateStrategyRecord } from "../strategy-record";

/** mulberry32, so the big sample below is deterministic. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function coups(outcomes: readonly Outcome[]): CoupRecord[] {
  return outcomes.map((outcome) => ({ outcome, playerPair: false, bankerPair: false }));
}

function shoe(outcomes: readonly Outcome[], id = 1): ArchivedShoe {
  return archiveShoe({ coups: coups(outcomes), decks: 8, startedAt: id, endedAt: id + 1 })!;
}

const base = {
  rules: DEFAULT_RULES,
  bet: "banker" as const,
  progressionOptions: { ...DEFAULT_PROGRESSION_OPTIONS, maxUnits: 1000 },
  bankrollUnits: 1000,
};

describe("aggregateStrategyRecord", () => {
  it("is empty with nothing recorded", () => {
    const record = aggregateStrategyRecord({ ...base, shoes: [] });
    expect(record.shoes).toBe(0);
    expect(record.coups).toBe(0);
    for (const row of record.rows) {
      expect(row.shoes).toBe(0);
      expect(row.successRate).toBe(0);
      expect(row.perUnit).toBe(0);
    }
  });

  it("totals across several shoes", () => {
    const record = aggregateStrategyRecord({
      ...base,
      shoes: [shoe(["banker", "banker"], 1), shoe(["player", "player"], 2)],
    });
    expect(record.shoes).toBe(2);
    expect(record.coups).toBe(4);
    const flat = record.rows.find((r) => r.progression === "flat")!;
    expect(flat.shoes).toBe(2);
    // +1.90 on the winning shoe, -2 on the losing one.
    expect(flat.netUnits).toBeCloseTo(1.9 - 2, 10);
    expect(flat.stakedUnits).toBe(4);
    expect(flat.shoesAhead).toBe(1);
    expect(flat.successRate).toBeCloseTo(0.5, 10);
  });

  it("counts the shoe in progress alongside the archive", () => {
    const withCurrent = aggregateStrategyRecord({
      ...base,
      shoes: [shoe(["banker"], 1)],
      currentShoe: coups(["player"]),
    });
    expect(withCurrent.shoes).toBe(2);

    const archiveOnly = aggregateStrategyRecord({ ...base, shoes: [shoe(["banker"], 1)] });
    expect(archiveOnly.shoes).toBe(1);
  });

  it("ignores an empty current shoe", () => {
    const record = aggregateStrategyRecord({
      ...base,
      shoes: [shoe(["banker"], 1)],
      currentShoe: [],
    });
    expect(record.shoes).toBe(1);
  });

  it("ranks by success rate, and a Martingale wins more shoes than flat", () => {
    // Shoes that each end on a Banker win after some losses: the classic
    // shape a Martingale converts into a winning shoe and flat does not.
    const shoes = [
      shoe(["player", "player", "banker"], 1),
      shoe(["player", "banker"], 2),
      shoe(["player", "player", "player", "banker"], 3),
    ];
    const record = aggregateStrategyRecord({ ...base, shoes });
    const flat = record.rows.find((r) => r.progression === "flat")!;
    const martingale = record.rows.find((r) => r.progression === "martingale")!;
    expect(martingale.successRate).toBeGreaterThan(flat.successRate);
    // Sorted by success rate.
    for (let i = 1; i < record.rows.length; i += 1) {
      expect(record.rows[i]!.successRate).toBeLessThanOrEqual(record.rows[i - 1]!.successRate);
    }
  });

  it("reports the per-unit figure alongside the rate, signed", () => {
    const shoes = [shoe(["player", "player", "banker"], 1), shoe(["player", "banker"], 2)];
    const record = aggregateStrategyRecord({ ...base, shoes });
    for (const row of record.rows) {
      if (row.stakedUnits === 0) continue;
      expect(row.perUnit).toBeCloseTo(row.netUnits / row.stakedUnits, 10);
    }
  });

  it("tracks the worst and best shoe, and the peak stake reached", () => {
    const shoes = [
      shoe(["banker", "banker", "banker"], 1),
      shoe(["player", "player", "player"], 2),
    ];
    const record = aggregateStrategyRecord({ ...base, shoes });
    const martingale = record.rows.find((r) => r.progression === "martingale")!;
    expect(martingale.bestShoeUnits).toBeGreaterThan(0);
    expect(martingale.worstShoeUnits).toBeLessThan(0);
    // 1 + 2 + 4 on the losing shoe.
    expect(martingale.peakStakeUnits).toBe(4);
    expect(martingale.worstShoeUnits).toBeCloseTo(-7, 10);
  });

  it("counts shoes where a plan broke down", () => {
    const record = aggregateStrategyRecord({
      ...base,
      progressionOptions: { ...DEFAULT_PROGRESSION_OPTIONS, maxUnits: 4 },
      shoes: [
        shoe(["player", "player", "player", "player"], 1),
        shoe(["banker", "banker"], 2),
      ],
    });
    const martingale = record.rows.find((r) => r.progression === "martingale")!;
    const flat = record.rows.find((r) => r.progression === "flat")!;
    expect(martingale.breakdowns).toBe(1);
    expect(flat.breakdowns).toBe(0);
  });

  it("carries the approximate flag up from the replays", () => {
    const record = aggregateStrategyRecord({
      ...base,
      rules: { ...DEFAULT_RULES, bankerSixPayout: 0.5 },
      shoes: [shoe(["banker"], 1)],
    });
    expect(record.approximate).toBe(true);
  });

  it("separates winning shoes often from losing less — the point of the screen", () => {
    // 300 shoes at real baccarat frequencies, seeded so this is deterministic.
    // The two columns must tell different stories: success rates spread very
    // wide (a Martingale finishes almost every shoe ahead) while the per-unit
    // cost stays in a narrow band for all of them. That gap is exactly what
    // makes a staking system feel like it works.
    const random = seededRandom(42);
    const shoes = Array.from({ length: 300 }, (_, index) =>
      shoe(
        Array.from({ length: 70 }, (): Outcome => {
          const roll = random();
          return roll < 0.4586 ? "banker" : roll < 0.9048 ? "player" : "tie";
        }),
        index + 1,
      ),
    );

    const record = aggregateStrategyRecord({ ...base, bankrollUnits: 100_000, shoes });
    const rates = record.rows.map((row) => row.successRate);
    expect(Math.max(...rates) - Math.min(...rates)).toBeGreaterThan(0.4);

    const martingale = record.rows.find((r) => r.progression === "martingale")!;
    const flat = record.rows.find((r) => r.progression === "flat")!;
    expect(martingale.successRate).toBeGreaterThan(0.85);
    expect(flat.successRate).toBeLessThan(0.55);

    // ...and yet they cost about the same per unit staked.
    const perUnits = record.rows
      .filter((row) => row.stakedUnits > 0 && row.breakdowns === 0)
      .map((row) => row.perUnit);
    expect(perUnits.length).toBeGreaterThan(4);
    expect(Math.max(...perUnits) - Math.min(...perUnits)).toBeLessThan(0.07);

    // Winning far more shoes buys no advantage in what it costs.
    expect(martingale.perUnit).toBeLessThan(0.05);
  });
});
