import type { CoupRecord, Outcome } from "@ba-predict/engine";

/**
 * Finished shoes, kept so strategy success rates can be computed over real
 * play rather than over one shoe.
 *
 * Coups are stored as a STRING, one character per coup, rather than as
 * objects. A shoe is 60-80 coups and a regular player will bank hundreds of
 * shoes; as JSON objects that is megabytes, and the whole app lives inside a
 * ~5MB localStorage budget it shares with nothing. One char per coup makes a
 * shoe about 70 bytes.
 *
 * The alphabet encodes all three things a replay needs — outcome, player
 * pair, banker pair — in a single character, so there is nothing to keep in
 * sync between parallel arrays.
 */

const OUTCOMES: readonly Outcome[] = ["player", "banker", "tie"];

/**
 * 12 symbols: outcome (3) x player pair (2) x banker pair (2).
 *
 * Index = outcome + 3 * playerPair + 6 * bankerPair. Deliberately plain
 * ASCII so the payload survives any storage layer without escaping.
 */
const ALPHABET = "PBTpbtQRSqrs";

export function encodeCoups(coups: readonly CoupRecord[]): string {
  let out = "";
  for (const coup of coups) {
    const outcome = OUTCOMES.indexOf(coup.outcome);
    if (outcome < 0) continue;
    const index = outcome + (coup.playerPair ? 3 : 0) + (coup.bankerPair ? 6 : 0);
    out += ALPHABET[index] ?? "";
  }
  return out;
}

/** Decode a stored shoe. Unknown characters are skipped rather than thrown on. */
export function decodeCoups(encoded: string): CoupRecord[] {
  const coups: CoupRecord[] = [];
  for (const char of encoded) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) continue;
    const outcome = OUTCOMES[index % 3];
    if (!outcome) continue;
    coups.push({
      outcome,
      playerPair: Math.floor(index / 3) % 2 === 1,
      bankerPair: Math.floor(index / 6) % 2 === 1,
    });
  }
  return coups;
}

export interface ArchivedShoe {
  id: string;
  /** Epoch ms when the shoe's first recorded coup landed. */
  startedAt: number;
  /** Epoch ms when the shoe was closed. */
  endedAt: number;
  decks: number;
  /** Coups, one character each. See {@link encodeCoups}. */
  coups: string;
}

/**
 * How many finished shoes to keep.
 *
 * At roughly 70 bytes a shoe this is a few tens of KB — small enough to sit
 * beside everything else in storage, and more shoes than the success-rate
 * figures need to stop being noise.
 */
export const SHOE_ARCHIVE_LIMIT = 300;

export function archiveShoe(options: {
  coups: readonly CoupRecord[];
  decks: number;
  startedAt: number;
  endedAt: number;
}): ArchivedShoe | null {
  if (options.coups.length === 0) return null;
  return {
    id: `${options.startedAt}-${options.endedAt}-${options.coups.length}`,
    startedAt: options.startedAt,
    endedAt: options.endedAt,
    decks: options.decks,
    coups: encodeCoups(options.coups),
  };
}

/** Whether a value read back from storage is a usable archived shoe. */
export function isArchivedShoe(value: unknown): value is ArchivedShoe {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.coups === "string" &&
    Number.isFinite(row.startedAt) &&
    Number.isFinite(row.endedAt) &&
    Number.isFinite(row.decks)
  );
}
