import { DEFAULT_BANKROLL, DEFAULT_RULES } from "@ba-predict/engine";
import { describe, expect, it } from "vitest";
import { createInitialState } from "../reducer";
import { deserializeState, serializeState } from "../storage";

/**
 * What a fresh install opens with.
 *
 * Pinned because these are a product decision, not an implementation
 * detail: every one of them is a number somebody would otherwise have to
 * set by hand on a phone, standing at a table, before the app is any use.
 */
describe("the table a fresh install assumes", () => {
  const { session } = createInitialState();

  it("is a no-commission table", () => {
    expect(session.rules.bankerSixPayout).toBe(0.5);
  });

  it("opens on 3000, staked in units of the table minimum", () => {
    expect(session.bankroll.bankroll).toBe(3000);
    expect(session.bankroll.startingBankroll).toBe(3000);
    expect(session.bankroll.unitSize).toBe(session.bankroll.tableMin);
  });

  it("sits at a 50 to 10,000 table", () => {
    expect(session.bankroll.tableMin).toBe(50);
    expect(session.bankroll.tableMax).toBe(10_000);
  });

  it("carries both limits, as profit from where the session opened", () => {
    expect(session.bankroll.stopWin).toBe(3300);
    expect(session.bankroll.stopLoss).toBe(1000);
  });

  it("does not start out already at a limit", () => {
    // A default that opens on its own stop-win would put a dialog in front
    // of the app before a card was dealt.
    expect(session.bankroll.bankroll - session.bankroll.startingBankroll).toBe(0);
  });

  it("leaves the engine's textbook table alone", () => {
    // The engine's defaults are the commission game its pricing tests are
    // written against. What the APP opens with is a separate decision, and
    // this is the line that keeps the two from being confused for each
    // other.
    expect(DEFAULT_RULES.bankerSixPayout).toBeNull();
    expect(DEFAULT_BANKROLL.bankroll).toBe(1000);
  });

  it("never overwrites settings somebody has already made", () => {
    // Defaults are for a first launch only. A stored payload wins, right
    // down to a table this build would not have chosen.
    const stored = createInitialState();
    stored.session.bankroll.bankroll = 250;
    stored.session.bankroll.tableMin = 5;
    stored.session.rules.bankerSixPayout = null;

    const restored = deserializeState(serializeState(stored));
    expect(restored.session.bankroll.bankroll).toBe(250);
    expect(restored.session.bankroll.tableMin).toBe(5);
    expect(restored.session.rules.bankerSixPayout).toBeNull();
  });
});
