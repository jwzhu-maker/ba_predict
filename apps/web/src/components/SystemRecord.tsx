import { Card, Notice, Stat } from "./Primitives";
import { formatPercent } from "../lib/format";
import { useAppState, useMoney, useSystemRecord } from "../state/store";

/**
 * The selected system across every shoe this device has kept.
 *
 * The single-shoe card answers "what did it make me tonight". This answers
 * "does it work", which is the question worth asking and needs a lot more
 * than one shoe.
 *
 * The two numbers to read against each other are the same pair the staking
 * plans get: how often a shoe finishes ahead, and what the action costs per
 * unit staked. Those two move in opposite directions between the systems on
 * offer and the rate does not move at all, which is the whole lesson.
 *
 * Every kept shoe is replayed under whichever system is selected NOW, not
 * under whatever was selected while it was dealt — the archive holds coups,
 * not stakes. That is what makes switching systems here a fair comparison
 * rather than a mixture of two records.
 */
export default function SystemRecord() {
  const record = useSystemRecord();
  const { activeSystem } = useAppState();
  const money = useMoney();

  // The same marker SystemRun carries directly above: with nothing
  // selected this is the default system's record, and a shoes-ahead
  // figure attributed to a rule the player declined is worse than no
  // figure at all.
  const preview = record.id === activeSystem ? "" : " · not selected, shown for comparison";

  if (record.shoesWithBets === 0) {
    return (
      <Card
        title={`${record.name} record`}
        subtitle={`Builds up as you finish shoes${preview}`}
      >
        <p className="prose">
          Every shoe you finish gets replayed through {record.name}. After a few dozen this shows
          how often it finishes a shoe ahead, and what it costs per unit staked.
        </p>
      </Card>
    );
  }

  const thin = record.shoesWithBets < 10;
  const ahead = record.net >= 0;
  const target = record.config.stopAtNetWins;

  return (
    <Card
      title={`${record.name} record`}
      subtitle={`${record.shoesWithBets} shoe${record.shoesWithBets === 1 ? "" : "s"} played, ${record.bets} bets${preview}`}
    >
      <div className="system-result">
        <span className="field-label">{ahead ? "Ahead by" : "Down by"}</span>
        <span className={`system-net ${ahead ? "good" : "bad"}`}>
          {money.format(Math.abs(record.net))}
        </span>
      </div>

      <div className="stat-grid">
        <Stat
          label="Shoes ahead"
          value={formatPercent(record.successRate, 0)}
          hint={`${record.shoesAhead} of ${record.shoesWithBets}`}
        />
        <Stat label="Bets won" value={formatPercent(record.hitRate, 1)} />
        <Stat
          label="Per unit"
          value={`${record.perUnit >= 0 ? "+" : "−"}${formatPercent(Math.abs(record.perUnit), 2)}`}
          tone={record.perUnit >= 0 ? "good" : "bad"}
          hint="Net over everything staked"
        />
        {target != null ? (
          <Stat
            label={`Reached +${target}`}
            value={formatPercent(record.shoesTargetReached / record.shoesWithBets, 0)}
            hint={`${record.shoesTargetReached} of ${record.shoesWithBets} shoes`}
          />
        ) : null}
        <Stat label="Staked" value={money.format(record.staked)} />
        <Stat
          label="Best shoe"
          value={money.signed(record.bestShoe)}
          tone={record.bestShoe > 0 ? "good" : "muted"}
        />
        <Stat
          label="Worst shoe"
          value={money.signed(record.worstShoe)}
          tone={record.worstShoe < 0 ? "bad" : "muted"}
        />
        <Stat label="Biggest bet" value={money.format(record.peakStake)} />
        <Stat
          label="Clean groups"
          value={`${record.perfectGroups} of ${record.groups}`}
          hint={
            record.perfectGroups > 0
              ? `1 in ${Math.round(record.groups / record.perfectGroups)}`
              : "none yet"
          }
        />
      </div>

      {thin ? (
        <Notice tone="warn">
          Only {record.shoesWithBets} shoe{record.shoesWithBets === 1 ? "" : "s"} so far — these
          numbers are mostly noise until you have a few dozen.
        </Notice>
      ) : null}

      {record.approximate ? (
        <Notice tone="warn">
          Your table pays a reduced rate on a Banker win with 6, which recorded coups do not
          capture, so the Banker legs are slightly generous.
        </Notice>
      ) : null}

      <p className="field-hint">
        Read <strong>Shoes ahead</strong> against <strong>Per unit</strong>. Switch the system
        above and both of the first two numbers will move &mdash; a rule that sits out most hands
        wins fewer shoes by more, one that backs every hand wins more shoes by less. The third
        will not: per unit staked they cost the same, because when and how much you bet has never
        changed what a bet costs.
      </p>
    </Card>
  );
}
