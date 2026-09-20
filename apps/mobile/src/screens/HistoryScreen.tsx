import { describeEdge } from "@ba-predict/app-core";
import { PROGRESSIONS } from "@ba-predict/engine";
import { StyleSheet, Text, View } from "react-native";
import { Btn, Card, Hint, Notice, Prose, Row, Stat } from "../components/ui";
import { formatDateTime, formatDuration, formatPercent, formatUnits } from "../lib/format";
import { useAppState, useDispatch, useLifetime, useMoney } from "../state/store";
import { usePalette } from "../theme";

/**
 * Every session you have closed, and what they add up to.
 *
 * A single session is mostly luck; the lifetime row is where the edge becomes
 * visible. That is the one number worth looking at here, so it is at the top
 * and it is stated as a cost rather than a win rate.
 */
export default function HistoryScreen() {
  const { archive } = useAppState();
  const dispatch = useDispatch();
  const lifetime = useLifetime();
  const money = useMoney();
  const p = usePalette();
  const s = useLocalStyles();

  const name = (id: string) => PROGRESSIONS.find((entry) => entry.id === id)?.name ?? id;
  const sessions = [...archive].reverse();
  const edge = describeEdge(lifetime.actualEdge);
  const ahead = edge.ahead;

  return (
    <View style={{ gap: 12 }}>
      <Card title="Lifetime" subtitle="Every closed session, plus the one running now">
        <Row>
          <Stat label="Sessions" value={String(lifetime.sessions)} />
          <Stat
            label="Net"
            value={money.signed(lifetime.netProfit)}
            tone={lifetime.netProfit >= 0 ? "good" : "bad"}
          />
          <Stat label="Staked" value={money.format(lifetime.totalWagered)} />
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
        </Row>
        {lifetime.totalWagered > 0 ? (
          <Hint>
            You have staked {money.format(lifetime.totalWagered)} in total, for a net
            result of {money.signed(lifetime.netProfit)}.{" "}
            {ahead
              ? "Being ahead over a handful of sessions is variance, not an edge — the long-run figure settles at the table's, around 1.06% against you on Banker."
              : "Over enough sessions that settles at the table's edge — around 1.06% if you have been betting Banker."}
          </Hint>
        ) : null}
      </Card>

      {sessions.length === 0 ? (
        <Card title="No closed sessions yet">
          <Prose>
            End a session from Settings and it is filed here with what it cost. The current
            session is already counted in the lifetime totals above.
          </Prose>
        </Card>
      ) : (
        <Card title="Sessions" subtitle={`${sessions.length} closed, newest first`}>
          <View style={{ gap: 8 }}>
            {sessions.map((session) => (
              <View key={session.id} style={s.row}>
                <View style={s.head}>
                  <Text style={s.date}>{formatDateTime(session.startedAt)}</Text>
                  <Text
                    style={[s.net, { color: session.netProfit >= 0 ? p.accent : p.danger }]}
                  >
                    {money.signed(session.netProfit)}
                  </Text>
                </View>
                <Text style={s.meta}>
                  {name(session.progression)} · {session.wagers} wagers · {session.wins}W /{" "}
                  {session.losses}L
                  {session.pushes > 0 ? ` / ${session.pushes}P` : ""} · staked{" "}
                  {money.format(session.totalWagered)} ·{" "}
                  {formatDuration(session.endedAt - session.startedAt)}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {sessions.length > 0 ? (
        <Card title="Clear history">
          <Notice tone="warn">
            This deletes every closed session on this device. It cannot be undone, and the
            lifetime totals go with it.
          </Notice>
          <Btn
            label={`Delete ${sessions.length} session${sessions.length === 1 ? "" : "s"}`}
            variant="danger"
            onPress={() => dispatch({ type: "clear-archive" })}
          />
        </Card>
      ) : null}
    </View>
  );
}

function useLocalStyles() {
  const p = usePalette();
  return StyleSheet.create({
    row: { backgroundColor: p.surface2, borderRadius: 10, padding: 10, gap: 4 },
    head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    date: { color: p.text, fontSize: 13, fontWeight: "600" },
    net: { fontSize: 14, fontWeight: "700" },
    meta: { color: p.muted, fontSize: 11, lineHeight: 16 },
  });
}
