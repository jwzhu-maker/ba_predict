import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "../types";
import type { CoupRecord, Outcome } from "../types";
import {
  BETTING_SYSTEMS,
  REVERSE_STREAK_FOUR_CONFIG,
  REVERSE_STREAK_FOUR_MARTINGALE_CONFIG,
  REVERSE_TWELVE_CONFIG,
  bettingSystemById,
  runBettingSystem,
} from "../systems";

/**
 * "P" player, "B" banker, "T" tie. Whitespace is ignored so a 60-hand shoe
 * can be written in readable blocks.
 */
function coups(pattern: string): CoupRecord[] {
  const out: CoupRecord[] = [];
  for (const char of pattern.replace(/\s+/g, "")) {
    const outcome: Outcome =
      char === "P" ? "player" : char === "B" ? "banker" : char === "T" ? "tie" : (null as never);
    if (outcome === null) throw new Error(`bad pattern character ${char}`);
    out.push({ outcome, playerPair: false, bankerPair: false });
  }
  return out;
}

const run = (pattern: string, overrides = {}) =>
  runBettingSystem({ coups: coups(pattern), rules: DEFAULT_RULES, ...overrides });

/** Twelve hands of Player, so every reference hand is known. */
const WARMUP = "PPPPPPPPPPPP";

