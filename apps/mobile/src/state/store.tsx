import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  STORAGE_KEY,
  createInitialState,
  createMoneyFormatter,
  deserializeState,
  aggregateStrategyRecord,
  aggregateSystemRecord,
  isReplayableBet,
  resolveTableCall,
  lifetimeStats,
  replayStrategies,
  reducer,
  serializeState,
  type Action,
  type AppState,
  type LifetimeStats,
  type MoneyFormatter,
  type StrategyRecord,
  type StrategyReplay,
  type SystemRecord,
  type TableCall,
} from "@ba-predict/app-core";
import {
  buildRoads,
  recommendBet,
  runBettingSystem,
  sessionStats,
  summariseRoads,
  type Advice,
  type RoadSet,
  type RoadSummary,
  type SessionStats,
  type SystemRun,
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

/**
 * Which shoe the strategy replay reports on, and the replay itself.
 *
 * The shoe in progress while it has coups, otherwise the one that just
 * finished — pressing "New shoe" should not blank the review of the shoe you
 * pressed it for.
 */
export function useShoeReplay(): { replay: StrategyReplay; finished: boolean } | null {
  const { session } = useAppState();
  return useMemo(() => {
    const current = session.coups.slice(session.shoeStartIndex);
    const previous =
      session.previousShoeStartIndex === null
        ? []
        : session.coups.slice(session.previousShoeStartIndex, session.shoeStartIndex);
    const coups = current.length > 0 ? current : previous;
    if (coups.length === 0) return null;

    const bet = isReplayableBet(session.preferredBet as never)
      ? (session.preferredBet as Exclude<typeof session.preferredBet, "auto">)
      : "banker";
    const unit = session.bankroll.unitSize || 1;
    return {
      finished: current.length === 0,
      replay: replayStrategies({
        coups,
        rules: session.rules,
        bet,
        progressionOptions: session.progressionOptions,
        bankrollUnits: Math.max(1, Math.round(session.bankroll.bankroll / unit)),
      }),
    };
  }, [
    session.coups,
    session.shoeStartIndex,
    session.previousShoeStartIndex,
    session.rules,
    session.preferredBet,
    session.progressionOptions,
    session.bankroll,
  ]);
}

/** Every staking plan's record across every shoe recorded on this device. */
export function useStrategyRecord(): StrategyRecord {
  const { session, shoeArchive } = useAppState();
  return useMemo(() => {
    const bet = isReplayableBet(session.preferredBet as never)
      ? (session.preferredBet as Exclude<typeof session.preferredBet, "auto">)
      : "banker";
    const unit = session.bankroll.unitSize || 1;
    return aggregateStrategyRecord({
      shoes: shoeArchive,
      currentShoe: session.coups.slice(session.shoeStartIndex),
      rules: session.rules,
      bet,
      progressionOptions: session.progressionOptions,
      bankrollUnits: Math.max(1, Math.round(session.bankroll.bankroll / unit)),
    });
  }, [
    shoeArchive,
    session.coups,
    session.shoeStartIndex,
    session.rules,
    session.preferredBet,
    session.progressionOptions,
    session.bankroll,
  ]);
}

/**
 * The betting system run over the shoe on screen — the live one, or the one
 * that just finished, exactly as `useShoeReplay` chooses.
 */
export function useSystemRun(): { run: SystemRun; finished: boolean } {
  const { session, activeSystem } = useAppState();
  return useMemo(() => {
    const current = session.coups.slice(session.shoeStartIndex);
    const previous =
      session.previousShoeStartIndex === null
        ? []
        : session.coups.slice(session.previousShoeStartIndex, session.shoeStartIndex);
    const finished = current.length === 0 && previous.length > 0;
    const coups = current.length > 0 ? current : previous;
    return {
      finished,
      run: runBettingSystem({
        coups,
        // The system the player chose, not whichever is listed first. With
        // one system those were the same value; with two, passing nothing
        // stakes Reverse 12's ladder under Reverse Streak 4's name.
        system: activeSystem,
        rules: session.rules,
        tableMax: session.bankroll.tableMax > 0 ? session.bankroll.tableMax : null,
        // A stake under the minimum cannot be placed, so the live run treats
        // it as unplaced: it moves neither the ladder nor the stop-win.
        tableMin: session.bankroll.tableMin > 0 ? session.bankroll.tableMin : null,
        // Only the NEXT bet is judged against the balance; the replay behind
        // it is hindsight and must not be re-cut to today's money.
        bankroll: session.bankroll.bankroll,
      }),
    };
  }, [
    activeSystem,
    session.coups,
    session.shoeStartIndex,
    session.previousShoeStartIndex,
    session.rules,
    session.bankroll.tableMax,
    session.bankroll.tableMin,
    session.bankroll.bankroll,
  ]);
}

/** The same system totalled over every shoe this device has kept. */
export function useSystemRecord(): SystemRecord {
  const { session, shoeArchive, activeSystem } = useAppState();
  return useMemo(
    () =>
      aggregateSystemRecord({
        shoes: shoeArchive,
        currentShoe: session.coups.slice(session.shoeStartIndex),
        // Every kept shoe is re-read under the system on screen now. The
        // archive stores coups, not stakes, so this is the record of the
        // chosen system over that history rather than of what was played.
        system: activeSystem,
        rules: session.rules,
        tableMax: session.bankroll.tableMax > 0 ? session.bankroll.tableMax : null,
        // The same floor the live run uses, so the two cards agree on which
        // hands were bets at all.
        tableMin: session.bankroll.tableMin > 0 ? session.bankroll.tableMin : null,
      }),
    [
      activeSystem,
      shoeArchive,
      session.coups,
      session.shoeStartIndex,
      session.rules,
      session.bankroll.tableMax,
      session.bankroll.tableMin,
    ],
  );
}

/**
 * The single instruction the Table tab shows and the recorded result settles
 * against. Null system means none is selected, and the engine answers.
 */
export function useTableCall(): TableCall {
  const { session, pendingWager, skipNextCoup, activeSystem, tableMode } = useAppState();
  const advice = useAdvice();
  const { run, finished } = useSystemRun();
  const money = useMoney();
  return useMemo(
    () =>
      resolveTableCall({
        advice,
        run: activeSystem === null ? null : run,
        // Without this the FINISHED shoe's ladder step is carried into the
        // fresh one and staked against a side read from the old shoe.
        finished,
        manualWager: pendingWager,
        skipped: skipNextCoup,
        bankroll: session.bankroll.bankroll,
        tableMin: session.bankroll.tableMin,
        mode: tableMode,
        money,
      }),
    [
      advice,
      run,
      finished,
      activeSystem,
      pendingWager,
      skipNextCoup,
      session.bankroll.bankroll,
      session.bankroll.tableMin,
      tableMode,
      money,
    ],
  );
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
