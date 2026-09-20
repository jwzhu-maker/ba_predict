import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  STORAGE_KEY,
  createInitialState,
  deserializeState,
  reducer,
  serializeState,
  type Action,
  type AppState,
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
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";

const StateContext = createContext<AppState | null>(null);
const DispatchContext = createContext<Dispatch<Action> | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const [hydrated, setHydrated] = useState(false);
  const hydrating = useRef(true);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        dispatch({ type: "hydrate", state: deserializeState(raw) });
      })
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        hydrating.current = false;
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Do not write back the empty initial state before the stored one has
    // been read, or a cold start erases the saved session.
    if (hydrating.current || !hydrated) return;
    void AsyncStorage.setItem(STORAGE_KEY, serializeState(state)).catch(() => undefined);
  }, [state, hydrated]);

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

export function useAdvice(): Advice {
  const { session } = useAppState();
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
      }),
    [
      session.shoe,
      session.rules,
      session.bankroll,
      session.progression,
      session.progressionOptions,
      session.preferredBet,
      session.kellyMultiplier,
    ],
  );
}

export function useRoads(): { roads: RoadSet; summary: RoadSummary } {
  const { session } = useAppState();
  return useMemo(() => {
    const roads = buildRoads(session.coups);
    return { roads, summary: summariseRoads(session.coups, roads) };
  }, [session.coups]);
}

export function useStats(): SessionStats {
  const { session } = useAppState();
  return useMemo(() => sessionStats(session), [session]);
}
