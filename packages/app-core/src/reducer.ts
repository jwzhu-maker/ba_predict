import {
  applyCoup,
  createSession,
  initProgression,
  type BetType,
  type CoupInput,
  type PlacedWager,
  type ProgressionId,
  type Rank,
  type SessionState,
  type Settlement,
  type TableRules,
} from "@ba-predict/engine";
import { createShoe, type BettingSystemId } from "@ba-predict/engine";
import type { BankrollState } from "@ba-predict/engine";
import {
  ARCHIVE_LIMIT,
  EMPTY_EVICTED,
  archiveSession,
  foldEvicted,
  type ArchivedSession,
  type EvictedTotals,
} from "./archive";
import { DEFAULT_CURRENCY } from "./currency";
import type { TableMode } from "./table-call";
import { SHOE_ARCHIVE_LIMIT, archiveShoe, type ArchivedShoe } from "./shoe-archive";

export type Screen = "table" | "roads" | "simulator" | "history" | "settings";

export interface AppState {
  session: SessionState;
  /** Snapshots for undo, oldest first. */
  history: SessionState[];
  /** Cards entered for the coup in progress, for composition tracking. */
  cardEntry: Rank[];
  /** The wager currently on the table, if any. */
  pendingWager: PlacedWager | null;
  /** Result of the most recent settlement, so the UI can report a partial one. */
  lastSettlement: Settlement | null;
  /** Closed sessions, oldest first. Capped at ARCHIVE_LIMIT. */
  archive: ArchivedSession[];
  /** Totals for sessions that have aged out of `archive`, so lifetime stays lifetime. */
  evicted: EvictedTotals;
  /** Finished shoes, oldest first, kept so strategy success rates span real play. */
  shoeArchive: ArchivedShoe[];
  /** ISO 4217 code, or PLAIN for unlabelled numbers. */
  currency: string;
  /**
   * The betting system being played, chosen on the Strategies tab, or null
   * for none.
   *
   * Picking one at the start of the session is the point: it decides the
   * side, the stake and whether to bet at all, so the Table tab's headline
   * becomes that system's call rather than the engine's flat suggestion.
   */
  activeSystem: BettingSystemId | null;
  /**
   * True when the user has pressed "I don't bet this time".
   *
   * Per coup, not per session: recording a result clears it, because the
   * next hand is a new decision. It exists because the app now stakes the
   * suggestion automatically, so opting OUT is the action that needs a
   * button rather than opting in.
   */
  skipNextCoup: boolean;
  /**
   * "observe" keeps score without ever staking.
   *
   * It exists because recording a result now moves money by default, and a
   * player watching a shoe they are not betting would otherwise drain their
   * bankroll one coup at a time, or have to press the red skip button on
   * every single hand. The roads, the strategy record and the card tracker
   * all still fill in — this changes nothing except whether the ledger is
   * touched.
   */
  tableMode: TableMode;
  screen: Screen;
}

const HISTORY_LIMIT = 200;

export function createInitialState(): AppState {
  return {
    session: createSession(),
    history: [],
    cardEntry: [],
    pendingWager: null,
    lastSettlement: null,
    archive: [],
    evicted: EMPTY_EVICTED,
    shoeArchive: [],
    currency: DEFAULT_CURRENCY,
    activeSystem: null,
    skipNextCoup: false,
    tableMode: "play",
    screen: "table",
  };
}

export type Action =
  | { type: "set-screen"; screen: Screen }
  | { type: "add-card"; rank: Rank }
  | { type: "remove-card" }
  | { type: "clear-cards" }
  | { type: "place-wager"; wager: PlacedWager | null }
  | {
      type: "record-coup";
      coup: Omit<CoupInput, "cards">;
      /**
       * The wager this result settles against, as the card was showing it.
       *
       * The client resolves it (see `resolveTableCall`) so the money that
       * moves is always the money on screen. A hand-placed `pendingWager`
       * still wins, which is what an override means.
       */
      wager?: PlacedWager | null;
      now?: number;
    }
  | { type: "undo" }
  | { type: "new-shoe"; now?: number }
  | { type: "reset-session" }
  | { type: "end-session"; now?: number }
  | { type: "delete-session"; id: string }
  | { type: "clear-archive" }
  | { type: "clear-shoe-archive" }
  | { type: "set-currency"; currency: string }
  | { type: "set-active-system"; system: BettingSystemId | null }
  | { type: "skip-next-coup"; skip: boolean }
  | { type: "set-table-mode"; mode: TableMode }
  | { type: "update-rules"; rules: Partial<TableRules> }
  | { type: "update-bankroll"; bankroll: Partial<BankrollState> }
  | { type: "set-progression"; progression: ProgressionId }
  | { type: "set-preferred-bet"; bet: BetType | "auto" }
  | { type: "set-kelly-multiplier"; multiplier: number }
  | { type: "hydrate"; state: AppState };

function remember(state: AppState): SessionState[] {
  const history = [...state.history, state.session];
  return history.length > HISTORY_LIMIT ? history.slice(history.length - HISTORY_LIMIT) : history;
}

