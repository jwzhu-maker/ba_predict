import {
  applyCoup,
  createSession,
  initProgression,
  type BetType,
  type CoupInput,
  type Outcome,
  type PlacedWager,
  type ProgressionId,
  type Rank,
  type SessionState,
  type Settlement,
  type TableRules,
} from "@ba-predict/engine";
import { createShoe, type BettingSystemId } from "@ba-predict/engine";
import type { BankrollState, CoupRecord } from "@ba-predict/engine";
import {
  ARCHIVE_LIMIT,
  EMPTY_EVICTED,
  archiveSession,
  foldEvicted,
  type ArchivedSession,
  type EvictedTotals,
} from "./archive";
import { DEFAULT_CURRENCY } from "./currency";
import { reachedStop, sameStop, type ReachedStop } from "./stops";
import type { TableMode } from "./table-call";
import { SHOE_ARCHIVE_LIMIT, archiveShoe, type ArchivedShoe } from "./shoe-archive";

export type Screen = "table" | "roads" | "simulator" | "history" | "settings";

/**
 * One step on the undo stack.
 *
 * The session snapshot alone is not enough, because `cardEntry` and
 * `pendingWager` belong to the coup that has NOT happened yet, and the
 * undoable actions divide into two kinds:
 *
 *   - Those that CONSUME them. Recording a coup puts the cards into the
 *     coup and settles the wager; a new shoe discards both. Undo has to put
 *     them back — the coup is being taken back, so its stake returns to the
 *     table and its cards to the buffer, alongside the shoe the snapshot
 *     restores. That is what `consumed` carries.
 *   - Those that never touch them. A typed run of results settles nothing,
 *     so whatever is pending stays pending. There `consumed` is null and
 *     undo leaves the two fields exactly as they stand — which matters most
 *     when they were set AFTER the run: preparing the next hand and then
 *     spotting a typo in the run must not cost you the wager and cards you
 *     just entered. Restoring a snapshot taken before the run would.
 */
export interface UndoStep {
  session: SessionState;
  /** What the undone action took, or null when it took nothing. */
  consumed: { cardEntry: Rank[]; pendingWager: PlacedWager | null } | null;
}

/**
 * One step on the redo stack: an undo, kept so it can be taken back.
 *
 * `session` is the session as it stood just before the undo, and is put
 * back the same way undo puts a snapshot back (see `restoreSession`) — so a
 * setting changed between the undo and the redo survives the redo too.
 * `undone` is the undo step itself, which goes back on the undo stack so
 * the redone action can be undone again.
 */
export interface RedoStep {
  session: SessionState;
  undone: UndoStep;
  /**
   * The pending inputs as they stood before the undo, when the undone
   * action had consumed some — redoing it consumes them again. Null when it
   * consumed nothing, and redo then leaves the pending inputs alone.
   */
  inputs: { cardEntry: Rank[]; pendingWager: PlacedWager | null } | null;
}

export interface AppState {
  session: SessionState;
  /** Snapshots for undo, oldest first. */
  history: UndoStep[];
  /**
   * Undos that can be redone, most recent last. Any new undoable action
   * clears it: a redo only makes sense on the road it was undone from.
   */
  future: RedoStep[];
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
  /**
   * Whether the Bet card's "Why this" reasoning is unfolded.
   *
   * In app state rather than in each card's own `useState` because a tab
   * switch unmounts the Table screen: opening it, glancing at the roads and
   * coming back folded it again, so the control did not hold the setting a
   * person had just made. It is a preference about how much the app should
   * explain, not a per-visit detail, so it survives a relaunch too.
   */
  adviceReasonsOpen: boolean;
  /**
   * Whether pressing P / B / T plays a short tick as well as buzzing.
   *
   * The buzz is always on — it is silent and is the confirmation a thumb
   * feels without looking — but a sound at a table is a choice. The phone's
   * own silent switch is honoured on top of this where the platform lets
   * an app see it.
   */
  tapSound: boolean;
  /**
   * The limit the player has been shown and has answered for, or null.
   *
   * Crossing a stop-win or a stop-loss raises a modal the player has to
   * answer before doing anything else, and this is what stops that modal
   * coming back on the next render, the next coup and the next launch: it
   * remembers WHICH limit was answered for — the kind AND the number it was
   * set to — not merely that something was.
   *
   * It is kept honest by `syncAcknowledgedStop`, which clears it the moment
   * the session stops standing at that exact limit — so moving a limit that
   * has been reached (even to another number the session is still past),
   * editing the bankroll back inside it, undoing the coup that crossed it
   * or closing the session all re-arm the interruption. Nothing has to
   * remember to reset it.
   */
  acknowledgedStop: ReachedStop | null;
  screen: Screen;
}

