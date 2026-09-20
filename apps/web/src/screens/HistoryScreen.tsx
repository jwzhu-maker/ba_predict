import { createInitialState, describeEdge } from "@ba-predict/app-core";
import { useState } from "react";
import { PROGRESSIONS } from "@ba-predict/engine";
import { Card, Notice, Stat } from "../components/Primitives";
import { formatDateTime, formatDuration, formatPercent, formatUnits } from "../lib/format";
import { useAppState, useDispatch, useLifetime, useMoney } from "../state/store";

/**
 * Every session you have closed, and what they add up to.
 *
 * A single session is mostly luck; the lifetime row is where the edge becomes
 * visible. That is the one number on this screen worth looking at, so it is at
 * the top and it is stated as a cost rather than a "win rate".
 *
 * "Start over" lives here rather than under Settings, where it was buried
 * among preferences nobody opens mid-sitting. Both of its buttons file the
 * current session into the list directly below them, so pressing one shows
 * its own result — and the Table tab keeps its whole height for the card
 * that says what to bet.
 *
 * "Erase everything" is here for the opposite reason. It was one mis-tap
 * away in Settings, beside two routine and reversible buttons, and it wiped
 * the History those buttons exist to fill without asking. Here it is last
 * on the screen it destroys, behind the same two-tap arming as the row
 * deletes above it, and its own warning says what goes.
 */
