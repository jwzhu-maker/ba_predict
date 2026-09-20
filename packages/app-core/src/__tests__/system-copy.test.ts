import { runBettingSystem, type CoupRecord, type Outcome, DEFAULT_RULES } from "@ba-predict/engine";
import { describe, expect, it } from "vitest";
import {
  bettableHands,
  oddsOfCleanGroup,
  oddsOfReachingTopStep,
  readSystemNext,
} from "../system-copy";

function coups(pattern: string): CoupRecord[] {
  return [...pattern.replace(/\s+/g, "")].map((char) => {
    const outcome: Outcome =
      char === "P" ? "player" : char === "B" ? "banker" : char === "T" ? "tie" : (null as never);
    if (outcome === null) throw new Error(`bad pattern character ${char}`);
    return { outcome, playerPair: false, bankerPair: false };
  });
}

const run = (pattern: string, extra = {}) =>
  runBettingSystem({ coups: coups(pattern), rules: DEFAULT_RULES, ...extra });

const WARMUP = "PPPPPPPPPPPP";

describe("readSystemNext", () => {
  it("counts down the warm-up and stops at zero", () => {
    expect(readSystemNext(run("")).handsToWatch).toBe(12);
    expect(readSystemNext(run("PPPPP")).handsToWatch).toBe(7);
    expect(readSystemNext(run(WARMUP)).handsToWatch).toBe(0);
    expect(readSystemNext(run(`${WARMUP}BBB`)).handsToWatch).toBe(0);
  });

  it("names the next group when one is still coming", () => {
    // Lost hand 13, so group 1 is dead and group 2 opens on hand 19.
    const reading = readSystemNext(run(`${WARMUP}P`));
    expect(reading).toMatchObject({ resumesAtGroup: 2, resumesAtHand: 19 });
  });

  it("refuses to promise a group past the last hand", () => {
    // Group 8 covers hands 55-60 and the rule stops at 60, so a loss inside
    // it leaves nothing to wait for. This is the defect the clients shipped:
    // they said "group 9, which opens on hand 61".
    const pattern = `${WARMUP}${"BP".repeat(21)}`; // 54 hands recorded
    const before = run(pattern);
    expect(before.next.hand).toBe(55);
    expect(before.next.group).toBe(8);
    expect(before.next.step).toBe(1);

    // Deal hand 55 so that it loses, killing group 8.
    const outcomes = coups(pattern).map((coup) => coup.outcome);
    const reference = outcomes[55 - 12 - 1]!;
    const losing = reference === "player" ? "P" : "B";
    const dead = run(pattern + losing);

    expect(dead.next.skipped).toBe("group-over");
    expect(dead.next.group).toBe(8);
    const reading = readSystemNext(dead);
    expect(reading.resumesAtHand).toBeNull();
    expect(reading.resumesAtGroup).toBeNull();
  });

  it("has nothing to resume when the system is not sitting out a group", () => {
    for (const pattern of ["", WARMUP, `${WARMUP}B`, "PB".repeat(35)]) {
      const reading = readSystemNext(run(pattern));
      expect(reading.resumesAtHand).toBeNull();
      expect(reading.resumesAtGroup).toBeNull();
    }
  });
});

describe("bettableHands", () => {
  it("is the full betting range on a shoe that reaches the last hand", () => {
    expect(bettableHands(run("PB".repeat(35)))).toBe(48); // 70 hands, capped at 60
    expect(bettableHands(run("PB".repeat(30)))).toBe(48); // exactly 60
  });

  it("is bounded by the shoe when it ends early", () => {
    // The defect: both clients reported "of 48" here.
    expect(bettableHands(run("PB".repeat(20)))).toBe(28); // 40 hands
    expect(bettableHands(run(WARMUP))).toBe(0);
    expect(bettableHands(run("PPPP"))).toBe(0);
    expect(bettableHands(run(""))).toBe(0);
  });

  it("never reports fewer hands than were actually bet", () => {
    for (const hands of [0, 5, 12, 13, 20, 40, 59, 60, 61, 80]) {
      const result = run("PBBPBPPBBPBP".repeat(8).slice(0, hands));
      expect(bettableHands(result)).toBeGreaterThanOrEqual(result.bets);
    }
  });
});

describe("ladder odds", () => {
  it("separates reaching the top step from winning the whole group", () => {
    // Placing the sixth bet needs five wins; winning the group needs six.
    // The clients' hint used 2 ** groupSize for both, doubling the rarity
    // of the event it was actually describing.
    expect(oddsOfReachingTopStep(6)).toBe(32);
    expect(oddsOfCleanGroup(6)).toBe(64);
    expect(oddsOfReachingTopStep(1)).toBe(1);
    expect(oddsOfCleanGroup(1)).toBe(2);
  });

  it("agrees with the engine on how often the top step is actually reached", () => {
    // Measured, not asserted: deal random shoes and count the groups whose
    // biggest stake is the ladder's last step.
    let s = 12345 >>> 0;
    const random = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    let groups = 0;
    let reachedTop = 0;
    let clean = 0;
    for (let shoe = 0; shoe < 1500; shoe += 1) {
      let pattern = "";
      for (let index = 0; index < 75; index += 1) {
        const roll = random();
        pattern += roll < 0.4586 ? "B" : roll < 0.9048 ? "P" : "T";
      }
      const result = run(pattern);
      groups += result.groups.length;
      for (const group of result.groups) {
        if (group.bets === result.config.groupSize) reachedTop += 1;
        if (group.perfect) clean += 1;
      }
    }

    const topRate = groups / reachedTop;
    const cleanRate = groups / clean;
    expect(topRate).toBeGreaterThan(oddsOfReachingTopStep(6) * 0.75);
    expect(topRate).toBeLessThan(oddsOfReachingTopStep(6) * 1.35);
    expect(cleanRate).toBeGreaterThan(oddsOfCleanGroup(6) * 0.75);
    expect(cleanRate).toBeLessThan(oddsOfCleanGroup(6) * 1.35);
    // And the two really are different events, roughly two to one.
    expect(reachedTop).toBeGreaterThan(clean);
  });
});
