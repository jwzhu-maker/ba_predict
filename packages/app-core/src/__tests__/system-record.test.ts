import { DEFAULT_RULES, type CoupRecord, type Outcome } from "@ba-predict/engine";
import { describe, expect, it } from "vitest";
import { archiveShoe, type ArchivedShoe } from "../shoe-archive";
import { aggregateSystemRecord } from "../system-record";

function coups(pattern: string): CoupRecord[] {
  return [...pattern.replace(/\s+/g, "")].map((char) => {
    const outcome: Outcome =
      char === "P" ? "player" : char === "B" ? "banker" : char === "T" ? "tie" : (null as never);
    if (outcome === null) throw new Error(`bad pattern character ${char}`);
    return { outcome, playerPair: false, bankerPair: false };
  });
}

function shoe(pattern: string, id = 1): ArchivedShoe {
  return archiveShoe({ coups: coups(pattern), decks: 8, startedAt: id, endedAt: id + 1 })!;
}

const base = { rules: DEFAULT_RULES };
const WARMUP = "PPPPPPPPPPPP";

/** mulberry32, so the large sample below is deterministic. */
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

/** A shoe at real baccarat frequencies. */
function realisticShoe(random: () => number, hands: number, id: number): ArchivedShoe {
  let pattern = "";
  for (let index = 0; index < hands; index += 1) {
    const roll = random();
    pattern += roll < 0.4586 ? "B" : roll < 0.9048 ? "P" : "T";
  }
  return shoe(pattern, id);
}

