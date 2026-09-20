import { describe, expect, it } from "vitest";
import { valuateBet } from "../ev";
import { coupProbabilities } from "../odds";
import { DEFAULT_PROGRESSION_OPTIONS } from "../progressions";
import { flatBetRuinProbability, simulateSessions } from "../risk";
import { createShoe } from "../shoe";
import { DEFAULT_RULES } from "../types";

const probabilities = coupProbabilities(createShoe(8))!;
const banker = valuateBet("banker", probabilities, DEFAULT_RULES);
const player = valuateBet("player", probabilities, DEFAULT_RULES);

describe("flatBetRuinProbability", () => {
  it("is a coin flip on a fair game with an equal target", () => {
    expect(
      flatBetRuinProbability({
        winProbability: 0.5,
        lossProbability: 0.5,
        bankrollUnits: 100,
        targetUnits: 100,
      }),
    ).toBeCloseTo(0.5, 9);
  });

  it("scales with the target on a fair game", () => {
    expect(
      flatBetRuinProbability({
        winProbability: 0.5,
        lossProbability: 0.5,
        bankrollUnits: 100,
        targetUnits: 300,
      }),
    ).toBeCloseTo(0.75, 9);
  });

  it("is certain when the edge is against you and you never stop", () => {
    expect(
      flatBetRuinProbability({
        winProbability: player.winProbability,
        lossProbability: 1 - player.winProbability - player.pushProbability,
        bankrollUnits: 1000,
        targetUnits: null,
      }),
    ).toBe(1);
  });

  it("leaves a survival chance when the edge is with you", () => {
    const ruin = flatBetRuinProbability({
      winProbability: 0.52,
      lossProbability: 0.48,
      bankrollUnits: 50,
      targetUnits: null,
    });
    expect(ruin).toBeGreaterThan(0);
    expect(ruin).toBeLessThan(1);
    // Classic gambler's ruin: with the edge in your favour and no target,
    // the chance of ever going broke is (q/p)^N -- small, but not zero.
    expect(ruin).toBeCloseTo((0.48 / 0.52) ** 50, 9);
  });

  it("stays finite for a target far out of reach", () => {
    const ruin = flatBetRuinProbability({
      winProbability: 0.4462,
      lossProbability: 0.4586,
      bankrollUnits: 100,
      targetUnits: 100_000,
    });
    expect(Number.isFinite(ruin)).toBe(true);
    expect(ruin).toBeGreaterThan(0.99);
    expect(ruin).toBeLessThanOrEqual(1);
  });
});

