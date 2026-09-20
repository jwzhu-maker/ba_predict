import {
  PROGRESSIONS,
  betLabel,
  simulateSessions,
  type ProgressionId,
  type SimulationResult,
} from "@ba-predict/engine";
import { useState } from "react";
import { View } from "react-native";
import ShoeReplay from "../components/ShoeReplay";
import StrategyRecord from "../components/StrategyRecord";
import SystemRecord from "../components/SystemRecord";
import SystemRun from "../components/SystemRun";
import { Btn, Card, Hint, NumberInput, Picker, Row, Stat, SwitchRow } from "../components/ui";
import { formatPercent, formatUnits } from "../lib/format";
import { useAdvice, useAppState } from "../state/store";

/**
 * The comparison that actually distinguishes staking plans.
 *
 * Expected value cannot: every plan loses the same fraction of total action.
 * The distribution can, and it is where the trade each system makes becomes
 * visible — a Martingale's high median is paid for by its fifth percentile.
 */
export default function SimulatorScreen() {
  const { session } = useAppState();
  const advice = useAdvice();

  const [progression, setProgression] = useState<ProgressionId>(session.progression.id);
  const [bankrollUnits, setBankrollUnits] = useState(
    Math.max(1, Math.round(session.bankroll.bankroll / (session.bankroll.unitSize || 1))),
  );
  const [coups, setCoups] = useState(100);
  const [stopWin, setStopWin] = useState(20);
  const [stopLoss, setStopLoss] = useState(40);
  const [useStops, setUseStops] = useState(true);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [running, setRunning] = useState(false);

  const bet = advice.bet ?? "banker";
  const valuation = advice.valuations?.[bet];
  const maxUnits =
    session.bankroll.unitSize > 0
      ? Math.floor(session.bankroll.tableMax / session.bankroll.unitSize)
      : null;

  const run = () => {
    if (!valuation) return;
    setRunning(true);
    // Let the button repaint before a synchronous run of a few million coups.
    setTimeout(() => {
      setResult(
        simulateSessions({
          payoffs: valuation.payoffs,
          bankrollUnits,
          progression,
          progressionOptions: { ...session.progressionOptions, maxUnits },
          coupsPerSession: coups,
          stopWinUnits: useStops ? stopWin : null,
          stopLossUnits: useStops ? stopLoss : null,
          trials: 10_000,
          seed: 20260920,
        }),
      );
      setRunning(false);
    }, 0);
  };

  const definition = PROGRESSIONS.find((entry) => entry.id === progression);

  return (
    <View style={{ gap: 12 }}>
      {/* Your own rule leads, because it is the one you are actually playing.
          The ten built-in plans below are the comparison, not the headline. */}
      <SystemRun />

      <SystemRecord />

      <StrategyRecord />

      <ShoeReplay />

      <Card
        title="Simulate a session"
        subtitle={`10,000 sessions of ${betLabel(bet)} at your table's rules`}
      >
        <Picker
          label="Staking plan"
          value={progression}
          options={PROGRESSIONS.map((entry) => ({ value: entry.id, label: entry.name }))}
          hint={definition?.summary}
          onChange={setProgression}
        />
        <NumberInput
          label="Bankroll (units)"
          value={bankrollUnits}
          min={1}
          onChange={setBankrollUnits}
        />
        <NumberInput label="Coups per session" value={coups} min={1} onChange={setCoups} />
        <SwitchRow label="Walk away at a limit" value={useStops} onChange={setUseStops} />
        {useStops ? (
          <>
            <NumberInput label="Stop-win (units)" value={stopWin} min={1} onChange={setStopWin} />
            <NumberInput
              label="Stop-loss (units)"
              value={stopLoss}
              min={1}
              onChange={setStopLoss}
            />
          </>
        ) : null}
        <Btn
          label={running ? "Running…" : "Run 10,000 sessions"}
          variant="primary"
          disabled={running || !valuation}
          onPress={run}
        />
        {maxUnits !== null ? (
          <Hint>
            Table maximum applies: {formatUnits(maxUnits)} units. A ladder that asks for more ends
            the session, which is how these systems actually fail.
          </Hint>
        ) : null}
      </Card>

      {result ? (
        <>
          <Card title="How the sessions ended">
            <Row>
              <Stat
                label="Finished ahead"
                value={formatPercent(result.winningSessionRate, 1)}
                tone={result.winningSessionRate > 0.5 ? "good" : undefined}
                hint="up at the final coup"
              />
              <Stat
                label="Hit stop-win"
                value={formatPercent(result.endings["stop-win"] / result.trials, 1)}
              />
              <Stat
                label="Hit stop-loss"
                value={formatPercent(result.endings["stop-loss"] / result.trials, 1)}
                tone="bad"
              />
              <Stat
                label="Went broke"
                value={formatPercent(result.ruinRate, 1)}
                tone={result.ruinRate > 0 ? "bad" : "muted"}
              />
              <Stat
                label="Broke the limit"
                value={formatPercent(result.tableLimitRate, 1)}
                tone={result.tableLimitRate > 0 ? "bad" : "muted"}
                hint="ladder outran the table"
              />
            </Row>
          </Card>

          <Card title="What you take home" subtitle="In units">
            <Row>
              <Stat label="Median" value={formatUnits(result.medianResultUnits)} />
              <Stat
                label="Mean"
                value={formatUnits(result.meanResultUnits)}
                tone={result.meanResultUnits < 0 ? "bad" : "good"}
              />
              <Stat
                label="Bad night (5%)"
                value={formatUnits(result.percentile5Units)}
                tone="bad"
              />
              <Stat
                label="Good night (95%)"
                value={formatUnits(result.percentile95Units)}
                tone="good"
              />
              <Stat label="Worst seen" value={formatUnits(result.worstUnits)} tone="bad" />
              <Stat label="Biggest stake" value={`${formatUnits(result.peakStakeUnits)}u`} />
            </Row>
            <Hint>
              The median can sit above zero while the mean sits below it. That gap is the whole
              appeal of a steep progression, and it is paid for by the 5th percentile.
            </Hint>
          </Card>

          <Card title="The cost, whatever the plan">
            <Row>
              <Stat label="Average action" value={`${formatUnits(result.meanWageredUnits)}u`} />
              <Stat label="Edge paid" value={formatPercent(result.impliedEdge)} tone="bad" />
              <Stat
                label="Table's edge"
                value={valuation ? formatPercent(valuation.houseEdge) : "—"}
              />
              <Stat label="Coups played" value={formatUnits(result.meanCoupsPlayed)} />
            </Row>
            <Hint>
              Those two edges are the same number, and they stay the same number for every plan in
              the list. A staking system redistributes outcomes; it does not buy any of them back.
            </Hint>
          </Card>
        </>
      ) : null}
    </View>
  );
}