describe("system record", () => {
  it("reports nothing playable with no shoes", () => {
    const record = aggregateSystemRecord({ ...base, shoes: [] });
    expect(record).toMatchObject({ shoes: 0, shoesWithBets: 0, bets: 0, net: 0, staked: 0 });
    expect(record.successRate).toBe(0);
    expect(record.perUnit).toBe(0);
    // It can still describe the rule it would have played.
    expect(record.name).toBe("Reverse 12");
    expect(record.config.lookback).toBe(12);
  });

  it("sums one shoe's run", () => {
    // Twelve watched, then three Banker wins and a loss — the single-shoe
    // case pinned in the engine's own tests.
    const record = aggregateSystemRecord({ ...base, shoes: [shoe(`${WARMUP}BBBPBB`)] });
    expect(record.shoes).toBe(1);
    expect(record.shoesWithBets).toBe(1);
    expect(record.bets).toBe(4);
    expect(record.wins).toBe(3);
    expect(record.staked).toBe(1000);
    expect(record.net).toBeCloseTo(0.95 * 600 - 400, 10);
    expect(record.hitRate).toBeCloseTo(0.75, 10);
    expect(record.perUnit).toBeCloseTo(record.net / record.staked, 10);
  });

  it("counts the live shoe alongside the archived ones", () => {
    const record = aggregateSystemRecord({
      ...base,
      shoes: [shoe(`${WARMUP}BBBPBB`, 1)],
      currentShoe: coups(`${WARMUP}BBBPBB`),
    });
    expect(record.shoes).toBe(2);
    expect(record.perShoe).toHaveLength(2);
    expect(record.perShoe[0]!.net).toBeCloseTo(record.perShoe[1]!.net, 10);
    expect(record.bets).toBe(8);
  });

  it("does not let a shoe too short to bet dilute the win rate", () => {
    // Ten hands never reaches hand 13, so the system never played it.
    const record = aggregateSystemRecord({
      ...base,
      shoes: [shoe(`${WARMUP}BBBBBB`, 1), shoe("PBPBPBPBPB", 2)],
    });
    expect(record.shoes).toBe(2);
    expect(record.shoesWithBets).toBe(1);
    expect(record.shoesAhead).toBe(1);
    expect(record.successRate).toBe(1);
    expect(record.incompleteShoes).toBe(2);
  });

  it("tracks the best and worst shoe, and the deepest stake reached", () => {
    const record = aggregateSystemRecord({
      ...base,
      shoes: [
        shoe(`${WARMUP}BBBBBB`, 1), // six straight wins
        shoe(`${WARMUP}PPPPPP`, 2), // loses hand 13 immediately
      ],
    });
    expect(record.bestShoe).toBeCloseTo(0.95 * 2100, 10);
    expect(record.worstShoe).toBe(-100);
    expect(record.peakStake).toBe(600);
    expect(record.perfectGroups).toBe(1);
    expect(record.groups).toBe(2);
    expect(record.shoesAhead).toBe(1);
    expect(record.successRate).toBeCloseTo(0.5, 10);
  });

  it("totals agree with the per-shoe rows", () => {
    const random = seededRandom(7);
    const shoes = Array.from({ length: 12 }, (_, index) => realisticShoe(random, 75, index + 1));
    const record = aggregateSystemRecord({ ...base, shoes });
    const sum = (pick: (row: (typeof record.perShoe)[number]) => number) =>
      record.perShoe.reduce((total, row) => total + pick(row), 0);
    expect(sum((row) => row.net)).toBeCloseTo(record.net, 8);
    expect(sum((row) => row.staked)).toBeCloseTo(record.staked, 8);
    expect(sum((row) => row.bets)).toBe(record.bets);
    expect(sum((row) => row.wins)).toBe(record.wins);
    expect(record.shoesAhead).toBe(record.perShoe.filter((row) => row.net > 0).length);
  });

  it("passes a changed configuration through to every shoe", () => {
    const record = aggregateSystemRecord({
      ...base,
      shoes: [shoe(`${WARMUP}BBBBBB`)],
      config: { baseStake: 10, stakeStep: 10 },
    });
    expect(record.config.baseStake).toBe(10);
    expect(record.staked).toBe(210);
    expect(record.peakStake).toBe(60);
  });

  it("is deterministic", () => {
    const random = seededRandom(3);
    const shoes = Array.from({ length: 5 }, (_, index) => realisticShoe(random, 75, index + 1));
    expect(aggregateSystemRecord({ ...base, shoes })).toEqual(
      aggregateSystemRecord({ ...base, shoes }),
    );
  });

  it("pays the house edge per unit staked over a long run, however it is scheduled", () => {
    // The honest claim of the whole screen, measured rather than asserted.
    // Sitting out the warm-up, quitting a group on its first loss and
    // stopping at hand 60 changes HOW MUCH is staked, not what a stake costs.
    const random = seededRandom(20260920);
    const shoes = Array.from({ length: 400 }, (_, index) => realisticShoe(random, 75, index + 1));
    const record = aggregateSystemRecord({ ...base, shoes });

    expect(record.shoesWithBets).toBe(400);

    // Banker and Player are backed in roughly equal measure here, so the
    // blended edge sits between Banker's 1.06% and Player's 1.24%.
    expect(record.perUnit).toBeLessThan(0);
    expect(record.perUnit).toBeGreaterThan(-0.03);
    expect(Math.abs(record.perUnit)).toBeGreaterThan(0.002);
  });

  it("places about two bets per group, not six", () => {
    // The single most surprising consequence of "stop the group on a loss",
    // and the reason the ladder almost never reaches its top step.
    //
    // A bet wins when the hand differs from the hand twelve back, which at
    // real frequencies is a coin flip (2 x 0.507 x 0.493 = 0.4999 among
    // non-tie hands). A group therefore places 1 + p + ... + p^5 bets, which
    // at p = 1/2 is 1.97 — so eight groups is about 16 bets a shoe out of a
    // possible 48, and the $600 step is reached on roughly one group in 32.
    const random = seededRandom(20260920);
    const shoes = Array.from({ length: 400 }, (_, index) => realisticShoe(random, 75, index + 1));
    const record = aggregateSystemRecord({ ...base, shoes });

    const theoretical = [0, 1, 2, 3, 4, 5].reduce((sum, k) => sum + 0.5 ** k, 0);
    expect(theoretical).toBeCloseTo(1.96875, 10);

    expect(record.groups).toBe(400 * 8);
    expect(record.bets / record.groups).toBeGreaterThan(theoretical - 0.15);
    expect(record.bets / record.groups).toBeLessThan(theoretical + 0.15);

    // Six-for-six is a 1-in-64 group, so a few hundred shoes see some.
    expect(record.perfectGroups).toBeGreaterThan(0);
    expect(record.perfectGroups / record.groups).toBeLessThan(0.05);
  });

  it("totals the system it is given, and says which one it totalled", () => {
    // The same archive under both rules. Reverse 12 sits out the rest of a
    // group it has lost, so it must place strictly fewer bets than a rule
    // that backs every hand — and the record has to name the one it ran, or
    // a card titled "Reverse Streak 4 record" reports Reverse 12's numbers.
    const shoes = [shoe(`${WARMUP}BBPPPPPPPP`, 1), shoe(`${WARMUP}PBPBPBPBPB`, 2)];

    const gated = aggregateSystemRecord({ ...base, shoes, system: "reverse-12" });
    const open = aggregateSystemRecord({ ...base, shoes, system: "reverse-streak-4" });

    expect(gated).toMatchObject({ id: "reverse-12", name: "Reverse 12" });
    expect(open).toMatchObject({ id: "reverse-streak-4", name: "Reverse Streak 4" });
    expect(open.bets).toBeGreaterThan(gated.bets);
    // Twenty-two hands a shoe, ten of them past the warm-up, all staked.
    expect(open.bets).toBe(20);
    expect(open.config.maxLadderSteps).toBe(4);
    expect(gated.config.maxLadderSteps).toBe(6);
  });

  it("falls back to the default when no system is named", () => {
    const shoes = [shoe(`${WARMUP}BBPPPP`, 1)];
    expect(aggregateSystemRecord({ ...base, shoes }).id).toBe("reverse-12");
    expect(aggregateSystemRecord({ ...base, shoes, system: null }).id).toBe("reverse-12");
  });

  it("describes the named system even with nothing archived", () => {
    // The empty-record card still carries a name and a config, and they came
    // from a bare run rather than from the first shoe — so they have to be
    // the right system's.
    const empty = aggregateSystemRecord({ ...base, shoes: [], system: "reverse-streak-4" });
    expect(empty).toMatchObject({ id: "reverse-streak-4", name: "Reverse Streak 4", shoes: 0 });
    expect(empty.config.groupsGateBetting).toBe(false);
  });
});
