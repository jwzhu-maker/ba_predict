import { DEFAULT_PROGRESSION_OPTIONS, DEFAULT_RULES, type CoupRecord, type Outcome } from "@ba-predict/engine";
import { describe, expect, it } from "vitest";
import { isReplayableBet, replayStrategies, REPLAYABLE_BETS } from "../replay";

function coups(outcomes: readonly Outcome[]): CoupRecord[] {
  return outcomes.map((outcome) => ({ outcome, playerPair: false, bankerPair: false }));
}

const options = {
  rules: DEFAULT_RULES,
  bet: "banker" as const,
  progressionOptions: { ...DEFAULT_PROGRESSION_OPTIONS, maxUnits: 1000 },
  bankrollUnits: 1000,
};

describe("replayStrategies", () => {
  it("returns a row per staking plan, best first", () => {
    const replay = replayStrategies({ ...options, coups: coups(["banker", "player", "banker"]) });
    expect(replay.rows).toHaveLength(10);
    for (let i = 1; i < replay.rows.length; i += 1) {
      expect(replay.rows[i]!.netUnits).toBeLessThanOrEqual(replay.rows[i - 1]!.netUnits);
    }
  });

  it("is deterministic — it replays real results, it does not sample", () => {
    const shoe = coups(["banker", "banker", "player", "tie", "player", "banker"]);
    expect(replayStrategies({ ...options, coups: shoe })).toEqual(
      replayStrategies({ ...options, coups: shoe }),
    );
  });

  it("settles flat betting exactly, commission included", () => {
    // Two Banker wins (+0.95 each), one Player win (-1), one tie (push).
    const replay = replayStrategies({
      ...options,
      coups: coups(["banker", "banker", "player", "tie"]),
    });
    const flat = replay.rows.find((row) => row.progression === "flat")!;
    expect(flat.wagers).toBe(4);
    expect(flat.wins).toBe(2);
    expect(flat.losses).toBe(1);
    expect(flat.pushes).toBe(1);
    expect(flat.totalStakedUnits).toBe(4);
    expect(flat.netUnits).toBeCloseTo(0.9, 10);
  });

  it("gives a Martingale a bigger peak stake than flat on the same shoe", () => {
    const shoe = coups(["player", "player", "player", "banker"]);
    const replay = replayStrategies({ ...options, coups: shoe });
    const flat = replay.rows.find((r) => r.progression === "flat")!;
    const martingale = replay.rows.find((r) => r.progression === "martingale")!;
    expect(flat.peakStakeUnits).toBe(1);
    expect(martingale.peakStakeUnits).toBe(8);
    // Three losses then a win: 1+2+4 lost, 8 staked and won at 0.95.
    expect(martingale.netUnits).toBeCloseTo(-7 + 7.6, 10);
  });

  it("stops a plan that outruns the table, and says so", () => {
    const replay = replayStrategies({
      ...options,
      progressionOptions: { ...DEFAULT_PROGRESSION_OPTIONS, maxUnits: 4 },
      coups: coups(["player", "player", "player", "player", "banker"]),
    });
    const martingale = replay.rows.find((r) => r.progression === "martingale")!;
    expect(martingale.brokeDownReason).toBe("table-limit");
    expect(martingale.brokeDownAt).toBe(3);
    // The coups after the breakdown are not counted: it was not playing them.
    expect(martingale.wagers).toBe(3);
  });

  it("stops a plan that outruns the bankroll", () => {
    const replay = replayStrategies({
      ...options,
      bankrollUnits: 5,
      coups: coups(["player", "player", "player", "player"]),
    });
    const martingale = replay.rows.find((r) => r.progression === "martingale")!;
    expect(martingale.brokeDownReason).toBe("bankroll");
    expect(martingale.netUnits).toBeGreaterThanOrEqual(-5);
  });

  it("leaves flat betting alone on a shoe no plan can break", () => {
    const replay = replayStrategies({ ...options, coups: coups(["banker", "banker"]) });
    const flat = replay.rows.find((r) => r.progression === "flat")!;
    expect(flat.brokeDownAt).toBeNull();
    expect(flat.brokeDownReason).toBeNull();
  });

  it("reports the cost each plan paid for its own action", () => {
    const replay = replayStrategies({
      ...options,
      coups: coups(["player", "banker", "player", "banker"]),
    });
    for (const row of replay.rows) {
      if (row.totalStakedUnits === 0) continue;
      expect(row.actualEdge).toBeCloseTo(-row.netUnits / row.totalStakedUnits, 10);
    }
  });

  it("handles an empty shoe without dividing by zero", () => {
    const replay = replayStrategies({ ...options, coups: [] });
    expect(replay.coups).toBe(0);
    for (const row of replay.rows) {
      expect(row.wagers).toBe(0);
      expect(row.netUnits).toBe(0);
      expect(row.actualEdge).toBe(0);
    }
  });

  it("settles pair bets off the recorded flags", () => {
    const shoe: CoupRecord[] = [
      { outcome: "player", playerPair: true, bankerPair: false },
      { outcome: "banker", playerPair: false, bankerPair: false },
    ];
    const replay = replayStrategies({ ...options, bet: "playerPair", coups: shoe });
    const flat = replay.rows.find((r) => r.progression === "flat")!;
    // 11:1 on the hit, -1 on the miss.
    expect(flat.netUnits).toBeCloseTo(10, 10);
  });

  it("flags a replay it could not settle exactly", () => {
    // A no-commission table pays less on a Banker win with 6, and a recorded
    // coup does not carry the winning total.
    const replay = replayStrategies({
      ...options,
      rules: { ...DEFAULT_RULES, bankerSixPayout: 0.5 },
      coups: coups(["banker", "player"]),
    });
    expect(replay.approximate).toBe(true);

    const exact = replayStrategies({ ...options, coups: coups(["banker", "player"]) });
    expect(exact.approximate).toBe(false);
  });

  it("only offers bets a recorded coup can settle", () => {
    expect(isReplayableBet("banker")).toBe(true);
    expect(isReplayableBet("eitherPair")).toBe(true);
    // Big/Small need the card count, which a recorded coup does not carry.
    expect(isReplayableBet("big")).toBe(false);
    expect(isReplayableBet("small")).toBe(false);
    expect(REPLAYABLE_BETS).toHaveLength(6);
  });
});
