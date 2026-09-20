import { BETTING_SYSTEMS } from "@ba-predict/engine";
import { isArchivedSession, parseEvictedTotals } from "./archive";
import { isArchivedShoe } from "./shoe-archive";
import { createInitialState, type AppState } from "./reducer";

/**
 * Persistence, split from the storage backend.
 *
 * Web has synchronous `localStorage`; React Native has asynchronous
 * `AsyncStorage`. What must not differ between them is *what* gets persisted
 * and how a corrupt or partial payload is recovered — so that lives here and
 * each client supplies only the two-line read/write.
 */

export const STORAGE_KEY = "ba_predict:state:v1";

/** The slice of state worth keeping across launches. */
export function serializeState(state: AppState): string {
  const { history: _history, ...rest } = state;
  return JSON.stringify(rest);
}

/**
 * Rebuild state from storage, falling back to a fresh session on anything
 * unexpected. An app that cannot start is worse than one that forgets.
 */
export function deserializeState(raw: string | null | undefined): AppState {
  const initial = createInitialState();
  if (!raw) return initial;
  try {
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (!parsed.session?.shoe?.byRank || !parsed.session.bankroll || !parsed.session.progression) {
      return initial;
    }
    return {
      ...initial,
      ...parsed,
      session: { ...initial.session, ...parsed.session },
      // Validate every archived row, not just the container: a corrupt or
      // older-schema payload can hold nulls or partial entries, and the
      // History screen throws while summing them. A bad row is dropped rather
      // than taking the whole restore down with it.
      archive: Array.isArray(parsed.archive) ? parsed.archive.filter(isArchivedSession) : [],
      evicted: parseEvictedTotals(parsed.evicted),
      shoeArchive: Array.isArray(parsed.shoeArchive)
        ? parsed.shoeArchive.filter(isArchivedShoe)
        : [],
      currency: typeof parsed.currency === "string" ? parsed.currency : initial.currency,
      // The chosen system survives a relaunch — it is a decision about the
      // sitting, not about the coup. An unknown id (an older or newer build)
      // falls back to none rather than naming a system that does not exist.
      activeSystem:
        parsed.activeSystem != null &&
        BETTING_SYSTEMS.some((system) => system.id === parsed.activeSystem)
          ? parsed.activeSystem
          : null,
      // Skipping is per coup, so it never outlives the launch that set it.
      skipNextCoup: false,
      // Observing is a decision about the sitting, so it does survive.
      tableMode: parsed.tableMode === "observe" ? "observe" : "play",
      // Undo history is deliberately not restored: it is a stack of whole
      // sessions, and "undo across a relaunch" is not a promise worth making.
      history: [],
      cardEntry: [],
      pendingWager: null,
      lastSettlement: null,
    };
  } catch {
    return initial;
  }
}
