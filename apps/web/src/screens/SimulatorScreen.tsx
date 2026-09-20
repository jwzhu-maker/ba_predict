import {
  PROGRESSIONS,
  betLabel,
  simulateSessions,
  type ProgressionId,
  type SimulationResult,
} from "@ba-predict/engine";
import { useState } from "react";
import { Card, NumberField, Stat } from "../components/Primitives";
import ShoeReplay from "../components/ShoeReplay";
import { formatPercent, formatUnits } from "../lib/format";
import { useAdvice, useAppState } from "../state/store";

/**
 * Play the staking plan out thousands of times.
 *
 * This is the screen that answers the question people actually mean when they
 * ask which system is best. Expected value cannot distinguish them — they all
 * lose the same fraction of total action — so the only honest comparison is
 * the distribution: how often you go home up, and how bad the bad night is.
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
          trials: 20_000,
          seed: 20260920,
        }),
      );
      setRunning(false);
    }, 0);
  };

  const definition = PROGRESSIONS.find((entry) => entry.id === progression);

  return (
    <div className="screen">
      <ShoeReplay />

      <Card
        title="Simulate a session"
        subtitle={`20,000 sessions of ${betLabel(bet)} at your table's rules`}
      >
        <div className="field">
          <span className="field-label">Staking plan</span>
          <select
            className="input"
            value={progression}
            onChange={(event) => setProgression(event.target.value as ProgressionId)}
          >
            {PROGRESSIONS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          {definition ? <span className="field-hint">{definition.summary}</span> : null}
        </div>

        <div className="field-grid">
          <NumberField
            label="Bankroll (units)"
            value={bankrollUnits}
            min={1}
            onChange={setBankrollUnits}
          />
          <NumberField label="Coups per session" value={coups} min={1} onChange={setCoups} />
        </div>

        <label className="toggle">
          <input
            type="checkbox"
            checked={useStops}
            onChange={(event) => setUseStops(event.target.checked)}
          />
          <span className="toggle-track" aria-hidden="true">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-text">
            <span className="toggle-label">Walk away at a limit</span>
          </span>
        </label>

        {useStops ? (
          <div className="field-grid">
            <NumberField label="Stop-win (units)" value={stopWin} min={1} onChange={setStopWin} />
            <NumberField
              label="Stop-loss (units)"
              value={stopLoss}
              min={1}
              onChange={setStopLoss}
            />
          </div>
        ) : null}

        <button
          type="button"
          className="button button-primary"
          onClick={run}
          disabled={running || !valuation}
        >
          {running ? "Running…" : "Run 20,000 sessions"}
        </button>
        {maxUnits !== null ? (
          <p className="field-hint">
            Table maximum applies: {formatUnits(maxUnits)} units. A ladder that asks for more
            ends the session, which is how these systems actually fail.
          </p>
        ) : null}
      </Card>

      {result ? (
        <>
          <Card title="How the sessions ended">
            <div className="stat-grid">
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
                label="Broke the table limit"
                value={formatPercent(result.tableLimitRate, 1)}
                tone={result.tableLimitRate > 0 ? "bad" : "muted"}
                hint="ladder outran the maximum"
              />
            </div>
          </Card>

          <Card title="What you take home" subtitle="In units, across 20,000 sessions">
            <div className="stat-grid">
              <Stat label="Median" value={formatUnits(result.medianResultUnits)} />
              <Stat
                label="Mean"
                value={formatUnits(result.meanResultUnits)}
                tone={result.meanResultUnits < 0 ? "bad" : "good"}
              />
              <Stat label="Bad night (5th %ile)" value={formatUnits(result.percentile5Units)} tone="bad" />
              <Stat label="Good night (95th %ile)" value={formatUnits(result.percentile95Units)} tone="good" />
              <Stat label="Worst seen" value={formatUnits(result.worstUnits)} tone="bad" />
              <Stat label="Biggest stake reached" value={`${formatUnits(result.peakStakeUnits)}u`} />
            </div>
            <p className="field-hint">
              The median can sit above zero while the mean sits below it. That gap is the whole
              appeal of a steep progression, and the gap is paid for by the 5th percentile.
            </p>
          </Card>

          <Card title="The cost, whatever the plan">
            <div className="stat-grid">
              <Stat label="Average action" value={`${formatUnits(result.meanWageredUnits)}u`} />
              <Stat
                label="Edge actually paid"
                value={formatPercent(result.impliedEdge)}
                tone="bad"
              />
              <Stat
                label="Table's edge"
                value={valuation ? formatPercent(valuation.houseEdge) : "—"}
              />
              <Stat label="Coups played" value={formatUnits(result.meanCoupsPlayed)} />
            </div>
            <p className="field-hint">
              Those two edges are the same number, and they stay the same number for every plan in
              the list. A staking system redistributes outcomes; it does not buy any of them back.
            </p>
          </Card>
        </>
      ) : null}
    </div>
  );
}
