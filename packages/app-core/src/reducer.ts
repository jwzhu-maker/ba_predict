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
import { createShoe } from "@ba-predict/engine";
import type { BankrollState } from "@ba-predict/engine";

export type Screen = "table" | "roads" | "simulator" | "settings";

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
    screen: "table",
  };
}

export type Action =
  | { type: "set-screen"; screen: Screen }
  | { type: "add-card"; rank: Rank }
  | { type: "remove-card" }
  | { type: "clear-cards" }
  | { type: "place-wager"; wager: PlacedWager | null }
  | { type: "record-coup"; coup: Omit<CoupInput, "cards"> }
  | { type: "undo" }
  | { type: "new-shoe" }
  | { type: "reset-session" }
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
      return { ...state, pendingWager: action.wager };

    case "record-coup": {
      const coup: CoupInput = { ...action.coup, cards: state.cardEntry };
      const { session, settlement } = applyCoup(state.session, coup, state.pendingWager);
      return {
        ...state,
        history: remember(state),
        session,
        cardEntry: [],
        pendingWager: null,
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
      // alone: the bankroll carries across shoes, the cards do not.
      return {
        ...state,
        history: remember(state),
        session: {
          ...state.session,
          shoe: createShoe(state.session.rules.decks),
          coups: [],
        },
        cardEntry: [],
        pendingWager: null,
        lastSettlement: null,
      };

    case "reset-session": {
      const { rules, bankroll, progression, preferredBet, kellyMultiplier } = state.session;
      return {
        ...createInitialState(),
        session: syncProgressionOptions({
          ...createSession({
            rules,
            bankroll: { ...bankroll, bankroll: bankroll.startingBankroll },
            progression: progression.id,
            preferredBet,
            kellyMultiplier,
          }),
        }),
        screen: state.screen,
      };
    }

    case "update-rules": {
      const rules = { ...state.session.rules, ...action.rules };
      const decksChanged = rules.decks !== state.session.rules.decks;
      return {
        ...state,
        session: syncProgressionOptions({
          ...state.session,
          rules,
          // Changing the deck count invalidates the tracked composition.
          shoe: decksChanged ? createShoe(rules.decks) : state.session.shoe,
          coups: decksChanged ? [] : state.session.coups,
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
