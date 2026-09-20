import { betLabel } from "@ba-predict/engine";
import { Card, Notice } from "./Primitives";
import { formatPercent, formatUnits } from "../lib/format";
import { useShoeReplay } from "../state/store";

/**
 * What every staking plan would have done on the shoe you actually played.
 *
 * Hindsight on real coups, so there is no sampling here — but hindsight on
 * ONE shoe, which is why the cost column matters more than the ranking. The
 * plan at the top won a coin-flip's worth of variance; the plan's real shape
 * is the simulation below.
 */
/**
 * Net as a share of everything the plan staked.
 *
 * Signed, under a direction-neutral header ("per unit") on purpose: this is
 * the house edge with the sign flipped, and putting a negative number under a
 * word like "cost" is the exact mislabelling this app has already had to fix
 * three times.
 */
function perUnit(row: { netUnits: number; totalStakedUnits: number }): number {
  return row.totalStakedUnits === 0 ? 0 : row.netUnits / row.totalStakedUnits;
}

export default function ShoeReplay() {
  const shoe = useShoeReplay();

  if (!shoe) {
    return (
      <Card title="This shoe, replayed" subtitle="Available once you have recorded some results">
        <p className="prose">
          Record a few coups on the Table tab and every staking plan is replayed against them
          here — the same outcomes, ten different ways of sizing the bet.
        </p>
      </Card>
    );
  }

  const { replay, finished } = shoe;

  return (
    <Card
      title={finished ? "Last shoe, replayed" : "This shoe, replayed"}
      subtitle={`${replay.coups} coups, every plan betting ${betLabel(replay.bet)}`}
    >
      <div className="table-scroll">
        <table className="odds-table odds-table-fluid">
          <thead>
            <tr>
              <th scope="col">Plan</th>
              <th scope="col">Net</th>
              <th scope="col">Peak</th>
              <th scope="col">Per unit</th>
            </tr>
          </thead>
          <tbody>
            {replay.rows.map((row) => (
              <tr key={row.progression}>
                <th scope="row">
                  {row.name}
                  {row.brokeDownAt !== null ? (
                    <span className="row-note">
                      {row.brokeDownReason === "table-limit" ? "hit table max" : "went broke"} at
                      coup {row.brokeDownAt + 1}
                    </span>
                  ) : null}
                </th>
                <td className={row.netUnits >= 0 ? "good" : "bad"}>
                  {row.netUnits >= 0 ? "+" : "−"}
                  {formatUnits(Math.abs(row.netUnits))}u
                </td>
                <td className={row.peakStakeUnits > 8 ? "bad" : ""}>
                  {formatUnits(row.peakStakeUnits)}u
                </td>
                <td
                  className={perUnit(row) >= 0 ? "good" : "bad"}
                  title={`${formatUnits(row.totalStakedUnits)}u staked`}
                >
                  {perUnit(row) >= 0 ? "+" : "−"}
                  {formatPercent(Math.abs(perUnit(row)), 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {replay.approximate ? (
        <Notice tone="warn">
          Your table pays a reduced rate on a Banker win with 6, and the recorded coups do not
          say which wins were on 6 — the Banker figures here are slightly generous.
        </Notice>
      ) : null}

      <p className="field-hint">
        One shoe of hindsight. Whichever plan is on top won that much variance and nothing
        more &mdash; re-run this on the next shoe and the order will move.{" "}
        <strong>Per unit</strong> is the column worth reading: net over everything that plan
        staked. However wildly they differ here, over a long enough run every row settles
        near &minus;1.06% on Banker, which is the thing no staking plan changes. Hover a row
        for its total action.
      </p>
    </Card>
  );
}
