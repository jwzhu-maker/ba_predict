import {
  createMoneyFormatter,
  lifetimeStats,
  type LifetimeStats,
  type MoneyFormatter,
} from "@ba-predict/app-core";
import {
  buildRoads,
  recommendBet,
  sessionStats,
  summariseRoads,
  type Advice,
  type RoadSet,
  type RoadSummary,
  type SessionStats,
} from "@ba-predict/engine";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import { loadState, saveState } from "./persistence";
import { reducer, type Action, type AppState } from "@ba-predict/app-core";

const StateContext = createContext<AppState | null>(null);
const DispatchContext = createContext<Dispatch<Action> | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useAppState(): AppState {
  const state = useContext(StateContext);
  if (!state) throw new Error("useAppState must be used inside AppProvider");
  return state;
}

export function useDispatch(): Dispatch<Action> {
  const dispatch = useContext(DispatchContext);
  if (!dispatch) throw new Error("useDispatch must be used inside AppProvider");
  return dispatch;
}

/**
 * The current recommendation.
 *
 * Memoised on the shoe's discard count rather than the shoe object so that
 * re-renders which do not change the composition skip the enumeration. The
 * enumeration itself is memoised in the engine too, but the cheapest work is
 * the work not requested.
 */
export function useAdvice(): Advice {
  const { session } = useAppState();
  const money = useMoney();
  return useMemo(
    () =>
      recommendBet({
        shoe: session.shoe,
        rules: session.rules,
        bankroll: session.bankroll,
        progression: session.progression,
        progressionOptions: session.progressionOptions,
        preferredBet: session.preferredBet,
        kellyMultiplier: session.kellyMultiplier,
        // So the amounts inside the advice text carry the same currency as
        // the amounts beside it.
        formatAmount: money.format,
      }),
    [
      session.shoe,
      session.rules,
      session.bankroll,
      session.progression,
      session.progressionOptions,
      session.preferredBet,
      session.kellyMultiplier,
      money,
    ],
  );
}

/** The money formatter for the currently chosen currency. */
export function useMoney(): MoneyFormatter {
  const { currency } = useAppState();
  return useMemo(() => createMoneyFormatter(currency), [currency]);
}

export function useLifetime(): LifetimeStats {
  const { archive, evicted, session } = useAppState();
  return useMemo(() => lifetimeStats(archive, session, evicted), [archive, evicted, session]);
}

export function useRoads(): { roads: RoadSet; summary: RoadSummary } {
  const { session } = useAppState();
  return useMemo(() => {
    // `coups` spans the whole session because the money does; the roads are
    // per-shoe, so they read from where the current shoe started.
    const shoeCoups = session.coups.slice(session.shoeStartIndex);
    const roads = buildRoads(shoeCoups);
    return { roads, summary: summariseRoads(shoeCoups, roads) };
  }, [session.coups, session.shoeStartIndex]);
}

export function useStats(): SessionStats {
  const { session } = useAppState();
  return useMemo(() => sessionStats(session), [session]);
}
