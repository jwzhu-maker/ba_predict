import { describeEdge } from "@ba-predict/app-core";
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
 */
export default function HistoryScreen() {
  // Which row's X has been armed, and whether the clear-all is armed. Both
  // deletes are unrecoverable, so neither happens on a single tap.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

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
            value={
              lifetime.sessions > 0
                ? `${lifetime.winningSessions}/${lifetime.sessions}`
                : "—"
            }
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
            You have staked {money.format(lifetime.totalWagered)} in total, for a net
            result of {money.signed(lifetime.netProfit)}.{" "}
            {ahead
              ? "Being ahead over a handful of sessions is variance, not an edge — the long-run figure settles at the table's, around 1.06% against you on Banker."
              : "Over enough sessions that settles at the table's edge — around 1.06% if you have been betting Banker."}
          </p>
        ) : null}
      </Card>

      {sessions.length === 0 ? (
        <Card title="No closed sessions yet">
          <p className="prose">
            End a session from Settings and it is filed here with what it cost. The current
            session is already counted in the lifetime totals above.
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
                      onClick={() => setConfirming(session.id)}
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
            This deletes every closed session on this device. It cannot be undone, and the
            lifetime totals go with it.
          </Notice>
          {clearingAll ? (
            <div className="button-row">
              <button
                type="button"
                className="button button-danger"
                onClick={() => {
                  dispatch({ type: "clear-archive" });
                  setClearingAll(false);
                  setConfirming(null);
                }}
              >
                Yes, delete all {sessions.length}
              </button>
              <button type="button" className="button" onClick={() => setClearingAll(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="button button-danger"
              onClick={() => setClearingAll(true)}
            >
              Delete {sessions.length} session{sessions.length === 1 ? "" : "s"}
            </button>
          )}
        </Card>
      ) : null}
    </div>
  );
}
