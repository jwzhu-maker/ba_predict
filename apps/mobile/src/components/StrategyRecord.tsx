import { betLabel } from "@ba-predict/engine";
import { Text, View } from "react-native";
import { formatPercent, formatUnits } from "../lib/format";
import { useAppState, useDispatch, useStrategyRecord } from "../state/store";
import { usePalette } from "../theme";
import { Btn, Card, Hint, Notice, Prose, useStyles } from "./ui";

/**
 * Every staking plan's record over every shoe this device has recorded.
 *
 * The two middle columns disagree on purpose. "Won" is what makes a system
 * feel like it works — a Martingale finishes over 90% of shoes ahead. "Per
 * unit" is what it actually costs, and it sits in the same narrow band for
 * every plan. A system buys the first by selling the tail.
 */
export default function StrategyRecord() {
  const record = useStrategyRecord();
  const { shoeArchive } = useAppState();
  const dispatch = useDispatch();
  const p = usePalette();
  const s = useStyles(p);

  if (record.shoes === 0) {
    return (
      <Card title="Strategy record" subtitle="Builds up as you finish shoes">
        <Prose>
          Every shoe you finish is kept and replayed through all ten staking plans. After a few
          shoes this shows how often each one finished ahead — and what each was paying per unit
          staked to do it.
        </Prose>
      </Card>
    );
  }

  return (
    <Card
      title="Strategy record"
      subtitle={`${record.shoes} shoe${record.shoes === 1 ? "" : "s"}, ${record.coups} coups, betting ${betLabel(record.bet)}`}
    >
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row" }}>
          <Text style={[s.fieldLabel, { flex: 1 }]}>PLAN</Text>
          <Text style={[s.fieldLabel, { width: 46, textAlign: "right" }]}>WON</Text>
          <Text style={[s.fieldLabel, { width: 62, textAlign: "right" }]}>NET</Text>
          <Text style={[s.fieldLabel, { width: 58, textAlign: "right" }]}>PER UNIT</Text>
        </View>
        {record.rows.map((row) => (
          <View key={row.progression} style={{ flexDirection: "row", paddingVertical: 3 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.text, fontSize: 13, fontWeight: "600" }}>{row.name}</Text>
              {row.breakdowns > 0 ? (
                <Text style={{ color: p.warn, fontSize: 10 }}>
                  broke down in {row.breakdowns} of {row.shoes}
                </Text>
              ) : null}
            </View>
            <Text style={{ width: 46, textAlign: "right", fontSize: 13, color: p.text }}>
              {formatPercent(row.successRate, 0)}
            </Text>
            <Text
              style={{
                width: 62,
                textAlign: "right",
                fontSize: 13,
                color: row.netUnits >= 0 ? p.accent : p.danger,
              }}
            >
              {row.netUnits >= 0 ? "+" : "−"}
              {formatUnits(Math.abs(row.netUnits))}u
            </Text>
            <Text
              style={{
                width: 58,
                textAlign: "right",
                fontSize: 13,
                color: row.perUnit >= 0 ? p.accent : p.danger,
              }}
            >
              {row.perUnit >= 0 ? "+" : "−"}
              {formatPercent(Math.abs(row.perUnit), 1)}
            </Text>
          </View>
        ))}
      </View>

      {record.shoes < 10 ? (
        <Notice tone="warn">
          Only {record.shoes} shoe{record.shoes === 1 ? "" : "s"} so far — these numbers are
          mostly noise until you have a few dozen.
        </Notice>
      ) : null}

      {record.approximate ? (
        <Notice tone="warn">
          Your table pays a reduced rate on a Banker win with 6, which recorded coups do not
          capture, so the Banker figures here are slightly generous.
        </Notice>
      ) : null}

      <Hint>
        Read Won and Per unit against each other. Won is what makes a system feel like it works,
        and the steep ones score very well on it. Per unit is what each actually costs, and it
        lands in the same narrow band for all of them. The difference is the tail: the rare shoe
        where the ladder hits the table maximum pays for every shoe it won.
      </Hint>

      {shoeArchive.length > 0 ? (
        <Btn
          label={`Forget ${shoeArchive.length} recorded shoe${shoeArchive.length === 1 ? "" : "s"}`}
          variant="danger"
          onPress={() => dispatch({ type: "clear-shoe-archive" })}
        />
      ) : null}
    </Card>
  );
}
