import { RANK_COUNT, VALUE_COUNT } from "./cards";
import {
  bankerDrawsAfterPlayerCard,
  bankerDrawsAfterPlayerStand,
  isNatural,
  playerDraws,
} from "./drawing";
import { valueCounts } from "./shoe";
import type { CoupProbabilities, ShoeState } from "./types";

/**
 * Exact coup probabilities for a given shoe composition.
 *
 * There is no sampling and no approximation here: baccarat's tableau makes
 * every card after the fourth deterministic, so the whole game tree is walked
 * and each leaf weighted by its exact without-replacement probability. The
 * tree is bounded by 55 unordered Player pairs x 55 Banker pairs x 10 x 10
 * third cards, most of which prune, so a full evaluation is a few
 * hundred thousand multiplications — milliseconds, once per coup.
 *
 * This is the only honest source of "what are the odds right now": the
 * composition really does drift as a shoe is dealt, and these numbers move
 * with it. How *far* they move is the sobering part — see `houseEdge` in
 * `ev.ts`.
 */

const MEMO_LIMIT = 256;
const memo = new Map<string, CoupProbabilities>();

function compositionKey(byRank: readonly number[]): string {
  return byRank.join(",");
}

/** Number of ways to choose 2 from n. */
function choose2(n: number): number {
  return n < 2 ? 0 : (n * (n - 1)) / 2;
}

/**
 * P(a hand's first two cards are a pair), and P(both hands are pairs), from
 * the rank counts. Pairs are a rank property, so they cannot be read off the
 * ten point-value buckets the main enumeration uses.
 */
function pairProbabilities(byRank: readonly number[]): {
  single: number;
  both: number;
} {
  let total = 0;
  for (const count of byRank) total += count;
  const firstDraw = choose2(total);
  const secondDraw = choose2(total - 2);
  if (firstDraw === 0 || secondDraw === 0) return { single: 0, both: 0 };

  let single = 0;
  let both = 0;
  for (let r = 0; r < RANK_COUNT; r += 1) {
    const ways = choose2(byRank[r] ?? 0);
    if (ways === 0) continue;
    single += ways / firstDraw;

    let inner = 0;
    for (let s = 0; s < RANK_COUNT; s += 1) {
      const available = (byRank[s] ?? 0) - (s === r ? 2 : 0);
      inner += choose2(available) / secondDraw;
    }
    both += (ways / firstDraw) * inner;
  }
  return { single, both };
}

/**
 * Walk the game tree for the ten point-value buckets.
 *
 * `counts` is mutated in place and restored on the way back up, which keeps the
 * hot loop allocation-free.
 */
