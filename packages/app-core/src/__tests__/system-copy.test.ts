import {
  DEFAULT_RULES,
  REVERSE_STREAK_FOUR_CONFIG,
  REVERSE_STREAK_FOUR_MARTINGALE_CONFIG,
  REVERSE_TWELVE_CONFIG,
  runBettingSystem,
  type CoupRecord,
  type Outcome,
} from "@ba-predict/engine";
import { describe, expect, it } from "vitest";
import {
  bettableHands,
  describeBetRate,
  describeRunShape,
  describeSystemRules,
  expectedBetsPerGroup,
  handsInRange,
  nextHandDetail,
  oddsOfCleanGroup,
  oddsOfReachingTopStep,
  oddsOfTopStepPerHand,
  tieReconciliation,
  topStake,
} from "../system-copy";
import { readSystemNext } from "../system-copy";

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

const money = { format: (value: number) => `$${value}` };

const streak = (pattern: string, extra = {}) =>
  runBettingSystem({
    coups: coups(pattern),
    rules: DEFAULT_RULES,
    system: "reverse-streak-4" as const,
    ...extra,
  });

describe("system copy", () => {
  it("describes the rule from the config, not from memory", () => {
    const gated = describeSystemRules(REVERSE_TWELVE_CONFIG, money);
    expect(gated).toContain("Groups of 6");
    expect(gated).toContain("stopping the group on its first loss");
    expect(gated).toContain("stops after hand 60");

    const open = describeSystemRules(REVERSE_STREAK_FOUR_CONFIG, money);
    expect(open).toContain("Every hand after that carries a stake");
    // The top of the ladder is derived, so a changed cap cannot leave the
    // paragraph naming a stake the rule will never ask for.
    expect(open).toContain("up to $400");
    expect(open).toContain("after a fourth straight win");
    expect(open).not.toContain("stopping the group");
  });

  it("says a rule with no last hand runs to the end of the shoe", () => {
    expect(describeSystemRules({ ...REVERSE_TWELVE_CONFIG, lastHand: null }, money)).toContain(
      "runs to the end of the shoe",
    );
  });

  it("puts the top of the ladder where the cap is", () => {
    expect(topStake(REVERSE_TWELVE_CONFIG)).toBe(600);
    expect(topStake(REVERSE_STREAK_FOUR_CONFIG)).toBe(400);
  });

  it("prices the top step off the ladder cap, not the group", () => {
    // The trap: at six these are the same number, so passing `groupSize`
    // looks right until a system caps its ladder below its group.
    expect(oddsOfReachingTopStep(REVERSE_TWELVE_CONFIG.maxLadderSteps)).toBe(32);
    expect(oddsOfReachingTopStep(REVERSE_STREAK_FOUR_CONFIG.maxLadderSteps)).toBe(8);
  });

  it("prices the top step PER HAND for a ladder that never sits out", () => {
    // A different question, and the reason there are two functions: one in
    // eight CLIMBS reaches rung four, but a climb is not a hand once every
    // hand is bet. One in fifteen hands sits on the top rung.
    expect(oddsOfTopStepPerHand(4)).toBe(15);
    expect(oddsOfTopStepPerHand(6)).toBe(63);
    expect(oddsOfTopStepPerHand(1)).toBe(1);
  });

  it("agrees with the engine on how often the top stake is actually placed", () => {
    // Measured, because the card states this number to the player and the
    // first version of it was wrong by a factor of two.
    let seed = 0xd1ce >>> 0;
    const random = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const top = REVERSE_STREAK_FOUR_CONFIG.baseStake +
      (REVERSE_STREAK_FOUR_CONFIG.maxLadderSteps - 1) * REVERSE_STREAK_FOUR_CONFIG.stakeStep;
    let bets = 0;
    let atTop = 0;
    for (let shoe = 0; shoe < 2000; shoe += 1) {
      let pattern = "";
      for (let index = 0; index < 80; index += 1) {
        const roll = random();
        pattern += roll < 0.4586 ? "B" : roll < 0.9048 ? "P" : "T";
      }
      for (const hand of streak(pattern).hands) {
        if (hand.bet === null) continue;
        bets += 1;
        if (hand.stake === top) atTop += 1;
      }
    }

    const measured = bets / atTop;
    const predicted = oddsOfTopStepPerHand(REVERSE_STREAK_FOUR_CONFIG.maxLadderSteps);
    // Within 20%: the chain starts at the base every shoe and the range is
    // only 48 hands, so the finite run sits a little above the stationary
    // rate — but nowhere near the 8 the per-climb figure would claim.
    expect(measured).toBeGreaterThan(predicted * 0.8);
    expect(measured).toBeLessThan(predicted * 1.2);
    expect(measured).toBeGreaterThan(
      oddsOfReachingTopStep(REVERSE_STREAK_FOUR_CONFIG.maxLadderSteps) * 1.5,
    );
  });

  it("counts the hands each rule actually stakes", () => {
    expect(handsInRange(REVERSE_TWELVE_CONFIG)).toBe(48);
    // Bets until the first loss, capped at six: 2(1 - 1/64).
    expect(expectedBetsPerGroup(REVERSE_TWELVE_CONFIG)).toBeCloseTo(1.96875, 6);
    expect(expectedBetsPerGroup(REVERSE_STREAK_FOUR_CONFIG)).toBe(6);

    expect(describeBetRate(REVERSE_TWELVE_CONFIG)).toBe(
      "On a full shoe it stakes about 16 of the 48 hands from 13 to 60 and sits out the rest.",
    );
    expect(describeBetRate(REVERSE_STREAK_FOUR_CONFIG)).toBe(
      "On a full shoe it stakes every one of the 48 hands from 13 to 60.",
    );
    expect(describeBetRate({ ...REVERSE_TWELVE_CONFIG, lastHand: null })).toBeNull();
  });

  it("matches the measured bet rate over many shoes", () => {
    // The formula above against the loop it describes, because a wrong
    // constant here is a number on the strategy picker nobody would check.
    let seed = 0x5eed >>> 0;
    const random = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let bets = 0;
    let shoes = 0;
    for (let shoe = 0; shoe < 800; shoe += 1) {
      let pattern = "";
      for (let index = 0; index < 80; index += 1) {
        const roll = random();
        pattern += roll < 0.4586 ? "B" : roll < 0.9048 ? "P" : "T";
      }
      const result = run(pattern);
      if (result.incomplete) continue;
      bets += result.bets;
      shoes += 1;
    }
    const measured = bets / shoes;
    const predicted = (48 / 6) * expectedBetsPerGroup(REVERSE_TWELVE_CONFIG);
    expect(measured).toBeGreaterThan(predicted * 0.9);
    expect(measured).toBeLessThan(predicted * 1.1);
  });

  it("gives each system the detail line that is true of it", () => {
    // Reverse 12: the group step IS the ladder rung.
    expect(nextHandDetail(run(`${WARMUP}BB`))).toBe(
      "Hand 15 · group 1, bet 3 of 6 · mirroring hand 3",
    );

    // Reverse Streak 4: hand 15 is group step 3 and ladder rung 1, because
    // hand 14 was lost. A line naming "bet 3 of 6" beside a 100 stake would
    // be pointing at the wrong number.
    expect(nextHandDetail(streak(`${WARMUP}BP`))).toBe(
      "Hand 15 · ladder step 1 of 4 · mirroring hand 3",
    );
    expect(nextHandDetail(streak(`${WARMUP}BB`))).toBe(
      "Hand 15 · ladder step 3 of 4 · mirroring hand 3",
    );
  });

  it("has no detail line for a hand with no bet", () => {
    expect(nextHandDetail(run("PPP"))).toBeNull();
    expect(nextHandDetail(streak("PPP"))).toBeNull();
  });

  it("puts the coup number on the board on every hand, tie or no tie", () => {
    // Always present, and the same shape either way — the card reserves
    // room for this line, so it must not appear and disappear.
    // The number is the coup the NEXT hand will be, which is what the rest
    // of the card is about. An earlier wording said "coup 17 on the board"
    // with 16 marks dealt, sending a player counting the road looking for a
    // mark that is not there yet.
    expect(tieReconciliation(run(`${WARMUP}BB`))).toBe(
      "Hand 15 is coup 15 of the shoe — no ties yet.",
    );
    expect(tieReconciliation(run(`${WARMUP}BTB`))).toBe(
      "Hand 15 is coup 16 of the shoe — 1 tie not counted.",
    );
    expect(tieReconciliation(run(`${WARMUP}TBTB`))).toBe(
      "Hand 15 is coup 17 of the shoe — 2 ties not counted.",
    );
    // The hand it names is the one the rest of the card describes, and the
    // coup number is exactly one past the marks dealt.
    expect(run(`${WARMUP}TBTB`).next.hand).toBe(15);
    expect(run("").handsAvailable + 1).toBe(1);
    expect(tieReconciliation(run(""))).toBe("Hand 1 is coup 1 of the shoe — no ties yet.");
  });
});

