import { describe, expect, it } from "vitest";
import { CARDS_PER_RANK_PER_DECK, RANK_COUNT, RANK_VALUES } from "../cards";
import {
  bankerDrawsAfterPlayerCard,
  bankerDrawsAfterPlayerStand,
  isNatural,
  playerDraws,
} from "../drawing";
import { coupProbabilities } from "../odds";
import { createShoe } from "../shoe";

/**
 * Independent cross-check of the enumeration.
 *
 * `odds.ts` computes probabilities by weighting a game tree. This deals actual
 * cards instead, one coup at a time off a full shoe, and counts what happens.
 * The two share the drawing rules (already pinned by the published figures in
 * odds.test.ts) but nothing else — in particular this touches none of the
 * without-replacement weighting, which is where a combinatorial bug would
 * hide and where it would be invisible to a "the numbers look plausible" read.
 */

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DECKS = 8;
const TOTAL_CARDS = DECKS * RANK_COUNT * CARDS_PER_RANK_PER_DECK;
const TRIALS = 1_000_000;

describe("enumeration vs dealt cards", () => {
  it("agrees with a million coups dealt off a full 8-deck shoe", () => {
    const random = createRandom(0xbacca7);
    const counts = new Int32Array(RANK_COUNT).fill(DECKS * CARDS_PER_RANK_PER_DECK);

    let remaining = TOTAL_CARDS;
    const drawn: number[] = [];

    const draw = (): number => {
      let pick = Math.floor(random() * remaining);
      for (let rank = 0; rank < RANK_COUNT; rank += 1) {
        const available = counts[rank] ?? 0;
        if (pick < available) {
          counts[rank] = available - 1;
          remaining -= 1;
          drawn.push(rank);
          return rank;
        }
        pick -= available;
      }
      throw new Error("shoe exhausted");
    };

    const restore = () => {
      for (const rank of drawn) counts[rank] = (counts[rank] ?? 0) + 1;
      remaining += drawn.length;
      drawn.length = 0;
    };

    const value = (rank: number): number => RANK_VALUES[rank] ?? 0;

    let banker = 0;
    let player = 0;
    let tie = 0;
    let fourCards = 0;
    let playerPair = 0;
    let bankerPair = 0;
    let eitherPair = 0;

    for (let trial = 0; trial < TRIALS; trial += 1) {
      const p1 = draw();
      const b1 = draw();
      const p2 = draw();
      const b2 = draw();

      const isPlayerPair = p1 === p2;
      const isBankerPair = b1 === b2;
      if (isPlayerPair) playerPair += 1;
      if (isBankerPair) bankerPair += 1;
      if (isPlayerPair || isBankerPair) eitherPair += 1;

      let playerTotal = (value(p1) + value(p2)) % 10;
      let bankerTotal = (value(b1) + value(b2)) % 10;
      let cards = 4;

      if (!isNatural(playerTotal) && !isNatural(bankerTotal)) {
        if (playerDraws(playerTotal)) {
          const third = value(draw());
          cards += 1;
          playerTotal = (playerTotal + third) % 10;
          if (bankerDrawsAfterPlayerCard(bankerTotal, third)) {
            bankerTotal = (bankerTotal + value(draw())) % 10;
            cards += 1;
          }
        } else if (bankerDrawsAfterPlayerStand(bankerTotal)) {
          bankerTotal = (bankerTotal + value(draw())) % 10;
          cards += 1;
        }
      }

      if (bankerTotal > playerTotal) banker += 1;
      else if (playerTotal > bankerTotal) player += 1;
      else tie += 1;
      if (cards === 4) fourCards += 1;

      restore();
    }

    const exact = coupProbabilities(createShoe(DECKS))!;

    // Four standard errors at a million trials is roughly 0.002.
    expect(banker / TRIALS).toBeCloseTo(exact.banker, 2);
    expect(player / TRIALS).toBeCloseTo(exact.player, 2);
    expect(tie / TRIALS).toBeCloseTo(exact.tie, 2);
    expect(fourCards / TRIALS).toBeCloseTo(exact.fourCards, 2);
    expect(playerPair / TRIALS).toBeCloseTo(exact.playerPair, 2);
    expect(bankerPair / TRIALS).toBeCloseTo(exact.bankerPair, 2);
    expect(eitherPair / TRIALS).toBeCloseTo(exact.eitherPair, 2);

    // Tighter than toBeCloseTo(…, 2) on the three that matter most.
    expect(Math.abs(banker / TRIALS - exact.banker)).toBeLessThan(0.002);
    expect(Math.abs(player / TRIALS - exact.player)).toBeLessThan(0.002);
    expect(Math.abs(tie / TRIALS - exact.tie)).toBeLessThan(0.002);
  });
});