export default function HistoryScreen() {
  // Which row's X has been armed, whether the clear-all is armed, and
  // whether the factory reset is. None of the three is recoverable, so none
  // of them happens on a single tap — and arming one disarms the others, so
  // two live confirmations can never sit on screen at once.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [erasing, setErasing] = useState(false);

  const disarm = () => {
    setConfirming(null);
    setClearingAll(false);
    setErasing(false);
  };

  const { archive } = useAppState();
  const dispatch = useDispatch();
  const lifetime = useLifetime();
  const money = useMoney();

  const name = (id: string) => PROGRESSIONS.find((entry) => entry.id === id)?.name ?? id;
  const sessions = [...archive].reverse();
  const edge = describeEdge(lifetime.actualEdge);
  const ahead = edge.ahead;

  return (
    <div className="screen">
      <Card title="Start over" subtitle="Ending a session files it below">
        <div className="button-row">
          <button
            type="button"
            className="button button-primary"
            onClick={() => dispatch({ type: "end-session" })}
          >
            End session
          </button>
          <button
            type="button"
            className="button"
            onClick={() => dispatch({ type: "reset-session" })}
          >
            Reset stake
          </button>
        </div>
        <p className="field-hint">
          <strong>End session</strong> files the current session under History and opens a fresh one
          carrying your balance &mdash; that is what to press when the shoe ends and you want it
          recorded. <strong>Reset stake</strong> also files it, but puts the original starting
          bankroll back, for when you were experimenting rather than playing.
        </p>
        <p className="field-hint">
          The <strong>New shoe</strong> button on the Table tab is the lighter one: it swaps the
          cards and leaves the sitting &mdash; and the money &mdash; running across shoes.
        </p>
      </Card>

      <Card title="Lifetime" subtitle="Every closed session, plus the one running now">
        <div className="stat-grid">
          <Stat label="Sessions" value={String(lifetime.sessions)} />
          <Stat
            label="Net"
            value={money.signed(lifetime.netProfit)}
            tone={lifetime.netProfit >= 0 ? "good" : "bad"}
          />
          <Stat label="Total staked" value={money.format(lifetime.totalWagered)} />
          <Stat
            label={edge.label}
            value={lifetime.totalWagered > 0 ? formatPercent(edge.magnitude) : "—"}
            tone={ahead ? "good" : "bad"}
            hint="of everything staked"
          />
          <Stat
            label="Sessions up"
            value={lifetime.sessions > 0 ? `${lifetime.winningSessions}/${lifetime.sessions}` : "—"}
          />
          <Stat label="Coups" value={formatUnits(lifetime.coups)} />
          <Stat
            label="Best night"
            value={lifetime.bestSession === null ? "—" : money.signed(lifetime.bestSession)}
            tone={lifetime.bestSession === null ? "muted" : "good"}
          />
          <Stat
            label="Worst night"
            value={lifetime.worstSession === null ? "—" : money.signed(lifetime.worstSession)}
            tone={lifetime.worstSession === null ? "muted" : "bad"}
          />
        </div>
        {lifetime.totalWagered > 0 ? (
          <p className="field-hint">
            You have staked {money.format(lifetime.totalWagered)} in total, for a net result of{" "}
            {money.signed(lifetime.netProfit)}.{" "}
            {ahead
              ? "Being ahead over a handful of sessions is variance, not an edge — the long-run figure settles at the table's, around 1.06% against you on Banker."
              : "Over enough sessions that settles at the table's edge — around 1.06% if you have been betting Banker."}
          </p>
        ) : null}
      </Card>

      {sessions.length === 0 ? (
        <Card title="No closed sessions yet">
          <p className="prose">
            End a session from Settings and it is filed here with what it cost. The current session
            is already counted in the lifetime totals above.
          </p>
        </Card>
      ) : (
        <Card title="Sessions" subtitle={`${sessions.length} closed, newest first`}>
          <ul className="session-list">
            {sessions.map((session) => (
              <li key={session.id} className="session-row">
                <div className="session-row-head">
                  <span className="session-date">{formatDateTime(session.startedAt)}</span>
                  <span className={session.netProfit >= 0 ? "good" : "bad"}>
                    {money.signed(session.netProfit)}
                  </span>
                  {/*
                    Two taps, not one. A delete here is unrecoverable and the
                    X sits a thumb's width from the row you were reading, so
                    the first tap only arms it.
                  */}
                  {confirming === session.id ? (
                    <span className="session-confirm">
                      <button
                        type="button"
                        className="button button-danger button-tiny"
                        onClick={() => {
                          dispatch({ type: "delete-session", id: session.id });
                          setConfirming(null);
                        }}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className="button button-tiny"
                        onClick={() => setConfirming(null)}
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="session-delete"
                      aria-label={`Delete the session from ${formatDateTime(session.startedAt)}`}
                      onClick={() => {
                        disarm();
                        setConfirming(session.id);
                      }}
                    >
                      &times;
                    </button>
                  )}
                </div>
                <div className="session-row-meta">
                  <span>{name(session.progression)}</span>
                  <span>{session.wagers} wagers</span>
                  <span>
                    {session.wins}W / {session.losses}L
                    {session.pushes > 0 ? ` / ${session.pushes}P` : ""}
                  </span>
                  <span>staked {money.format(session.totalWagered)}</span>
                  <span>{formatDuration(session.endedAt - session.startedAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {sessions.length > 0 ? (
        <Card title="Clear history">
          <Notice tone="warn">
            This deletes every closed session on this device. It cannot be undone, and the lifetime
            totals go with it.
          </Notice>
          {clearingAll ? (
            <div className="button-row">
              <button
                type="button"
                className="button button-danger"
                onClick={() => {
                  dispatch({ type: "clear-archive" });
                  disarm();
                }}
              >
                Yes, delete all {sessions.length}
              </button>
              <button type="button" className="button" onClick={disarm}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="button button-danger"
              onClick={() => {
                disarm();
                setClearingAll(true);
              }}
            >
              Delete {sessions.length} session{sessions.length === 1 ? "" : "s"}
            </button>
          )}
        </Card>
      ) : null}

      {/*
        Last on the screen it destroys, and behind the same two-tap arming
        as the deletes above. It lived in Settings beside End session and
        Reset stake — two routine, reversible buttons — and went off on a
        single tap, which is a lot of standing next to a very different
        kind of action.

        It is a `hydrate` rather than a storage wipe plus a reload: the
        store persists on every state change, so handing it a fresh initial
        state overwrites what is stored and leaves the app running. The
        mobile client does exactly the same thing.
      */}
      <Card title="Erase everything" subtitle="Back to a freshly installed app">
        <Notice tone="warn">
          This clears your table rules, currency, bankroll and limits, the shoe in progress, the
          strategy you picked, every closed session and every kept shoe. It cannot be undone, and
          nothing here is stored anywhere but this device, so there is no copy to restore from.
        </Notice>
        {erasing ? (
          <div className="button-row">
            <button
              type="button"
              className="button button-danger"
              onClick={() => {
                dispatch({ type: "hydrate", state: createInitialState() });
                disarm();
              }}
            >
              Yes, erase everything
            </button>
            <button type="button" className="button" onClick={disarm}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="button button-danger"
            onClick={() => {
              disarm();
              setErasing(true);
            }}
          >
            Erase everything
          </button>
        )}
      </Card>
    </div>
  );
}
