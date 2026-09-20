import { Card, Notice, Stat } from "./Primitives";
import { formatPercent } from "../lib/format";
import { useMoney, useSystemRun } from "../state/store";

/**
 * Reverse 12 played over the shoe on screen, group by group.
 *
 * This is the "calculate the gain/loss once the game finishes" half. It runs
 * the hands that really came out, so it is measurement rather than a forecast
 * — the same hindsight the staking-plan replay gives, for a rule that also
 * picks the side and decides when to sit out.
 *
 * The group table is the part worth reading. The headline number is one
 * shoe's luck; the groups show the SHAPE of the rule, which is the thing that
 * repeats: most groups stop after a bet or two, and the rare clean run is
 * where the money is.
 */
export default function SystemRun() {
  const { run, finished } = useSystemRun();
  const money = useMoney();

  const possible =
    run.config.lastHand === null
      ? null
      : Math.max(0, run.config.lastHand - run.config.lookback);

  if (run.handsAvailable === 0) {
    return (
      <Card title="Reverse 12" subtitle="Runs as you record results">
        <p className="prose">
          Your own rule: watch {run.config.lookback} hands, then from hand {run.config.lookback + 1}{" "}
          back the opposite of the hand {run.config.lookback} before it. Groups of{" "}
          {run.config.groupSize}, opening at {money.format(run.config.baseStake)} and adding{" "}
          {money.format(run.config.stakeStep)} after each win, stopping the group on its first
          loss and the shoe after hand {run.config.lastHand}. Ties are deleted before any of that
          is counted.
        </p>
      </Card>
    );
  }

  if (run.bets === 0) {
    const left = run.config.lookback + 1 - run.handsAvailable;
    return (
      <Card title="Reverse 12" subtitle={`${run.handsAvailable} hands, still watching`}>
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
      title={finished ? "Reverse 12, last shoe" : "Reverse 12, this shoe"}
      subtitle={`${run.handsAvailable} hands after ties${run.incomplete ? ", shoe ended early" : ""}`}
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
          value={possible === null ? String(run.bets) : `${run.bets} of ${possible}`}
          hint="A group stops at its first loss"
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

      {run.approximate ? (
        <Notice tone="warn">
          Your table pays a reduced rate on a Banker win with 6, which recorded coups do not
          capture, so the Banker legs here are slightly generous.
        </Notice>
      ) : null}

      <p className="field-hint">
        One shoe of hindsight, on the hands that actually came out. What repeats is the shape,
        not the total: a group stops at its first loss, so it lands about two bets on average
        rather than {run.config.groupSize}, and the top of the ladder is reached roughly once in{" "}
        {2 ** run.config.groupSize} groups.
      </p>
    </Card>
  );
}
