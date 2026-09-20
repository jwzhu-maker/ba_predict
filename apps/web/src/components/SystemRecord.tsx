import { Card, Notice, Stat } from "./Primitives";
import { formatPercent } from "../lib/format";
import { useMoney, useSystemRecord } from "../state/store";

/**
 * Reverse 12 across every shoe this device has kept.
 *
 * The single-shoe card answers "what did it make me tonight". This answers
 * "does it work", which is the question worth asking and needs a lot more
 * than one shoe.
 *
 * The two numbers to read against each other are the same pair the staking
 * plans get: how often a shoe finishes ahead, and what the action costs per
 * unit staked. This rule stakes on roughly a third of the hands a flat bettor
 * would, so it loses less MONEY per shoe — and exactly the same RATE, because
 * when you bet has never changed what a bet costs.
 */
export default function SystemRecord() {
  const record = useSystemRecord();
  const money = useMoney();

  if (record.shoesWithBets === 0) {
    return (
      <Card title="Reverse 12 record" subtitle="Builds up as you finish shoes">
        <p className="prose">
          Every shoe you finish gets replayed through your rule. After a few dozen this shows how
          often it finishes a shoe ahead, and what it costs per unit staked.
        </p>
      </Card>
    );
  }

  const thin = record.shoesWithBets < 10;
  const ahead = record.net >= 0;

  return (
    <Card
      title="Reverse 12 record"
      subtitle={`${record.shoesWithBets} shoe${record.shoesWithBets === 1 ? "" : "s"} played, ${record.bets} bets`}
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
        Read <strong>Shoes ahead</strong> against <strong>Per unit</strong>. The rule wins a
        minority of shoes and loses small on most of them, then occasionally runs a group clean
        and wins big &mdash; the mirror image of a Martingale, which wins nearly every shoe and
        loses everything on one. Per unit staked the two cost the same, because sitting out hands
        changes how much you bet, never what a bet costs.
      </p>
    </Card>
  );
}
