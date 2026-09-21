import { useMemo, useState } from "react";
import { describeOutcomes, parseOutcomeString } from "@ba-predict/app-core";
import { useAppState, useDispatch } from "../state/store";
import { Card, Notice } from "./Primitives";

/**
 * What to do about a coup that has already been recorded, and how to enter a
 * run of them at once.
 *
 * Recording ONE is not here any more: P / B / T and the per-coup modifiers
 * moved to `RecordDock`, pinned to the bottom of the screen. What is left
 * are the actions taken once in a while rather than once a hand — undoing a
 * mis-tap, swapping the cards, and typing in a road that was dealt before
 * the app was watching — plus the notice for a wager the engine could not
 * settle exactly.
 *
 * Those stay in a card on purpose. Docking is for the control used on every
 * hand; an action that throws away the last result, or adds thirty at once,
 * wants to be a deliberate scroll away, not under the thumb tapping P and B.
 */
export default function CoupEntry() {
  const { session, lastSettlement } = useAppState();
  const dispatch = useDispatch();

  const [run, setRun] = useState("");
  const parsed = useMemo(() => parseOutcomeString(run), [run]);
  const ready = parsed.outcomes.length > 0 && parsed.invalid.length === 0;

  const submitRun = () => {
    if (!ready) return;
    dispatch({ type: "record-coups", outcomes: parsed.outcomes });
    setRun("");
  };

  return (
    <Card title="This shoe" subtitle="Fixing a mis-tap, and starting the next one">
      {lastSettlement?.unsettled ? <Notice tone="warn">{lastSettlement.unsettled}</Notice> : null}

      <div className="button-row">
        <button
          type="button"
          className="button"
          disabled={session.coups.length === 0}
          onClick={() => dispatch({ type: "undo" })}
        >
          Undo last coup
        </button>
        <button type="button" className="button" onClick={() => dispatch({ type: "new-shoe" })}>
          New shoe
        </button>
      </div>

      <p className="field-hint">
        <strong>New shoe</strong> swaps the cards and leaves the sitting &mdash; and the money
        &mdash; running across shoes. To close the session and file it under History, use{" "}
        <strong>Start over</strong> at the top of the History tab.
      </p>

      {/*
        Catching up on a shoe already in progress. One result at a time is
        twenty presses and no way to check what went in against the board;
        as a string it is one glance. Letters only — the pairs and the card
        counts belong to a hand being played now, not to a road being copied
        off a display.
      */}
      <form
        className="field"
        onSubmit={(event) => {
          event.preventDefault();
          submitRun();
        }}
      >
        <label className="field-label" htmlFor="coup-run">
          Type a run of results
        </label>
        <input
          id="coup-run"
          className="input"
          type="text"
          value={run}
          placeholder="BPPBT…"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby="coup-run-hint"
          onChange={(event) => setRun(event.target.value)}
        />
        <div className="button-row">
          <button type="submit" className="button button-primary" disabled={!ready}>
            {parsed.outcomes.length > 0
              ? `Add ${parsed.outcomes.length} result${parsed.outcomes.length === 1 ? "" : "s"}`
              : "Add results"}
          </button>
        </div>
        <span className="field-hint" id="coup-run-hint">
          {parsed.invalid.length > 0 ? (
            <>
              Not a result: <strong>{parsed.invalid.join(" ")}</strong>. Use B, P and T &mdash;
              spaces, commas and dashes between them are fine.
            </>
          ) : parsed.outcomes.length > 0 ? (
            <>
              {describeOutcomes(parsed.outcomes)}. Nothing is staked on these and the bankroll does
              not move &mdash; they fill in the road only. One <strong>Undo</strong> takes the whole
              run back.
            </>
          ) : (
            <>
              B, P and T, in the order they came out &mdash; for a shoe that was already running
              when you sat down. No money moves; these fill in the road only.
            </>
          )}
        </span>
      </form>
    </Card>
  );
}
