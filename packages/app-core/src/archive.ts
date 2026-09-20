import { sessionStats, type ProgressionId, type SessionState } from "@ba-predict/engine";

/**
 * Session history.
 *
 * A session is archived when it is closed, and only if it actually had action
 * — an untouched session is not a night out, and filling the list with empty
 * rows would make the one number this screen exists for (what the habit costs
 * over time) harder to read rather than easier.
 */

export interface ArchivedSession {
  id: string;
  startedAt: number;
  endedAt: number;
  progression: ProgressionId;
  startingBankroll: number;
  endingBankroll: number;
  netProfit: number;
  totalWagered: number;
  coups: number;
  wagers: number;
  wins: number;
  losses: number;
  pushes: number;
  maxDrawdown: number;
  /** Net profit over total staked, as a positive cost. */
  actualEdge: number;
}

/** How many sessions to keep. Old ones fall off the end. */
export const ARCHIVE_LIMIT = 200;

/**
 * Summarise a session for the archive, or null when it never placed a wager.
 */
export function archiveSession(session: SessionState, endedAt: number): ArchivedSession | null {
  const stats = sessionStats(session);
  if (stats.wagers === 0) return null;
  return {
    id: `${session.startedAt}-${endedAt}`,
    startedAt: session.startedAt,
    endedAt,
    progression: session.progression.id,
    startingBankroll: session.bankroll.startingBankroll,
    endingBankroll: session.bankroll.bankroll,
    netProfit: stats.netProfit,
    totalWagered: stats.totalWagered,
    coups: stats.coups,
    wagers: stats.wagers,
    wins: stats.wins,
    losses: stats.losses,
    pushes: stats.pushes,
    maxDrawdown: stats.maxDrawdown,
    actualEdge: stats.actualEdge,
  };
}

export interface LifetimeStats {
  sessions: number;
  netProfit: number;
  totalWagered: number;
  wagers: number;
  wins: number;
  losses: number;
  pushes: number;
  coups: number;
  /** Sessions that finished up. */
  winningSessions: number;
  /** Deepest single-session drawdown seen. */
  worstDrawdown: number;
  /**
   * Biggest losing and winning nights, or null when there has not been one.
   *
   * Null rather than zero: "worst night: 0.00" reads as a session that broke
   * even, which is a different claim from never having lost.
   */
  worstSession: number | null;
  bestSession: number | null;
  /**
   * What the play has actually cost, as a fraction of everything staked.
   *
   * This is the number the screen exists for. Over enough sessions it
   * converges on the table's edge, and seeing it do so is more convincing
   * than being told it will.
   */
  actualEdge: number;
}

/**
 * Totals across the archive, optionally including the session still running.
 *
 * The live session counts by default: leaving it out would let a bad night in
 * progress sit outside the only figure that describes the habit.
 */
export function lifetimeStats(
  archive: readonly ArchivedSession[],
  current?: SessionState,
): LifetimeStats {
  const rows: Pick<
    ArchivedSession,
    | "netProfit"
    | "totalWagered"
    | "wagers"
    | "wins"
    | "losses"
    | "pushes"
    | "coups"
    | "maxDrawdown"
  >[] = [...archive];

  if (current) {
    const stats = sessionStats(current);
    if (stats.wagers > 0) rows.push(stats);
  }

  const totals: LifetimeStats = {
    sessions: rows.length,
    netProfit: 0,
    totalWagered: 0,
    wagers: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    coups: 0,
    winningSessions: 0,
    worstDrawdown: 0,
    worstSession: null,
    bestSession: null,
    actualEdge: 0,
  };

  for (const row of rows) {
    totals.netProfit += row.netProfit;
    totals.totalWagered += row.totalWagered;
    totals.wagers += row.wagers;
    totals.wins += row.wins;
    totals.losses += row.losses;
    totals.pushes += row.pushes;
    totals.coups += row.coups;
    if (row.netProfit > 0) totals.winningSessions += 1;
    if (row.maxDrawdown > totals.worstDrawdown) totals.worstDrawdown = row.maxDrawdown;
    if (row.netProfit < 0 && (totals.worstSession === null || row.netProfit < totals.worstSession)) {
      totals.worstSession = row.netProfit;
    }
    if (row.netProfit > 0 && (totals.bestSession === null || row.netProfit > totals.bestSession)) {
      totals.bestSession = row.netProfit;
    }
  }

  totals.actualEdge = totals.totalWagered === 0 ? 0 : -totals.netProfit / totals.totalWagered;
  return totals;
}