/**
 * Keep the table ceiling in units aligned with the money settings.
 *
 * The progression works in units and the table works in currency, so a change
 * to either has to be reflected in the other or the "your ladder has outrun
 * the table" warning silently stops being true.
 */
function syncProgressionOptions(session: SessionState): SessionState {
  const maxUnits =
    session.bankroll.unitSize > 0
      ? Math.floor(session.bankroll.tableMax / session.bankroll.unitSize)
      : null;
  if (session.progressionOptions.maxUnits === maxUnits) return session;
  return { ...session, progressionOptions: { ...session.progressionOptions, maxUnits } };
}

/**
 * Archive the running session and open a fresh one.
 *
 * Undo history is dropped rather than carried: undo restores a session
 * snapshot but knows nothing about the archive, so an "undo" across this
 * boundary would hand back the old session while leaving its archived copy in
 * place — and the next close would file it twice.
 */
/** `id`, or `id#2`, `id#3`… if the archive already holds it. */
function uniqueArchiveId(archive: readonly ArchivedSession[], id: string): string {
  if (!archive.some((row) => row.id === id)) return id;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${id}#${suffix}`;
    if (!archive.some((row) => row.id === candidate)) return candidate;
  }
}

function closeSession(
  state: AppState,
  options: { carryBankroll: boolean; now: number },
): AppState {
  const { rules, bankroll, progression, preferredBet, kellyMultiplier } = state.session;
  const archived = archiveSession(state.session, options.now);
  // `archiveSession` ids a row `${startedAt}-${endedAt}`, which two sittings
  // closed in the same millisecond share. That was only a duplicate React
  // key before; now that a row can be deleted BY id, a collision means
  // deleting one visibly removes another, so the id is made unique here —
  // where the existing archive is in hand and `archiveSession` cannot see it.
  const appended = archived
    ? [...state.archive, { ...archived, id: uniqueArchiveId(state.archive, archived.id) }]
    : state.archive;
  const opening = options.carryBankroll ? bankroll.bankroll : bankroll.startingBankroll;

  // Trim to the cap, folding anything dropped into the running totals rather
  // than losing it from the lifetime figures.
  let archive = appended;
  let evicted = state.evicted;
  if (appended.length > ARCHIVE_LIMIT) {
    const overflow = appended.length - ARCHIVE_LIMIT;
    for (const row of appended.slice(0, overflow)) evicted = foldEvicted(evicted, row);
    archive = appended.slice(overflow);
  }

  return {
    ...state,
    session: syncProgressionOptions(
      createSession({
        rules,
        bankroll: { ...bankroll, bankroll: opening, startingBankroll: opening },
        progression: progression.id,
        preferredBet,
        kellyMultiplier,
        startedAt: options.now,
      }),
    ),
    history: [],
    cardEntry: [],
    pendingWager: null,
    // `skipNextCoup` is documented as per-coup; a brand-new session opening
    // on "SITTING OUT" is the contract being broken at its widest.
    skipNextCoup: false,
    lastSettlement: null,
    archive,
    evicted,
  };
}

/**
 * File the shoe that is ending, capped oldest-first.
 *
 * Unlike the session archive there is no running total for what falls off:
 * success rates are computed by replaying the coups, and a shoe whose coups
 * are gone cannot be replayed. The cap is generous enough that it is a
 * limit on history, not on the figures being meaningful.
 */
