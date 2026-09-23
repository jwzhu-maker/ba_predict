import { Text, View } from "react-native";
import {
  bettableHands,
  describeRunShape,
  describeSystemRules,
} from "@ba-predict/app-core";
import { formatPercent } from "../lib/format";
import { useAppState, useMoney, useSystemRun } from "../state/store";
import { usePalette } from "../theme";
import { Card, Hint, Notice, Prose, Row, Stat, useStyles } from "./ui";

/**
 * The selected system played over the shoe on screen, group by group.
 *
 * The "calculate the gain/loss once the game finishes" half. Hindsight on the
 * hands that really came out, so it is measurement, not a forecast.
 *
 * The group rows are the part worth reading: the headline is one shoe's luck,
 * the groups show the shape that repeats — and the two systems have very
 * different shapes, which is why the copy is read off `run.config` rather
 * than written out.
 */
export default function SystemRun() {
  const { run, finished } = useSystemRun();
  const { activeSystem } = useAppState();
  const money = useMoney();
  const p = usePalette();
  const s = useStyles(p);

  const possible = bettableHands(run);
  const gated = run.config.groupsGateBetting;
  // Compared by id, not by `activeSystem === null`: the run falls back to
  // the default for an unselected OR unrecognised id, and either way this
  // card is then showing what that system WOULD have done rather than what
  // was played.
  const preview = run.id === activeSystem ? "" : " · not selected, shown for comparison";

  if (run.handsAvailable === 0) {
    return (
      <Card title={run.name} subtitle={`Runs as you record results${preview}`}>
        <Prose>{describeSystemRules(run.config, money)}</Prose>
      </Card>
    );
  }

  if (run.bets === 0) {
    const left = run.config.lookback + 1 - run.handsAvailable;
    return (
      <Card title={run.name} subtitle={`${run.handsAvailable} hands, still watching${preview}`}>
        <Prose>
          No bets yet — the rule watches the first {run.config.lookback} hands.
          {left > 0 ? ` ${left} more to go.` : ""}
        </Prose>
      </Card>
    );
  }

  const ahead = run.net >= 0;

  return (
    <Card
      title={finished ? `${run.name}, last shoe` : `${run.name}, this shoe`}
      subtitle={`${run.handsAvailable} hands after ties${run.incomplete ? ", shoe ended early" : ""}${preview}`}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
        <Text style={s.fieldLabel}>{ahead ? "AHEAD BY" : "DOWN BY"}</Text>
        <Text style={{ fontSize: 30, fontWeight: "800", color: ahead ? p.accent : p.danger }}>
          {money.format(Math.abs(run.net))}
        </Text>
      </View>

      <Row>
        <Stat
          label="Bets placed"
          value={`${run.bets} of ${possible}`}
          hint={gated ? "A group stops at its first loss" : "Every hand in the range"}
        />
        <Stat label="Won" value={`${run.wins} (${formatPercent(run.wins / run.bets, 0)})`} />
        <Stat label="Staked" value={money.format(run.staked)} />
        <Stat label="Biggest bet" value={money.format(run.peakStake)} />
        <Stat
          label="Per unit"
          value={`${run.perUnit >= 0 ? "+" : "−"}${formatPercent(Math.abs(run.perUnit), 1)}`}
          tone={run.perUnit >= 0 ? "good" : "bad"}
        />
        <Stat label="Clean groups" value={`${run.perfectGroups} of ${run.groups.length}`} />
      </Row>

      <View style={{ gap: 6, marginTop: 8 }}>
        <View style={{ flexDirection: "row" }}>
          {/* Currency strings do not fit a fixed column: MYR renders
              "−RM 2,100.00", which wraps rather than ellipsizes in RN and
              breaks the row. The money columns flex and the narrow count
              stays fixed. */}
          <Text style={[s.fieldLabel, { flex: 1.1 }]}>GROUP</Text>
          <Text style={[s.fieldLabel, { width: 42, textAlign: "right" }]}>BETS</Text>
          <Text style={[s.fieldLabel, { flex: 1, textAlign: "right" }]}>STAKED</Text>
          <Text style={[s.fieldLabel, { flex: 1, textAlign: "right" }]}>NET</Text>
        </View>
        {run.groups.map((group) => (
          <View key={group.group} style={{ flexDirection: "row", paddingVertical: 3 }}>
            <View style={{ flex: 1.1 }}>
              <Text style={{ color: p.text, fontSize: 13, fontWeight: "600" }}>{group.group}</Text>
              <Text style={{ color: p.muted, fontSize: 10 }}>
                {group.perfect
                  ? `hands ${group.firstHand}–${group.lastHand}, all won`
                  : group.lostAt !== null
                    ? `hands ${group.firstHand}–${group.lastHand}, lost on ${group.lostAt}`
                    : `hands ${group.firstHand}–${group.lastHand}, shoe ended`}
              </Text>
            </View>
            <Text style={{ width: 42, textAlign: "right", fontSize: 13, color: p.text }}>
              {group.wins}/{group.bets}
            </Text>
            <Text style={{ flex: 1, textAlign: "right", fontSize: 13, color: p.text }}>
              {money.format(group.staked)}
            </Text>
            <Text
              style={{
                flex: 1,
                textAlign: "right",
                fontSize: 13,
                color: group.net >= 0 ? p.accent : p.danger,
              }}
            >
              {money.signed(group.net)}
            </Text>
          </View>
        ))}
      </View>

      {run.incomplete ? (
        <Notice tone="info">
          The shoe ran out at hand {run.handsAvailable}, before hand {run.config.lastHand}. Ties
          are deleted first, so a 70-coup shoe with 7 ties only reaches hand 63.
        </Notice>
      ) : null}

      {run.clippedBets > 0 ? (
        <Notice tone="warn">
          The table maximum held {run.clippedBets} bet{run.clippedBets === 1 ? "" : "s"} below what
          the ladder asked for, so this is what the rule managed at your table rather than the
          rule as written.
          {run.config.staking === "martingale"
            ? " At the clipped top stake, the two net wins that end a hold no longer cover the climb's losses."
            : null}
        </Notice>
      ) : null}

      {run.approximate ? (
        <Notice tone="warn">
          Your table pays a reduced rate on a Banker win with 6, which recorded coups do not
          capture, so the Banker legs here are slightly generous.
        </Notice>
      ) : null}

      <Hint>
        One shoe of hindsight, on the hands that actually came out. What repeats is the shape, not
        the total:{" "}
        {describeRunShape(run.config)}
      </Hint>
    </Card>
  );
}
