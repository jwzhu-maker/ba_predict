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
  // Date the sitting from the first wager. The session object may have been
  // created at launch hours earlier, and counting that idle time as play
  // makes the duration column fiction.
  const startedAt = session.firstWagerAt ?? session.startedAt;
  return {
    id: `${startedAt}-${endedAt}`,
    startedAt,
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

/** A numeric field of an archived session, for validation. */
const NUMERIC_FIELDS = [
  "startedAt",
  "endedAt",
  "startingBankroll",
  "endingBankroll",
  "netProfit",
  "totalWagered",
  "coups",
  "wagers",
  "wins",
  "losses",
  "pushes",
  "maxDrawdown",
  "actualEdge",
] as const;

/**
 * Whether a value read back from storage is a usable archived session.
 *
 * Checking only that the archive is an array let a corrupt or
 * older-schema payload through with `null` or partial entries in it, and the
 * History screen then threw while summing them — which is exactly the crash
 * `deserializeState` exists to prevent.
 */
export function isArchivedSession(value: unknown): value is ArchivedSession {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.progression !== "string") return false;
  return NUMERIC_FIELDS.every((field) => Number.isFinite(row[field]));
}

/**
 * Totals for sessions that have aged out of the archive.
 *
 * The archive is capped, but the History screen calls its numbers "lifetime".
 * Without carrying the dropped rows forward, those figures would quietly
 * become a rolling window at session 201 — and understating what the habit
 * has cost is the one direction this app must not be wrong in.
 */
export interface EvictedTotals {
  sessions: number;
  netProfit: number;
  totalWagered: number;
  wagers: number;
  wins: number;
  losses: number;
  pushes: number;
  coups: number;
  winningSessions: number;
  worstDrawdown: number;
  worstSession: number | null;
  bestSession: number | null;
}

export const EMPTY_EVICTED: EvictedTotals = {
  sessions: 0,
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
};

const EVICTED_NUMERIC = [
  "sessions",
  "netProfit",
  "totalWagered",
  "wagers",
  "wins",
  "losses",
  "pushes",
  "coups",
  "winningSessions",
  "worstDrawdown",
] as const;

/**
 * Read an `evicted` block back from storage, or fall back to empty.
 *
 * Spreading the stored object over the defaults was not validation: a
 * `{ sessions: "oops" }` payload replaced a number with a string, and
 * `lifetimeStats` then seeds its arithmetic from it and concatenates instead
 * of adding. These are aggregates, so a partially valid one means nothing —
 * the whole block is discarded rather than half-trusted.
 */
export function parseEvictedTotals(value: unknown): EvictedTotals {
  if (typeof value !== "object" || value === null) return EMPTY_EVICTED;
  const row = value as Record<string, unknown>;
  if (!EVICTED_NUMERIC.every((field) => Number.isFinite(row[field]))) return EMPTY_EVICTED;
  const nullableNumber = (candidate: unknown) =>
    candidate === null || Number.isFinite(candidate);
  if (!nullableNumber(row.worstSession) || !nullableNumber(row.bestSession)) {
    return EMPTY_EVICTED;
  }
  return {
    sessions: row.sessions as number,
    netProfit: row.netProfit as number,
    totalWagered: row.totalWagered as number,
    wagers: row.wagers as number,
    wins: row.wins as number,
    losses: row.losses as number,
    pushes: row.pushes as number,
    coups: row.coups as number,
    winningSessions: row.winningSessions as number,
    worstDrawdown: row.worstDrawdown as number,
    worstSession: (row.worstSession as number | null) ?? null,
    bestSession: (row.bestSession as number | null) ?? null,
  };
}

/** Fold a session about to be dropped into the running totals. */
export function foldEvicted(totals: EvictedTotals, row: ArchivedSession): EvictedTotals {
  return {
    sessions: totals.sessions + 1,
    netProfit: totals.netProfit + row.netProfit,
    totalWagered: totals.totalWagered + row.totalWagered,
    wagers: totals.wagers + row.wagers,
    wins: totals.wins + row.wins,
    losses: totals.losses + row.losses,
    pushes: totals.pushes + row.pushes,
    coups: totals.coups + row.coups,
    winningSessions: totals.winningSessions + (row.netProfit > 0 ? 1 : 0),
    worstDrawdown: Math.max(totals.worstDrawdown, row.maxDrawdown),
    worstSession:
      row.netProfit < 0
        ? totals.worstSession === null
          ? row.netProfit
          : Math.min(totals.worstSession, row.netProfit)
        : totals.worstSession,
    bestSession:
      row.netProfit > 0
        ? totals.bestSession === null
          ? row.netProfit
          : Math.max(totals.bestSession, row.netProfit)
        : totals.bestSession,
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
  evicted: EvictedTotals = EMPTY_EVICTED,
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

  // Seeded with the sessions that have aged out, so "lifetime" stays true.
  const totals: LifetimeStats = {
    sessions: rows.length + evicted.sessions,
    netProfit: evicted.netProfit,
    totalWagered: evicted.totalWagered,
    wagers: evicted.wagers,
    wins: evicted.wins,
    losses: evicted.losses,
    pushes: evicted.pushes,
    coups: evicted.coups,
    winningSessions: evicted.winningSessions,
    worstDrawdown: evicted.worstDrawdown,
    worstSession: evicted.worstSession,
    bestSession: evicted.bestSession,
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