function fileShoe(state: AppState, now: number): ArchivedShoe[] {
  const coups = state.session.coups.slice(state.session.shoeStartIndex);
  const filed = archiveShoe({
    coups,
    decks: state.session.rules.decks,
    startedAt: state.session.firstWagerAt ?? state.session.startedAt,
    endedAt: now,
  });
  if (!filed) return state.shoeArchive;
  const next = [...state.shoeArchive, filed];
  return next.length > SHOE_ARCHIVE_LIMIT ? next.slice(next.length - SHOE_ARCHIVE_LIMIT) : next;
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrate":
      return action.state;

    case "set-screen":
      return { ...state, screen: action.screen };

    case "add-card":
      // Six cards is the most a coup can use.
      if (state.cardEntry.length >= 6) return state;
      return { ...state, cardEntry: [...state.cardEntry, action.rank] };

    case "remove-card":
      return { ...state, cardEntry: state.cardEntry.slice(0, -1) };

    case "clear-cards":
      return { ...state, cardEntry: [] };

    case "place-wager":
      // Placing by hand is a decision to bet, so it cancels a skip; taking
      // the wager back leaves the skip alone.
      return {
        ...state,
        pendingWager: action.wager,
        skipNextCoup: action.wager ? false : state.skipNextCoup,
      };

    case "set-active-system":
      // A fresh system starts from a clean slate: a skip belongs to the coup
      // it was pressed on, and a hand-placed wager was chosen against the
      // PREVIOUS system's advice — left in place it silently outranks the
      // system the user just picked, on the very next coup.
      return {
        ...state,
        activeSystem: action.system,
        skipNextCoup: false,
        pendingWager: null,
      };

    case "set-table-mode":
      return { ...state, tableMode: action.mode, skipNextCoup: false };

    case "skip-next-coup":
      return {
        ...state,
        skipNextCoup: action.skip,
        pendingWager: action.skip ? null : state.pendingWager,
      };

    case "record-coup": {
      const coup: CoupInput = { ...action.coup, cards: state.cardEntry };
      // A hand-placed wager outranks the suggestion; otherwise the suggestion
      // the card was showing is what settles. `undefined` (an older caller,
      // or a test) falls back to the pending wager alone, so nothing is
      // staked that was never asked for.
      const wager = state.pendingWager ?? action.wager ?? null;
      const { session, settlement } = applyCoup(state.session, coup, wager);
      // The sitting starts when money first goes down, not when the app
      // launched.
      const firstWagerAt =
        session.firstWagerAt ?? (settlement ? (action.now ?? Date.now()) : null);
      return {
        ...state,
        history: remember(state),
        session: { ...session, firstWagerAt },
        cardEntry: [],
        pendingWager: null,
        // The skip was for this coup; the next hand is a new decision.
        skipNextCoup: false,
        lastSettlement: settlement,
      };
    }

    case "undo": {
      const previous = state.history[state.history.length - 1];
      if (!previous) return state;
      return {
        ...state,
        session: previous,
        history: state.history.slice(0, -1),
        cardEntry: [],
        pendingWager: null,
        lastSettlement: null,
      };
    }

    case "new-shoe":
      // A new shoe resets the composition and the road, and leaves the money
      // alone: the bankroll carries across shoes, the cards do not. The coup
      // ledger is money, not cards, so it carries too — only the marker for
      // where this shoe's road starts moves.
      return {
        ...state,
        history: remember(state),
        session: {
          ...state.session,
          shoe: createShoe(state.session.rules.decks),
          shoeStartIndex: state.session.coups.length,
          previousShoeStartIndex: state.session.shoeStartIndex,
        },
        shoeArchive: fileShoe(state, action.now ?? Date.now()),
        cardEntry: [],
        pendingWager: null,
        // The skip was for a coup in the shoe that just ended, so it must not
        // silently sit out the first hand of the new one.
        skipNextCoup: false,
        lastSettlement: null,
      };

    // Two ways to close a session, and they differ in one thing: what the
    // next one opens with. "End" banks the night and carries the money you
    // actually have forward, so the new session's profit starts at zero.
    // "Reset" puts the original stake back, which is what you want after
    // experimenting rather than playing.
    case "end-session":
      return closeSession(state, { carryBankroll: true, now: action.now ?? Date.now() });

    case "reset-session":
      return closeSession(state, { carryBankroll: false, now: Date.now() });

    case "delete-session": {
      const archive = state.archive.filter((session) => session.id !== action.id);
      // Nothing matched: return the same object so React skips the re-render.
      if (archive.length === state.archive.length) return state;
      // `evicted` is deliberately untouched. `lifetimeStats` sums the archive
      // rows and ADDS the evicted totals, so dropping the row already takes
      // its numbers out of the lifetime figures; subtracting from `evicted`
      // as well would remove them twice.
      return { ...state, archive };
    }

    case "clear-archive":
      // Clearing history clears all of it, evicted totals included —
      // otherwise "delete every session" would leave the lifetime figures
      // standing on rows the user can no longer see.
      return { ...state, archive: [], evicted: EMPTY_EVICTED };

    case "clear-shoe-archive":
      return { ...state, shoeArchive: [] };

    case "set-currency":
      return { ...state, currency: action.currency };

    case "update-rules": {
      const rules = { ...state.session.rules, ...action.rules };
      const decksChanged = rules.decks !== state.session.rules.decks;
      return {
        ...state,
        shoeArchive: decksChanged ? fileShoe(state, Date.now()) : state.shoeArchive,
        session: syncProgressionOptions({
          ...state.session,
          rules,
          // Changing the deck count invalidates the tracked composition and
          // the road, but not the night's wagers.
          shoe: decksChanged ? createShoe(rules.decks) : state.session.shoe,
          shoeStartIndex: decksChanged
            ? state.session.coups.length
            : state.session.shoeStartIndex,
          previousShoeStartIndex: decksChanged
            ? state.session.shoeStartIndex
            : state.session.previousShoeStartIndex,
        }),
      };
    }

    case "update-bankroll": {
      const bankroll = { ...state.session.bankroll, ...action.bankroll };
      const session = syncProgressionOptions({ ...state.session, bankroll });
      return {
        ...state,
        session: {
          ...session,
          // Re-seed the ladder so its unit stake respects a new ceiling.
          progression: initProgression(session.progression.id, session.progressionOptions),
        },
      };
    }

    case "set-progression":
      return {
        ...state,
        session: {
          ...state.session,
          progression: initProgression(action.progression, state.session.progressionOptions),
        },
      };

    case "set-preferred-bet":
      return { ...state, session: { ...state.session, preferredBet: action.bet } };

    case "set-kelly-multiplier":
      return { ...state, session: { ...state.session, kellyMultiplier: action.multiplier } };

    default: {
      const exhaustive: never = action;
      throw new Error(`unhandled action ${JSON.stringify(exhaustive)}`);
    }
  }
}