describe("Reverse Streak 4 Martingale copy", () => {
  const martingale = (pattern: string) =>
    runBettingSystem({
      coups: coups(pattern),
      rules: DEFAULT_RULES,
      system: "reverse-streak-4-martingale" as const,
    });
  // Twelve Player hands, then Player again: every bet backs Banker and loses.
  const lostFour = "P".repeat(12) + "PPPP";

  it("describes doubling, the hold and the stop-win", () => {
    const rules = describeSystemRules(REVERSE_STREAK_FOUR_MARTINGALE_CONFIG, money);
    expect(rules).toContain("1, 2, 4 and 8 units");
    expect(rules).toContain("double after each loss");
    expect(rules).toContain("back to one unit after a win below the top");
    expect(rules).toContain("a win while holding does not reset it");
    expect(rules).toContain("until it is 2 net wins up at that stake");
    expect(rules).not.toContain("after any win");
    expect(rules).toContain("wins outnumber losses by 8");
    expect(rules).toContain("stops after hand 60");
  });

  it("says the target can end the shoe early", () => {
    expect(describeBetRate(REVERSE_STREAK_FOUR_MARTINGALE_CONFIG)).toBe(
      "On a full shoe it stakes every one of the 48 hands from 13 to 60, unless it gets 8 wins ahead first and stops there.",
    );
  });

  it("counts possible bets only up to the stop-win", () => {
    // Every reference hand is Player, so eight Bankers are eight wins: the
    // target lands on hand 20, and the rest of the shoe is not bettable.
    const result = martingale("P".repeat(12) + "B".repeat(8) + "PB".repeat(20));
    expect(result.targetReachedAt).toBe(20);
    expect(bettableHands(result)).toBe(8);
  });

  it("tops out at eight units", () => {
    expect(topStake(REVERSE_STREAK_FOUR_MARTINGALE_CONFIG)).toBe(400);
  });

  it("names the doubling step, then the hold", () => {
    expect(nextHandDetail(martingale("P".repeat(12) + "PP"))).toContain("doubling step 3 of 4");
    expect(nextHandDetail(martingale(lostFour))).toContain(
      "holding the top stake, +0 of +2 net to reset",
    );
  });

  it("says why it is still holding when a cut climb is not back yet", () => {
    // Four Banker losses, then two Banker wins at a 300 table maximum.
    const run = runBettingSystem({
      coups: coups("P".repeat(12) + "PPPP" + "BB"),
      rules: DEFAULT_RULES,
      system: "reverse-streak-4-martingale" as const,
      tableMax: 300,
    });
    expect(nextHandDetail(run)).toContain("until the cut climb's losses are won back");
    expect(describeSystemRules(REVERSE_STREAK_FOUR_MARTINGALE_CONFIG, money)).toContain(
      "If the table maximum cuts a stake, the hold also waits until the losses are actually won back.",
    );
  });

  it("describes its shape as a Martingale, not a ladder", () => {
    const shape = describeRunShape(REVERSE_STREAK_FOUR_MARTINGALE_CONFIG);
    expect(shape).toContain("a loss doubles the next one");
    expect(shape).not.toContain("ladder resets");
    expect(shape).toContain("until it gets 8 wins ahead, when it stops for the shoe");
  });
});