const HISTORY_LIMIT = 200;

/**
 * The table the app assumes when it has never been told otherwise.
 *
 * These live here rather than in the engine's `DEFAULT_RULES` /
 * `DEFAULT_BANKROLL` on purpose. Those two describe the textbook game — the
 * 5% commission table, a round 1000 bankroll — and the engine's pricing
 * tests are written against them; they are a neutral baseline, not a
 * statement about what a player in front of this app is sitting at. What
 * the FIRST LAUNCH should show is a product decision, so it is made here,
 * in one place, for web and mobile alike.
 *
 * Only a first launch reads them. Settings are persisted and every later
 * session is opened from the settings in hand (see `closeSession`), so
 * changing a number here never reaches back and overwrites a table someone
 * has already described to the app.
 */
export const INITIAL_RULES: Partial<TableRules> = {
  // No-commission is the common table now: Banker pays even money and a
  // Banker win with 6 pays half.
  bankerSixPayout: 0.5,
};

export const INITIAL_BANKROLL: Partial<BankrollState> = {
  bankroll: 3000,
  startingBankroll: 3000,
  // One unit is one table minimum. A unit below the minimum cannot be
  // staked — the advisor clamps every stake up to the floor — which would
  // leave the ladders counting in a unit the table will not accept.
  unitSize: 50,
  tableMin: 50,
  tableMax: 10_000,
  // Both are measured as PROFIT from where the session opened, not as a
  // balance: up 3300, or down 1000.
  stopWin: 3300,
  stopLoss: 1000,
};