describe("Reverse 12", () => {
  it("bets nothing for the first twelve hands", () => {
    const result = run(WARMUP);
    expect(result.bets).toBe(0);
    expect(result.net).toBe(0);
    expect(result.groups).toHaveLength(0);
    expect(result.hands).toHaveLength(12);
    for (const hand of result.hands) {
      expect(hand.bet).toBeNull();
      expect(hand.skipped).toBe("warm-up");
      expect(hand.stake).toBe(0);
    }
  });

  it("bets the reverse of the hand twelve back, starting at hand 13", () => {
    // Hand 13's reference is hand 1, which was Player, so the bet is Banker.
    const result = run(`${WARMUP}P`);
    const thirteen = result.hands[12]!;
    expect(thirteen.hand).toBe(13);
    expect(thirteen.referenceHand).toBe(1);
    expect(thirteen.bet).toBe("banker");
    // ...and hand 13 came out Player, so mirroring it lost.
    expect(thirteen.result).toBe("loss");
    expect(thirteen.stake).toBe(100);
    expect(thirteen.profit).toBe(-100);
  });

  it("wins exactly when a hand differs from the hand twelve back", () => {
    // That equivalence is the whole rule restated, so it is worth pinning:
    // betting the reverse of hand n-12 wins iff hand n is not hand n-12.
    const pattern = "PBBPBPPBBPBP" + "BPBPPBBPPBPB" + "PPBBPBPBBPPB";
    const result = run(pattern);
    const outcomes = coups(pattern).map((coup) => coup.outcome);
    for (const hand of result.hands) {
      if (hand.result === null) continue;
      const reference = outcomes[hand.hand - 12 - 1]!;
      const expected = outcomes[hand.hand - 1] === reference ? "loss" : "win";
      expect(hand.result).toBe(expected);
    }
  });

  it("climbs by one step per win and stops the group on the first loss", () => {
    //           13 14 15 16 17 18
    const result = run(`${WARMUP}BBBPBB`);
    const bet = (hand: number) => result.hands[hand - 1]!;

    expect(bet(13).stake).toBe(100);
    expect(bet(14).stake).toBe(200);
    expect(bet(15).stake).toBe(300);
    expect(bet(16).stake).toBe(400);
    expect([bet(13), bet(14), bet(15)].map((h) => h.result)).toEqual(["win", "win", "win"]);
    expect(bet(16).result).toBe("loss");

    // The rest of the group is sat out, not bet small.
    expect(bet(17).skipped).toBe("group-over");
    expect(bet(18).skipped).toBe("group-over");
    expect(bet(17).stake).toBe(0);
    expect(bet(18).stake).toBe(0);

    // Three Banker wins pay 0.95 each; the fourth hand loses its whole stake.
    const expectedNet = 0.95 * (100 + 200 + 300) - 400;
    expect(result.net).toBeCloseTo(expectedNet, 10);
    expect(result.staked).toBe(1000);

    const group = result.groups[0]!;
    expect(group).toMatchObject({ group: 1, firstHand: 13, lastHand: 18, bets: 4, wins: 3 });
    expect(group.lostAt).toBe(16);
    expect(group.perfect).toBe(false);
  });

  it("restarts the next group at the base stake, even after a bad one", () => {
    // Group 1 loses immediately; group 2 opens at 100 regardless.
    const result = run(`${WARMUP}PPPPPP` + "BBBBBB");
    expect(result.hands[12]!.stake).toBe(100);
    expect(result.hands[12]!.result).toBe("loss");
    for (let hand = 14; hand <= 18; hand += 1) {
      expect(result.hands[hand - 1]!.skipped).toBe("group-over");
    }
    const nineteen = result.hands[18]!;
    expect(nineteen.group).toBe(2);
    expect(nineteen.step).toBe(1);
    expect(nineteen.stake).toBe(100);
  });

  it("marks a group that wins all six and reaches the top of the ladder", () => {
    const result = run(`${WARMUP}BBBBBB`);
    const group = result.groups[0]!;
    expect(group.bets).toBe(6);
    expect(group.wins).toBe(6);
    expect(group.perfect).toBe(true);
    expect(group.lostAt).toBeNull();
    expect(result.perfectGroups).toBe(1);
    expect(result.peakStake).toBe(600);
    expect(result.staked).toBe(2100);
    // Every leg is Banker here, so the commission is the whole difference
    // between the ladder's face value and what it actually returns.
    expect(result.net).toBeCloseTo(0.95 * 2100, 10);
    expect(result.net).toBeLessThan(2100);
  });

  it("pays a Player win in full and a Banker win after commission", () => {
    // Hand 13 mirrors hand 1. Making hand 1 Banker puts the bet on Player.
    const playerLeg = run("BPPPPPPPPPPP" + "P");
    expect(playerLeg.hands[12]!.bet).toBe("player");
    expect(playerLeg.hands[12]!.profit).toBe(100);

    const bankerLeg = run(`${WARMUP}B`);
    expect(bankerLeg.hands[12]!.bet).toBe("banker");
    expect(bankerLeg.hands[12]!.profit).toBeCloseTo(95, 10);
  });

  it("deletes ties before numbering anything", () => {
    // One tie up front: the 13th BETTABLE hand is the 14th recorded coup.
    const result = run(`T${WARMUP}B`);
    expect(result.tiesRemoved).toBe(1);
    expect(result.handsAvailable).toBe(13);
    const thirteen = result.hands[12]!;
    expect(thirteen.hand).toBe(13);
    expect(thirteen.sourceIndex).toBe(13);
    expect(thirteen.bet).toBe("banker");
    expect(thirteen.result).toBe("win");

    // The run's hands are the input with the ties taken out, in order, and
    // each one still points back at where it really sat in the shoe.
    const source = coups(`T${WARMUP}B`);
    expect(result.hands.map((hand) => hand.outcome)).toEqual(
      source.map((coup) => coup.outcome).filter((outcome) => outcome !== "tie"),
    );
    for (const hand of result.hands) {
      expect(source[hand.sourceIndex]!.outcome).toBe(hand.outcome);
    }
  });

  it("is unchanged by ties sprinkled through the shoe", () => {
    const clean = run(`${WARMUP}BBBPBB`);
    const withTies = run(`PPTPPPTPPPPPPP` + "BTBBPTBB");
    expect(withTies.tiesRemoved).toBe(4);
    expect(withTies.bets).toBe(clean.bets);
    expect(withTies.net).toBeCloseTo(clean.net, 10);
    expect(withTies.staked).toBe(clean.staked);
    expect(withTies.hands.filter((h) => h.result !== null).map((h) => h.result)).toEqual(
      clean.hands.filter((h) => h.result !== null).map((h) => h.result),
    );
  });

  it("stops at hand 60 and fills exactly eight groups", () => {
    // 70 hands: 12 watched, 48 bet across 8 groups, 10 past the end.
    const result = run("PB".repeat(35));
    expect(result.handsAvailable).toBe(70);
    expect(result.groups).toHaveLength(8);
    expect(result.groups[7]!).toMatchObject({ firstHand: 55, lastHand: 60 });
    expect(result.incomplete).toBe(false);

    for (let hand = 61; hand <= 70; hand += 1) {
      const row = result.hands[hand - 1]!;
      expect(row.skipped).toBe("past-last-hand");
      expect(row.group).toBeNull();
      expect(row.stake).toBe(0);
    }
    expect(result.hands.every((hand) => hand.hand <= 60 || hand.bet === null)).toBe(true);
  });

  it("reports a shoe that runs out before hand 60 as incomplete", () => {
    const result = run("PB".repeat(20)); // 40 hands
    expect(result.handsAvailable).toBe(40);
    expect(result.incomplete).toBe(true);
    // 40 hands is 12 watched plus 28 bettable, i.e. four full groups and a
    // fifth covering hands 49-54 that the shoe cuts short at 40.
    expect(result.groups.at(-1)!.firstHand).toBe(37);
  });

  it("clips a stake to the table maximum when one is set, and says how often", () => {
    const result = run(`${WARMUP}BBBBBB`, { tableMax: 250 });
    expect(result.hands.map((h) => h.stake).filter((s) => s > 0)).toEqual([
      100, 200, 250, 250, 250, 250,
    ]);
    expect(result.peakStake).toBe(250);
    // Four asks (300, 400, 500, 600) were held at 250. Silently clipping
    // reports a net for a ladder that was never climbed.
    expect(result.clippedBets).toBe(4);
    expect(run(`${WARMUP}BBBBBB`).clippedBets).toBe(0);
  });

  it("clips the NEXT stake to the table maximum too", () => {
    // The card renders next.stake as the instruction, so an unclipped value
    // there tells the user to bet above the table maximum while the run
    // books the capped amount.
    const result = run(`${WARMUP}BBB`, { tableMax: 250 });
    expect(result.hands.map((h) => h.stake).filter((s) => s > 0)).toEqual([100, 200, 250]);
    expect(result.next).toMatchObject({
      step: 4,
      stake: 250,
      requestedStake: 400,
      clipped: true,
    });
    // With no ceiling the two agree and nothing is flagged.
    expect(run(`${WARMUP}BBB`).next).toMatchObject({
      stake: 400,
      requestedStake: 400,
      clipped: false,
    });
  });

  it("flags a next stake the bankroll cannot cover, without shrinking it", () => {
    const poor = run(`${WARMUP}BBB`, { bankroll: 250 });
    // The rule's ask stands: quietly reducing it would report a different
    // system. The client warns instead.
    expect(poor.next.stake).toBe(400);
    expect(poor.next.unaffordable).toBe(true);
    expect(run(`${WARMUP}BBB`, { bankroll: 1000 }).next.unaffordable).toBe(false);
    expect(run(`${WARMUP}BBB`).next.unaffordable).toBe(false);
  });

  it("never lets a group claim hands the shoe did not deal", () => {
    // 40 tie-free hands: the last group covers 37-42 by the rule, but only
    // 37-40 exist. The card prints this range verbatim.
    const result = run("PB".repeat(20));
    const last = result.groups.at(-1)!;
    expect(last.firstHand).toBe(37);
    expect(last.lastHand).toBe(40);
    for (const group of result.groups) {
      expect(group.lastHand).toBeLessThanOrEqual(result.handsAvailable);
      expect(group.lastHand).toBeGreaterThanOrEqual(group.firstHand);
    }
  });

  it("ignores a config key explicitly set to undefined", () => {
    // `exactOptionalPropertyTypes` is off, so this typechecks — and a bare
    // spread would put `undefined` in `lastHand`, making `hand > undefined`
    // false for every hand and silently disabling the stop-at-60 rule.
    const result = run("PB".repeat(35), { config: { lastHand: undefined } });
    expect(result.config.lastHand).toBe(60);
    expect(result.hands.filter((hand) => hand.bet !== null).every((h) => h.hand <= 60)).toBe(true);
    expect(run("PB".repeat(35), { config: { baseStake: undefined } }).config.baseStake).toBe(100);
  });

  it("totals agree with the hand log", () => {
    const result = run("PBBPBPPBBPBP".repeat(6));
    const bet = result.hands.filter((hand) => hand.result !== null);
    expect(result.bets).toBe(bet.length);
    expect(result.wins).toBe(bet.filter((hand) => hand.result === "win").length);
    expect(result.losses).toBe(bet.filter((hand) => hand.result === "loss").length);
    expect(result.staked).toBeCloseTo(
      bet.reduce((sum, hand) => sum + hand.stake, 0),
      10,
    );
    expect(result.net).toBeCloseTo(
      bet.reduce((sum, hand) => sum + hand.profit, 0),
      10,
    );
    expect(result.perUnit).toBeCloseTo(result.net / result.staked, 10);
    // The running balance on the last bet hand is the shoe's gain/loss.
    expect(bet.at(-1)!.balance).toBeCloseTo(result.net, 10);
  });

  it("group totals add up to the run totals", () => {
    const result = run("PBBPBPPBBPBP".repeat(6));
    const sum = (pick: (group: (typeof result.groups)[number]) => number) =>
      result.groups.reduce((total, group) => total + pick(group), 0);
    expect(sum((group) => group.bets)).toBe(result.bets);
    expect(sum((group) => group.wins)).toBe(result.wins);
    expect(sum((group) => group.staked)).toBeCloseTo(result.staked, 10);
    expect(sum((group) => group.net)).toBeCloseTo(result.net, 10);
  });

  it("is deterministic", () => {
    const pattern = "PBBPBPPBBPBP".repeat(6);
    expect(run(pattern)).toEqual(run(pattern));
  });

  it("honours a changed configuration", () => {
    // Same shape, different numbers: watch 3, groups of 2, 10 rising by 5.
    const result = run("PPP" + "BBBB", {
      config: { lookback: 3, groupSize: 2, baseStake: 10, stakeStep: 5, lastHand: null },
    });
    const stakes = result.hands.map((hand) => hand.stake);
    expect(stakes).toEqual([0, 0, 0, 10, 15, 10, 15]);
    expect(result.groups).toHaveLength(2);

    // Worth spelling out, because a shorter lookback makes the reference hand
    // move into the BET range and that is easy to misread. Hands 4-6 mirror
    // hands 1-3 (all Player) and win; hand 7 mirrors hand 4, which is Banker,
    // so it backs Player into a Banker hand and loses.
    expect(result.hands.map((hand) => hand.bet)).toEqual([
      null,
      null,
      null,
      "banker",
      "banker",
      "banker",
      "player",
    ]);
    expect(result.groups[0]!).toMatchObject({ bets: 2, wins: 2, perfect: true, lostAt: null });
    expect(result.groups[1]!).toMatchObject({ bets: 2, wins: 1, perfect: false, lostAt: 7 });
  });

  it("flags a no-commission table it cannot settle exactly", () => {
    const result = runBettingSystem({
      coups: coups(`${WARMUP}B`),
      rules: { ...DEFAULT_RULES, bankerSixPayout: 0.5 },
    });
    expect(result.approximate).toBe(true);
    // The standard commission game has nothing to approximate.
    expect(run(`${WARMUP}B`).approximate).toBe(false);
  });


  it("does nothing with an empty shoe", () => {
    const result = run("");
    expect(result).toMatchObject({ bets: 0, net: 0, staked: 0, handsAvailable: 0 });
    expect(result.perUnit).toBe(0);
    expect(result.incomplete).toBe(true);
  });

  describe("what to bet next", () => {
    it("counts down the warm-up", () => {
      expect(run("").next).toMatchObject({ hand: 1, skipped: "warm-up", bet: null, stake: 0 });
      expect(run("PPPPP").next).toMatchObject({ hand: 6, skipped: "warm-up", bet: null });
      // The twelfth hand recorded makes the next one the first bet.
      expect(run(WARMUP).next).toMatchObject({ hand: 13, skipped: null, stake: 100 });
    });

    it("names the side and the base stake on a group's first hand", () => {
      const next = run(WARMUP).next;
      expect(next).toMatchObject({
        hand: 13,
        group: 1,
        step: 1,
        bet: "banker", // hand 1 was Player
        referenceHand: 1,
        stake: 100,
      });
    });

    it("climbs the ladder while the group is winning", () => {
      expect(run(`${WARMUP}B`).next).toMatchObject({ step: 2, stake: 200 });
      expect(run(`${WARMUP}BB`).next).toMatchObject({ step: 3, stake: 300 });
      expect(run(`${WARMUP}BBBBB`).next).toMatchObject({ step: 6, stake: 600 });
    });

    it("sits out the rest of a group it has lost", () => {
      // Hand 13 mirrors hand 1 (Player) onto Banker and the hand came Player.
      const next = run(`${WARMUP}P`).next;
      expect(next).toMatchObject({ hand: 14, group: 1, step: 2, skipped: "group-over", stake: 0 });
      expect(next.bet).toBeNull();
    });

    it("comes back at the base stake when the next group opens", () => {
      // Lost hand 13, sat out 14-18; hand 19 opens group 2.
      const next = run(`${WARMUP}PPPPPP`).next;
      expect(next).toMatchObject({ hand: 19, group: 2, step: 1, skipped: null, stake: 100 });
      expect(next.bet).not.toBeNull();
    });

    it("stops for good after the last hand", () => {
      const next = run("PB".repeat(30)).next; // 60 hands recorded
      expect(next).toMatchObject({ hand: 61, skipped: "past-last-hand", bet: null, stake: 0 });
    });

    it("agrees with what the run actually does on the following hand", () => {
      // The strongest check available: predict, then deal the hand and
      // confirm the run placed exactly the bet that was predicted.
      const pattern = "PBBPBPPBBPBP" + "BPBPPBBPPBPB" + "PPBBPBPBBPPB";
      for (let length = 0; length < pattern.length; length += 1) {
        const so_far = pattern.slice(0, length);
        const predicted = run(so_far).next;
        for (const dealt of ["P", "B"]) {
          const after = run(so_far + dealt);
          const played = after.hands.at(-1)!;
          expect(played.hand).toBe(predicted.hand);
          expect(played.bet).toBe(predicted.bet);
          expect(played.stake).toBe(predicted.stake);
          expect(played.skipped).toBe(predicted.skipped);
          expect(played.group).toBe(predicted.group);
          expect(played.step).toBe(predicted.step);
          expect(played.referenceHand).toBe(predicted.referenceHand);
        }
      }
    });

    it("ignores a tie dealt next, because a tie is not a hand", () => {
      const before = run(`${WARMUP}BB`).next;
      const afterTie = run(`${WARMUP}BBT`).next;
      expect(afterTie).toEqual(before);
    });
  });

  it("keeps the specified defaults", () => {
    // These are the rule as it was given; changing one silently changes the
    // system, so they are pinned rather than left to the object literal.
    expect(REVERSE_TWELVE_CONFIG).toEqual({
      lookback: 12,
      groupSize: 6,
      baseStake: 100,
      stakeStep: 100,
      lastHand: 60,
      groupsGateBetting: true,
      maxLadderSteps: 6,
    });
  });

  it("never reaches its ladder cap, because the group ends first", () => {
    // `maxLadderSteps` is 6 here only so the number is honest. A seventh
    // consecutive win inside a group of six does not exist, so the cap can
    // never fire — which is what keeps this system's behaviour unchanged by
    // a field added for the other one.
    const result = run(`${WARMUP}BBBBBB`);
    expect(result.hands.slice(12).map((hand) => hand.stake)).toEqual([
      100, 200, 300, 400, 500, 600,
    ]);
    // Hand 19 opens group 2, which resets regardless.
    expect(run(`${WARMUP}BBBBBBB`).hands[18]!.stake).toBe(100);
  });
});

