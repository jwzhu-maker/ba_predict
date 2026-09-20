import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "../types";
import type { CoupRecord, Outcome } from "../types";
import { REVERSE_TWELVE_CONFIG, runBettingSystem } from "../systems";

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

  it("clips a stake to the table maximum when one is set", () => {
    const result = run(`${WARMUP}BBBBBB`, { tableMax: 250 });
    expect(result.hands.map((h) => h.stake).filter((s) => s > 0)).toEqual([
      100, 200, 250, 250, 250, 250,
    ]);
    expect(result.peakStake).toBe(250);
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
    });
  });
});