export function createInitialState(): AppState {
  return {
    session: createSession({ rules: INITIAL_RULES, bankroll: INITIAL_BANKROLL }),
    history: [],
    future: [],
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
    adviceReasonsOpen: false,
    tapSound: true,
    acknowledgedStop: null,
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
  | {
      /**
       * A run of results typed in at once, e.g. a shoe already in progress
       * when the player sat down, or the road on the table's display.
       *
       * Deliberately NOT a loop of `record-coup`: nothing is staked and no
       * cards are consumed, because these coups are history rather than
       * hands the app was asked to call. They fill in the roads, the shoe's
       * pattern and every replay that reads the coup list, and they leave
       * the ledger — the bankroll, the ladder and the strategy record's
       * money — exactly where they were.
       *
       * One undo step covers the whole run, which is the only sane answer
       * for a mis-typed string: a 40-character paste must not take 40
       * presses of Undo to take back.
       */
      type: "record-coups";
      outcomes: readonly Outcome[];
    }
  | { type: "undo" }
  /** Take back the most recent undo. */
  | { type: "redo" }
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
  | { type: "set-advice-reasons-open"; open: boolean }
  | { type: "set-tap-sound"; on: boolean }
  /** "I have seen that I am at my limit." Answered per limit, not per coup. */
  | { type: "acknowledge-stop" }
  | { type: "update-rules"; rules: Partial<TableRules> }
  | { type: "update-bankroll"; bankroll: Partial<BankrollState> }
  | { type: "set-progression"; progression: ProgressionId }
  | { type: "set-preferred-bet"; bet: BetType | "auto" }
  | { type: "set-kelly-multiplier"; multiplier: number }
  | { type: "hydrate"; state: AppState };

/**
 * Push an undo step.
 *
 * `consumesInputs` says whether the action about to run takes the pending
 * card entry and wager with it. See `UndoStep`; getting it wrong in either
 * direction loses somebody's input.
 */
function remember(state: AppState, consumesInputs: boolean): UndoStep[] {
  const history = [
    ...state.history,
    {
      session: state.session,
      consumed: consumesInputs
        ? { cardEntry: state.cardEntry, pendingWager: state.pendingWager }
        : null,
    },
  ];
  return history.length > HISTORY_LIMIT ? history.slice(history.length - HISTORY_LIMIT) : history;
}

/** Everything the recorded coups have added to or taken from the bankroll. */
function settledProfit(coups: readonly CoupRecord[]): number {
  let total = 0;
  for (const coup of coups) total += coup.wager?.profit ?? 0;
  return total;
}

/**
 * Undo the last coup without undoing anything the player has changed since.
 *
 * The history stack holds whole `SessionState` snapshots, and restoring one
 * wholesale reverted the SETTINGS too. That is a real trap rather than a
 * theoretical one, because of when people change them: you hit your
 * stop-win, raise it in Settings to keep playing, mis-tap the next result —
 * and Undo silently puts the old stop-win back, so the app starts refusing
 * to stake again with no indication why. The same went for the table
 * maximum, the unit size, the rules, the staking plan and the Kelly
 * fraction.
 *
 * So only what an undoable action actually TOUCHES comes from the snapshot:
 * the cards, the coup list, the shoe markers, the ladder's live position and
 * the first-wager stamp. Everything else is taken from the session as it
 * stands now.
 *
 * The bankroll BALANCE is the one field that is both. A coup moves it and
 * the Settings screen can set it outright, so neither side is right on its
 * own: restoring the snapshot would discard a correction typed in since,
 * and keeping the current value would leave the undone coup's winnings in
 * the bankroll. It is reversed by DELTA instead — the profit recorded in
 * the coups the undo removes — which gives the snapshot's number when
 * nothing else changed and preserves the correction when it did.
 *
 * The delta is computed from the two coup lists rather than from "the last
 * coup", because `new-shoe` is undoable too and removes no coups at all;
 * there the two lists agree and the delta is zero.
 *
 * Redo uses the same function with the post-action snapshot: the coups come
 * back and the delta, now negative, puts their profit back in the bankroll.
 */
function restoreSession(current: SessionState, snapshot: SessionState): SessionState {
  const undoneProfit = settledProfit(current.coups) - settledProfit(snapshot.coups);
  return {
    ...current,
    shoe: snapshot.shoe,
    coups: snapshot.coups,
    shoeStartIndex: snapshot.shoeStartIndex,
    previousShoeStartIndex: snapshot.previousShoeStartIndex,
    // The ladder's live position, but only while it is the same ladder.
    // `progression` carries BOTH the plan the player chose (a setting) and
    // where that plan currently stands (moved by every settled coup), so
    // restoring it wholesale put a switched-away-from plan back. Switching
    // plans resets the ladder anyway, which is why keeping the current one
    // in that case loses nothing.
    progression:
      current.progression.id === snapshot.progression.id
        ? snapshot.progression
        : current.progression,
    firstWagerAt: snapshot.firstWagerAt,
    bankroll: { ...current.bankroll, bankroll: current.bankroll.bankroll - undoneProfit },
  };
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
    future: [],
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

/**
 * Keep the answered-for limit true of the session as it now stands.
 *
 * Run after every action rather than unpicked action by action, because
 * almost everything can move a session off a limit: settling a coup, undoing
 * one, editing the bankroll or the limits themselves, closing the session,
 * restoring a payload from storage. Clearing it here means the modal re-arms
 * for the next crossing without a dozen cases each having to remember to say
 * so — and the one case that must NOT clear it, answering the modal while
 * still at the limit, keeps it because both the kind and the number match.
 */
function syncAcknowledgedStop(state: AppState): AppState {
  if (state.acknowledgedStop === null) return state;
  if (sameStop(reachedStop(state.session), state.acknowledgedStop)) return state;
  return { ...state, acknowledgedStop: null };
}

export function reducer(state: AppState, action: Action): AppState {
  const next = reduceAction(state, action);
  // An action that changed nothing cannot have moved a limit either, and
  // returning the same object is what lets React skip the re-render.
  return next === state ? state : syncAcknowledgedStop(next);
}

function reduceAction(state: AppState, action: Action): AppState {
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

    case "set-advice-reasons-open":
      return { ...state, adviceReasonsOpen: action.open };

    case "set-tap-sound":
      return { ...state, tapSound: action.on };

    case "acknowledge-stop": {
      // Recorded as the limit actually standing, so that answering for a
      // stop-loss does not also silently answer for the stop-win met later,
      // nor for a different number this one is moved to afterwards.
      const stop = reachedStop(state.session);
      if (stop === null || sameStop(stop, state.acknowledgedStop)) return state;
      return { ...state, acknowledgedStop: stop };
    }

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
        // The cards went into the coup and the wager settled, so undo has
        // to hand both back.
        history: remember(state, true),
        future: [],
        session: { ...session, firstWagerAt },
        cardEntry: [],
        pendingWager: null,
        // The skip was for this coup; the next hand is a new decision.
        skipNextCoup: false,
        lastSettlement: settlement,
      };
    }

    case "record-coups": {
      if (action.outcomes.length === 0) return state;
      let session = state.session;
      for (const outcome of action.outcomes) {
        // No wager, so `applyCoup` leaves the bankroll and the ladder alone
        // and appends a road-only record.
        session = applyCoup(session, { outcome }, null).session;
      }
      return {
        ...state,
        // Nothing here settles a wager or eats a card, so the undo step
        // consumes nothing and taking the run back leaves whatever is
        // pending alone — including inputs entered after the run.
        history: remember(state, false),
        future: [],
        session,
        // `cardEntry` and `pendingWager` belong to the coup still to come,
        // and none of these settled it, so both are left standing.
      };
    }

    case "undo": {
      const previous = state.history[state.history.length - 1];
      if (!previous) return state;
      return {
        ...state,
        // Not `previous.session` wholesale: that reverts settings changed since.
        session: restoreSession(state.session, previous.session),
        history: state.history.slice(0, -1),
        future: [
          ...state.future,
          {
            session: state.session,
            undone: previous,
            inputs: previous.consumed
              ? { cardEntry: state.cardEntry, pendingWager: state.pendingWager }
              : null,
          },
        ],
        // What the undone action consumed, or what stands now if it
        // consumed nothing. See `UndoStep`.
        cardEntry: previous.consumed ? previous.consumed.cardEntry : state.cardEntry,
        pendingWager: previous.consumed ? previous.consumed.pendingWager : state.pendingWager,
        lastSettlement: null,
      };
    }

    case "redo": {
      const next = state.future[state.future.length - 1];
      if (!next) return state;
      return {
        ...state,
        // The same field-by-field restore as undo, pointed the other way:
        // the coups and the shoe come back, the balance moves by the
        // redone coups' profit, and settings changed since stay as they are.
        session: restoreSession(state.session, next.session),
        history: [...state.history, next.undone],
        future: state.future.slice(0, -1),
        cardEntry: next.inputs ? next.inputs.cardEntry : state.cardEntry,
        pendingWager: next.inputs ? next.inputs.pendingWager : state.pendingWager,
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
        // A new shoe throws the pending inputs away below, so undo puts
        // them back.
        history: remember(state, true),
        future: [],
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
