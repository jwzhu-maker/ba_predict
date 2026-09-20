import type { SessionState } from "@ba-predict/engine";

/**
 * Whether the session has hit a limit the player set for it.
 *
 * The advisor already refuses to size a bet past either limit, and says so
 * in the Bet card — but only to a player who happens to read it. A limit is
 * the one thing in this app worth interrupting for, so the clients raise a
 * modal on the crossing and this is the single definition they both raise
 * it from.
 *
 * Deliberately the same arithmetic, in the same order, as `recommendBet`:
 * profit measured from where the session opened, stop-win before stop-loss,
 * `>=` so the limit counts as reached the moment it is touched. Two
 * definitions of "you are at your limit" that could disagree would be worse
 * than no modal at all.
 */
export type StopKind = "stop-win" | "stop-loss";

export function reachedStop(session: SessionState): StopKind | null {
  const { bankroll, startingBankroll, stopWin, stopLoss } = session.bankroll;
  const profit = bankroll - startingBankroll;
  if (stopWin !== null && profit >= stopWin) return "stop-win";
  if (stopLoss !== null && -profit >= stopLoss) return "stop-loss";
  return null;
}

/** How far past the limit the session is, as a positive amount. */
export function stopProfit(session: SessionState, kind: StopKind): number {
  const profit = session.bankroll.bankroll - session.bankroll.startingBankroll;
  return kind === "stop-win" ? profit : -profit;
}
