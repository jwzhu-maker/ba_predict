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

/**
 * A limit that is currently reached, and the number it was set to.
 *
 * The VALUE is carried, not just the kind, because it is what makes an
 * answer specific: raising a reached stop-loss from 1000 to 1500 while
 * 2000 down leaves the same kind standing, and an answer given for the old
 * number was never given for the new one. Comparing both is what re-arms
 * the interruption when a limit is moved and the session is still past it.
 */
export interface ReachedStop {
  kind: StopKind;
  /** The limit itself, as profit from where the session opened. */
  limit: number;
}

export function reachedStop(session: SessionState): ReachedStop | null {
  const { bankroll, startingBankroll, stopWin, stopLoss } = session.bankroll;
  const profit = bankroll - startingBankroll;
  if (stopWin !== null && profit >= stopWin) return { kind: "stop-win", limit: stopWin };
  if (stopLoss !== null && -profit >= stopLoss) return { kind: "stop-loss", limit: stopLoss };
  return null;
}

/** Whether two limits are the same limit, set to the same number. */
export function sameStop(a: ReachedStop | null, b: ReachedStop | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.limit === b.limit;
}

/** How far past the limit the session is, as a positive amount. */
export function stopProfit(session: SessionState, kind: StopKind): number {
  const profit = session.bankroll.bankroll - session.bankroll.startingBankroll;
  return kind === "stop-win" ? profit : -profit;
}