function enumerateCoup(counts: Int32Array, total: number) {
  let banker = 0;
  let player = 0;
  let tie = 0;
  let bankerWinsWithSix = 0;
  let fourCards = 0;
  let fiveCards = 0;
  let sixCards = 0;

  const settle = (weight: number, playerTotal: number, bankerTotal: number, cards: number) => {
    if (playerTotal > bankerTotal) {
      player += weight;
    } else if (bankerTotal > playerTotal) {
      banker += weight;
      if (bankerTotal === 6) bankerWinsWithSix += weight;
    } else {
      tie += weight;
    }
    if (cards === 4) fourCards += weight;
    else if (cards === 5) fiveCards += weight;
    else sixCards += weight;
  };

  const afterPlayerPair = total - 2;
  const afterBankerPair = total - 4;

  // Player's two cards, as an unordered pair {a, b}.
  for (let a = 0; a < VALUE_COUNT; a += 1) {
    if (counts[a]! === 0) continue;
    for (let b = a; b < VALUE_COUNT; b += 1) {
      let playerWeight: number;
      if (a === b) {
        if (counts[a]! < 2) continue;
        playerWeight = (counts[a]! / total) * ((counts[a]! - 1) / (total - 1));
      } else {
        if (counts[b]! === 0) continue;
        playerWeight = 2 * (counts[a]! / total) * (counts[b]! / (total - 1));
      }
      counts[a] = counts[a]! - 1;
      counts[b] = counts[b]! - 1;
      const playerInitial = (a + b) % 10;

      // Banker's two cards, as an unordered pair {x, y}.
      for (let x = 0; x < VALUE_COUNT; x += 1) {
        if (counts[x]! === 0) continue;
        for (let y = x; y < VALUE_COUNT; y += 1) {
          let bankerWeight: number;
          if (x === y) {
            if (counts[x]! < 2) continue;
            bankerWeight =
              (counts[x]! / afterPlayerPair) * ((counts[x]! - 1) / (afterPlayerPair - 1));
          } else {
            if (counts[y]! === 0) continue;
            bankerWeight =
              2 * (counts[x]! / afterPlayerPair) * (counts[y]! / (afterPlayerPair - 1));
          }
          const weight = playerWeight * bankerWeight;
          const bankerInitial = (x + y) % 10;
          counts[x] = counts[x]! - 1;
          counts[y] = counts[y]! - 1;

          if (isNatural(playerInitial) || isNatural(bankerInitial)) {
            // A natural freezes both hands.
            settle(weight, playerInitial, bankerInitial, 4);
          } else if (playerDraws(playerInitial)) {
            for (let third = 0; third < VALUE_COUNT; third += 1) {
              if (counts[third]! === 0) continue;
              const drawWeight = weight * (counts[third]! / afterBankerPair);
              const playerFinal = (playerInitial + third) % 10;
              if (bankerDrawsAfterPlayerCard(bankerInitial, third)) {
                counts[third] = counts[third]! - 1;
                const afterThird = afterBankerPair - 1;
                for (let fourth = 0; fourth < VALUE_COUNT; fourth += 1) {
                  if (counts[fourth]! === 0) continue;
                  settle(
                    drawWeight * (counts[fourth]! / afterThird),
                    playerFinal,
                    (bankerInitial + fourth) % 10,
                    6,
                  );
                }
                counts[third] = counts[third]! + 1;
              } else {
                settle(drawWeight, playerFinal, bankerInitial, 5);
              }
            }
          } else if (bankerDrawsAfterPlayerStand(bankerInitial)) {
            for (let fourth = 0; fourth < VALUE_COUNT; fourth += 1) {
              if (counts[fourth]! === 0) continue;
              settle(
                weight * (counts[fourth]! / afterBankerPair),
                playerInitial,
                (bankerInitial + fourth) % 10,
                5,
              );
            }
          } else {
            settle(weight, playerInitial, bankerInitial, 4);
          }

          counts[x] = counts[x]! + 1;
          counts[y] = counts[y]! + 1;
        }
      }

      counts[a] = counts[a]! + 1;
      counts[b] = counts[b]! + 1;
    }
  }

  return { banker, player, tie, bankerWinsWithSix, fourCards, fiveCards, sixCards };
}

/**
 * Exact probabilities for the next coup out of this shoe.
 *
 * Returns null when fewer than six cards remain, because the coup could not be
 * completed and every number would be a guess.
 */
export function coupProbabilities(shoe: ShoeState): CoupProbabilities | null {
  const key = compositionKey(shoe.byRank);
  const cached = memo.get(key);
  if (cached) return cached;

  const values = valueCounts(shoe);
  let total = 0;
  for (const count of values) total += count;
  if (total < 6) return null;

  const counts = Int32Array.from(values);
  const main = enumerateCoup(counts, total);
  const pairs = pairProbabilities(shoe.byRank);

  const result: CoupProbabilities = {
    ...main,
    playerPair: pairs.single,
    bankerPair: pairs.single,
    eitherPair: 2 * pairs.single - pairs.both,
  };

  if (memo.size >= MEMO_LIMIT) {
    const oldest = memo.keys().next();
    if (!oldest.done) memo.delete(oldest.value);
  }
  memo.set(key, result);
  return result;
}

/** Drop the memo table. Exposed for tests and for long-lived processes. */
export function clearProbabilityCache(): void {
  memo.clear();
}