/**
 * The second system: the same mirror, played on every hand, with a ladder
 * that resets after four wins as well as after any loss.
 *
 * Everything it shares with Reverse 12 is covered above. What is tested here
 * is only the two things that differ — that no hand inside the range is sat
 * out, and where the ladder resets.
 */
describe("Reverse Streak 4", () => {
  const streak = (pattern: string, overrides = {}) =>
    runBettingSystem({
      coups: coups(pattern),
      rules: DEFAULT_RULES,
      system: "reverse-streak-4",
      ...overrides,
    });

  it("keeps the specified defaults", () => {
    expect(REVERSE_STREAK_FOUR_CONFIG).toEqual({
      lookback: 12,
      groupSize: 6,
      baseStake: 100,
      stakeStep: 100,
      lastHand: 60,
      groupsGateBetting: false,
      maxLadderSteps: 4,
    });
  });

  it("still watches the first twelve hands", () => {
    const result = streak(WARMUP);
    expect(result.bets).toBe(0);
    expect(result.hands.every((hand) => hand.skipped === "warm-up")).toBe(true);
    // Twelve hands recorded means the NEXT one is 13, which is live.
    expect(result.next).toMatchObject({ hand: 13, skipped: null, stake: 100, ladderStep: 1 });
    expect(streak(WARMUP.slice(0, 11)).next.skipped).toBe("warm-up");
  });

  it("climbs a step per win and drops to the base after the fourth", () => {
    // Every reference hand is Player, so the bet is always Banker and every
    // Banker result wins. Five straight wins: 100, 200, 300, 400, then back
    // to 100 however the fourth went.
    const result = streak(`${WARMUP}BBBBB`);
    expect(result.hands.slice(12).map((hand) => hand.stake)).toEqual([100, 200, 300, 400, 100]);
    expect(result.hands.slice(12).every((hand) => hand.result === "win")).toBe(true);
    expect(result.bets).toBe(5);
    expect(result.staked).toBe(1100);
    // Banker pays 0.95, so five wins on 1,100 return 1,045 rather than 1,100.
    expect(result.net).toBeCloseTo(1045, 6);
  });

  it("climbs again from the reset rather than stopping there", () => {
    // 100, 200, 300, 400, 100, 200 — the sixth hand is the one an
    // "after four, flat forever" reading would have staked at 100.
    const result = streak(`${WARMUP}BBBBBB`);
    expect(result.hands.slice(12).map((hand) => hand.stake)).toEqual([
      100, 200, 300, 400, 100, 200,
    ]);
  });

  it("returns to the base on the hand after any loss", () => {
    const result = streak(`${WARMUP}BBPB`);
    expect(result.hands.slice(12).map((hand) => hand.stake)).toEqual([100, 200, 300, 100]);
    expect(result.hands.slice(12).map((hand) => hand.result)).toEqual([
      "win",
      "win",
      "loss",
      "win",
    ]);
    // 95 + 190 - 300 + 95
    expect(result.net).toBeCloseTo(80, 6);
  });

  it("bets every hand in the range, so a group never dies", () => {
    const result = streak(`${WARMUP}BBPPPP`);
    expect(result.bets).toBe(6);
    expect(result.hands.slice(12).every((hand) => hand.skipped === null)).toBe(true);
    const [group] = result.groups;
    expect(group).toMatchObject({ group: 1, bets: 6, wins: 2, lostAt: 15, perfect: false });
    // The same hands under Reverse 12 stop dead at the first loss.
    expect(run(`${WARMUP}BBPPPP`).bets).toBe(3);
  });

  it("carries the ladder across a group boundary", () => {
    // Hand 19 opens group 2 with two wins already banked, so it stakes 300 —
    // where Reverse 12 would reopen at 100.
    const result = streak(`${WARMUP}BBBBBBB`);
    expect(result.hands[18]!.stake).toBe(300);
    expect(result.hands[18]!.group).toBe(2);
    expect(result.hands[18]!.step).toBe(1);
    expect(run(`${WARMUP}BBBBBBB`).hands[18]!.stake).toBe(100);
  });

  it("names a clean group only when all six were won", () => {
    expect(streak(`${WARMUP}BBBBBB`).perfectGroups).toBe(1);
    expect(streak(`${WARMUP}BBPBBB`).perfectGroups).toBe(0);
  });

  it("never sits a hand out once it has started", () => {
    // 48 hands in the range and 48 bets, which is the whole of "no hand will
    // have no stake".
    const shoe = `${WARMUP}${"BP".repeat(24)}`;
    const result = streak(shoe);
    expect(result.handsAvailable).toBe(60);
    expect(result.bets).toBe(48);
    expect(result.hands.filter((hand) => hand.skipped === "group-over")).toHaveLength(0);
    expect(result.next.skipped).toBe("past-last-hand");
  });

  it("reports the ladder rung, which is not the group step", () => {
    // Group step 4, ladder rung 2: the loss on hand 15 reset one and not the
    // other, and a card that showed `step` as the stake's position would be
    // naming 400 above a 200 bet.
    const next = streak(`${WARMUP}BBPB`).next;
    expect(next).toMatchObject({ hand: 17, group: 1, step: 5, ladderStep: 2, stake: 200 });
  });

  it("resets the reading after a fourth win", () => {
    const next = streak(`${WARMUP}BBBB`).next;
    expect(next).toMatchObject({ hand: 17, ladderStep: 1, stake: 100 });
  });
});