describe("simulateSessions", () => {
  const base = {
    bankrollUnits: 100,
    coupsPerSession: 100,
    stopWinUnits: null,
    stopLossUnits: null,
    trials: 4000,
    seed: 20260920,
  } as const;

  it("pays the theoretical house edge whatever the progression", () => {
    // This is the whole argument against staking systems, as a test: the
    // expected loss is the edge times the total action, and no ladder of
    // stakes touches either factor.
    //
    // It needs more trials than the tests below. The estimator is a ratio of
    // two heavy-tailed sums -- a Martingale's action is dominated by the rare
    // session that doubles six times -- so at 4,000 trials the sample error
    // is larger than the quantity being measured. Fixed seed, so this is
    // deterministic rather than merely usually-true.
    const trials = 60_000;
    const flat = simulateSessions({ ...base, trials, payoffs: banker.payoffs, progression: "flat" });
    const martingale = simulateSessions({
      ...base,
      trials,
      payoffs: banker.payoffs,
      progression: "martingale",
      progressionOptions: { ...DEFAULT_PROGRESSION_OPTIONS, maxUnits: 1_000_000 },
    });
    expect(Math.abs(flat.impliedEdge - banker.houseEdge)).toBeLessThan(0.001);
    expect(Math.abs(martingale.impliedEdge - banker.houseEdge)).toBeLessThan(0.003);
  });

  it("gives a Martingale a high win rate and a fat left tail", () => {
    const martingale = simulateSessions({
      ...base,
      payoffs: player.payoffs,
      progression: "martingale",
      progressionOptions: { ...DEFAULT_PROGRESSION_OPTIONS, maxUnits: 1_000_000 },
    });
    const flat = simulateSessions({ ...base, payoffs: player.payoffs, progression: "flat" });
    // Wins more often than flat betting...
    expect(martingale.medianResultUnits).toBeGreaterThan(flat.medianResultUnits);
    // ...and loses far more when it loses.
    expect(martingale.worstUnits).toBeLessThan(flat.worstUnits);
    expect(martingale.percentile5Units).toBeLessThan(flat.percentile5Units);
    expect(martingale.ruinRate).toBeGreaterThan(flat.ruinRate);
  });

  it("breaks a Martingale against a table ceiling", () => {
    const capped = simulateSessions({
      ...base,
      payoffs: player.payoffs,
      progression: "martingale",
      progressionOptions: { ...DEFAULT_PROGRESSION_OPTIONS, maxUnits: 8 },
    });
    // With a ceiling of 8 units, four losses in a row end the session.
    expect(capped.tableLimitRate).toBeGreaterThan(0.5);
  });

  it("never lets a flat bettor lose more than the bankroll", () => {
    const flat = simulateSessions({
      ...base,
      trials: 1000,
      payoffs: player.payoffs,
      progression: "flat",
      coupsPerSession: 2000,
    });
    expect(flat.worstUnits).toBeGreaterThanOrEqual(-base.bankrollUnits);
    expect(flat.meanResultUnits).toBeLessThan(0);
  });

  it("ruins a flat bettor given enough coups", () => {
    // The edge does not need a staking system to finish the job; it only
    // needs time. Twenty units at one unit a coup is gone 92% of the time
    // inside five thousand hands, and the survivors are behind too.
    const grind = simulateSessions({
      ...base,
      trials: 2000,
      payoffs: player.payoffs,
      progression: "flat",
      bankrollUnits: 20,
      coupsPerSession: 5000,
    });
    expect(grind.ruinRate).toBeGreaterThan(0.85);
    expect(grind.meanResultUnits).toBeLessThan(-10);
  });

  it("honours stop-win and stop-loss", () => {
    const stopped = simulateSessions({
      ...base,
      payoffs: player.payoffs,
      progression: "flat",
      stopWinUnits: 10,
      stopLossUnits: 10,
      coupsPerSession: 2000,
    });
    expect(stopped.endings["stop-win"] + stopped.endings["stop-loss"]).toBeGreaterThan(
      base.trials * 0.9,
    );
    // A fair-looking coin with a small edge against you: slightly more stop-losses.
    expect(stopped.endings["stop-loss"]).toBeGreaterThan(stopped.endings["stop-win"]);
  });

  it("is reproducible for a given seed", () => {
    const config = { ...base, payoffs: banker.payoffs, progression: "flat" } as const;
    expect(simulateSessions(config)).toEqual(simulateSessions(config));
  });

  it("accounts for every trial", () => {
    const result = simulateSessions({ ...base, payoffs: banker.payoffs, progression: "flat" });
    const total = Object.values(result.endings).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(base.trials);
  });
});

describe("winning session rate", () => {
  it("counts sessions that finished up, not sessions that hit a stop", () => {
    const result = simulateSessions({
      payoffs: banker.payoffs,
      bankrollUnits: 100,
      coupsPerSession: 100,
      stopWinUnits: 20,
      stopLossUnits: 40,
      trials: 4000,
      seed: 20260920,
      progression: "flat",
    });
    // Almost nobody reaches +20 units inside 100 coups, but close to half
    // finish the session ahead. Conflating the two understates by ~20x.
    expect(result.endings["stop-win"] / result.trials).toBeLessThan(0.1);
    expect(result.winningSessionRate).toBeGreaterThan(0.35);
    expect(result.winningSessionRate).toBeLessThan(0.5);
  });

  it("agrees with the median's sign", () => {
    const result = simulateSessions({
      payoffs: banker.payoffs,
      bankrollUnits: 100,
      coupsPerSession: 100,
      stopWinUnits: null,
      stopLossUnits: null,
      trials: 4000,
      seed: 7,
      progression: "martingale",
      progressionOptions: { ...DEFAULT_PROGRESSION_OPTIONS, maxUnits: 1_000_000 },
    });
    // A Martingale wins most sessions; that is exactly its selling point.
    expect(result.winningSessionRate).toBeGreaterThan(0.5);
    expect(result.medianResultUnits).toBeGreaterThan(0);
  });
});
