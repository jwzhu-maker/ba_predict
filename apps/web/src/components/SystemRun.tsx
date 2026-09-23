import {
  bettableHands,
  describeRunShape,
  describeSystemRules,
} from "@ba-predict/app-core";
import { Card, Notice, Stat } from "./Primitives";
import { formatPercent } from "../lib/format";
import { useAppState, useMoney, useSystemRun } from "../state/store";

/**
 * The selected system played over the shoe on screen, group by group.
 *
 * This is the "calculate the gain/loss once the game finishes" half. It runs
 * the hands that really came out, so it is measurement rather than a forecast
 * — the same hindsight the staking-plan replay gives, for a rule that also
 * picks the side and decides when to sit out.
 *
 * The group table is the part worth reading. The headline number is one
 * shoe's luck; the groups show the SHAPE of the rule, which is the thing that
 * repeats — and the two systems have very different shapes, which is why
 * every word here is read off `run.config` rather than written out.
 */
export default function SystemRun() {
  const { run, finished } = useSystemRun();
  const { activeSystem } = useAppState();
  const money = useMoney();

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
        <p className="prose">{describeSystemRules(run.config, money)}</p>
      </Card>
    );
  }

  if (run.bets === 0) {
    const left = run.config.lookback + 1 - run.handsAvailable;
    return (
      <Card title={run.name} subtitle={`${run.handsAvailable} hands, still watching${preview}`}>
        <p className="prose">
          No bets yet — the rule watches the first {run.config.lookback} hands.{" "}
          {left > 0 ? `${left} more to go.` : null}
        </p>
      </Card>
    );
  }

  const ahead = run.net >= 0;

  return (
    <Card
      title={finished ? `${run.name}, last shoe` : `${run.name}, this shoe`}
      subtitle={`${run.handsAvailable} hands after ties${run.incomplete ? ", shoe ended early" : ""}${preview}`}
    >
      <div className="system-result">
        <span className="field-label">{ahead ? "Ahead by" : "Down by"}</span>
        <span className={`system-net ${ahead ? "good" : "bad"}`}>
          {money.format(Math.abs(run.net))}
        </span>
      </div>

      <div className="stat-grid">
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
          hint="Net over everything staked"
        />
        <Stat label="Clean groups" value={`${run.perfectGroups} of ${run.groups.length}`} />
      </div>

      <div className="table-scroll">
        <table className="odds-table odds-table-fluid">
          <thead>
            <tr>
              <th scope="col">Group</th>
              <th scope="col">Bets</th>
              <th scope="col">Staked</th>
              <th scope="col">Net</th>
            </tr>
          </thead>
          <tbody>
            {run.groups.map((group) => (
              <tr key={group.group}>
                <th scope="row">
                  {group.group}
                  <span className="row-note row-note-muted">
                    {group.perfect
                      ? `hands ${group.firstHand}–${group.lastHand}, all won`
                      : group.lostAt !== null
                        ? `hands ${group.firstHand}–${group.lastHand}, lost on ${group.lostAt}`
                        : `hands ${group.firstHand}–${group.lastHand}, shoe ended`}
                  </span>
                </th>
                <td>
                  {group.wins}/{group.bets}
                </td>
                <td>{money.format(group.staked)}</td>
                <td className={group.net >= 0 ? "good" : "bad"}>{money.signed(group.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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

      <p className="field-hint">
        One shoe of hindsight, on the hands that actually came out. What repeats is the shape,
        not the total:{" "}
        {describeRunShape(run.config)}
      </p>
    </Card>
  );
}