describe("system selection", () => {
  it("runs the system it is given, not the first one in the list", () => {
    const pattern = `${WARMUP}BBPPPP`;
    expect(runBettingSystem({ coups: coups(pattern), rules: DEFAULT_RULES, system: "reverse-12" }).bets).toBe(3);
    expect(
      runBettingSystem({ coups: coups(pattern), rules: DEFAULT_RULES, system: "reverse-streak-4" })
        .bets,
    ).toBe(6);
  });

  it("names itself, so a card cannot label one system's numbers with another's", () => {
    expect(runBettingSystem({ coups: [], rules: DEFAULT_RULES, system: "reverse-streak-4" })).toMatchObject(
      { id: "reverse-streak-4", name: "Reverse Streak 4" },
    );
  });

  it("falls back to the default for a missing or unknown id", () => {
    expect(bettingSystemById(null).id).toBe("reverse-12");
    expect(bettingSystemById(undefined).id).toBe("reverse-12");
    // A stored id from a build that had a system this one does not.
    expect(bettingSystemById("retired-thing" as never).id).toBe("reverse-12");
    expect(runBettingSystem({ coups: [], rules: DEFAULT_RULES }).id).toBe("reverse-12");
  });

  it("gives every listed system a distinct id and its own defaults", () => {
    const ids = BETTING_SYSTEMS.map((system) => system.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const system of BETTING_SYSTEMS) {
      expect(bettingSystemById(system.id)).toBe(system);
      expect(runBettingSystem({ coups: [], rules: DEFAULT_RULES, system: system.id }).config).toEqual(
        system.defaults,
      );
    }
  });
});

