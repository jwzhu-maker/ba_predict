import { useAppState, useDispatch } from "../state/store";
import { Card, Notice } from "./Primitives";

/**
 * What to do about a coup that has already been recorded.
 *
 * Recording one is not here any more: P / B / T and the per-coup modifiers
 * moved to `RecordDock`, pinned to the bottom of the screen. What is left
 * are the two actions taken once in a while rather than once a hand —
 * undoing a mis-tap and swapping the cards — plus the notice for a wager
 * the engine could not settle exactly.
 *
 * Those stay in a card on purpose. Docking is for the control used on every
 * hand; an action that throws away the last result wants to be a deliberate
 * scroll away, not under the thumb tapping P and B.
 */
export default function CoupEntry() {
  const { session, lastSettlement } = useAppState();
  const dispatch = useDispatch();

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
    </Card>
  );
}