/**
 * A shoe whose bets from hand 13 on come out as `results` says: "W" the
 * mirrored side wins, "L" it loses. Built hand by hand, because each hand's
 * side depends on the hand twelve back.
 */
function shoeFromResults(results: string): string {
  const hands: ("P" | "B")[] = WARMUP.split("") as ("P" | "B")[];
  for (const result of results) {
    const reference = hands[hands.length - 12]!;
    const side = reference === "P" ? "B" : "P";
    hands.push(result === "W" ? side : side === "P" ? "B" : "P");
  }
  return hands.join("");
}

describe("Reverse Streak 4 Martingale", () => {
  const martingale = (results: string) =>
    run(shoeFromResults(results), { system: "reverse-streak-4-martingale" });
  const stakes = (results: string) =>
    martingale(results)
      .hands.filter((hand) => hand.bet !== null)
      .map((hand) => hand.stake);

  it("is listed with its defaults", () => {
    expect(bettingSystemById("reverse-streak-4-martingale")).toMatchObject({
      name: "Reverse Streak 4 Martingale",
      defaults: REVERSE_STREAK_FOUR_MARTINGALE_CONFIG,
    });
    expect(REVERSE_STREAK_FOUR_MARTINGALE_CONFIG).toMatchObject({
      baseStake: 50,
      maxLadderSteps: 4,
      staking: "martingale",
      recoveryWins: 2,
      stopAtNetWins: 8,
      lastHand: 60,
    });
  });

  it("doubles after each loss and drops back to one unit on a win", () => {
    expect(stakes("LLWLW")).toEqual([50, 100, 200, 50, 100]);
    expect(martingale("LLW").next).toMatchObject({ stake: 50, ladderStep: 1, holdNet: null });
  });

  it("holds at 8 units after losing the fourth step, until two net wins", () => {
    // 1, 2, 4, 8 all lose; then 8 is held: W (+1), L (0), W (+1), W (+2) → back to 1.
    expect(stakes("LLLL" + "WLWW" + "L")).toEqual([
      50, 100, 200, 400, 400, 400, 400, 400, 50,
    ]);
  });

  it("reports the hold on the next hand", () => {
    expect(martingale("LLLLW").next).toMatchObject({ stake: 400, ladderStep: 4, holdNet: 1 });
    expect(martingale("LLLLL").next).toMatchObject({ stake: 400, holdNet: -1 });
    expect(martingale("LLLLWW").next).toMatchObject({ stake: 50, ladderStep: 1, holdNet: null });
  });

  it("stops for the rest of the shoe once wins exceed losses by eight", () => {
    const result = martingale("W".repeat(8) + "LWLW");
    expect(result.netHands).toBe(8);
    expect(result.targetReachedAt).toBe(20);
    expect(result.bets).toBe(8);
    expect(result.hands.slice(20).every((hand) => hand.skipped === "target-reached")).toBe(true);
    expect(result.next).toMatchObject({ skipped: "target-reached", bet: null, stake: 0 });
  });

  it("counts net hands across losses on the way to the target", () => {
    const result = martingale("WWLWWWLWWWWW" + "W");
    // 11 wins, 2 losses: +8 on the twelfth bet, so the thirteenth is sat out.
    expect(result.bets).toBe(12);
    expect(result.targetReachedAt).toBe(24);
  });

  it("stops after hand 60 like the other systems", () => {
    // 48 bets in range (hands 13-60), alternating, so the target is never hit.
    const result = martingale("WL".repeat(30));
    expect(result.bets).toBe(48);
    expect(result.targetReachedAt).toBeNull();
    expect(result.hands[60]!.skipped).toBe("past-last-hand");
    expect(result.next.skipped).toBe("past-last-hand");
  });

  it("clips a held stake to the table maximum", () => {
    const result = run(shoeFromResults("LLLL"), {
      system: "reverse-streak-4-martingale",
      tableMax: 300,
    });
    expect(result.next).toMatchObject({ stake: 300, requestedStake: 400, clipped: true });
    expect(result.clippedBets).toBe(1);
  });

  it("leaves the existing systems' stakes unchanged", () => {
    const pattern = shoeFromResults("WWWWWLWWL");
    const streak = run(pattern, { system: "reverse-streak-4" });
    expect(streak.hands.filter((h) => h.bet).map((h) => h.stake)).toEqual([
      100, 200, 300, 400, 100, 200, 100, 200, 300,
    ]);
    expect(streak.targetReachedAt).toBeNull();
    expect(BETTING_SYSTEMS.map((system) => system.id)).toEqual([
      "reverse-12",
      "reverse-streak-4",
      "reverse-streak-4-martingale",
    ]);
  });
});

describe("Reverse Streak 4 Martingale after its target", () => {
  it("opens no reporting groups once it has stopped", () => {
    // Target on hand 20 (group 2, step 2); hands 21-40 are past it.
    const result = run(shoeFromResults("W".repeat(8) + "WL".repeat(10)), {
      system: "reverse-streak-4-martingale",
    });
    expect(result.targetReachedAt).toBe(20);
    expect(result.groups.map((group) => group.group)).toEqual([1, 2]);
    expect(result.groups.every((group) => group.bets > 0)).toBe(true);
    expect(result.hands.slice(20).every((hand) => hand.group === null)).toBe(true);
    // The group holding the target closes on it, not at hand 24.
    expect(result.groups[1]).toMatchObject({ firstHand: 19, lastHand: 20 });
  });
});
