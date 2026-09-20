import { betLabel } from "@ba-predict/engine";
import { Card, Notice } from "./Primitives";
import { formatPercent, formatUnits } from "../lib/format";
import { useAppState, useDispatch, useStrategyRecord } from "../state/store";

/**
 * Every staking plan's record over every shoe this device has recorded.
 *
 * The two columns are the whole point and they disagree on purpose. "Shoes
 * won" is what makes a system feel like it works — a Martingale finishes
 * over 90% of shoes ahead. "Per unit" is what it actually costs, and it sits
 * in the same narrow band for every plan in the list. A system buys the
 * first column by selling the tail, not by changing the second.
 */
export default function StrategyRecord() {
  const record = useStrategyRecord();
  const { shoeArchive } = useAppState();
  const dispatch = useDispatch();

  if (record.shoes === 0) {
    return (
      <Card title="Strategy record" subtitle="Builds up as you finish shoes">
        <p className="prose">
          Every shoe you finish is kept and replayed through all ten staking plans. After a few
          shoes this shows how often each one finished ahead — and what each was paying per unit
          staked to do it.
        </p>
      </Card>
    );
  }

  const thin = record.shoes < 10;

  return (
    <Card
      title="Strategy record"
      subtitle={`${record.shoes} shoe${record.shoes === 1 ? "" : "s"}, ${record.coups} coups, every plan betting ${betLabel(record.bet)}`}
    >
      <div className="table-scroll">
        <table className="odds-table odds-table-plans">
          <thead>
            <tr>
              <th scope="col">Plan</th>
              <th scope="col">Shoes won</th>
              <th scope="col">Net</th>
              <th scope="col">Per unit</th>
            </tr>
          </thead>
          <tbody>
            {record.rows.map((row) => (
              <tr key={row.progression}>
                <th scope="row">
                  {row.name}
                  {row.breakdowns > 0 ? (
                    <span className="row-note">
                      broke down in {row.breakdowns} of {row.shoes}
                    </span>
                  ) : null}
                </th>
                <td title={`${row.shoesAhead} of ${row.shoes}`}>
                  {formatPercent(row.successRate, 0)}
                </td>
                <td className={row.netUnits >= 0 ? "good" : "bad"}>
                  {row.netUnits >= 0 ? "+" : "−"}
                  {formatUnits(Math.abs(row.netUnits))}u
                </td>
                <td
                  className={row.perUnit >= 0 ? "good" : "bad"}
                  title={`${formatUnits(row.stakedUnits)}u staked`}
                >
                  {row.perUnit >= 0 ? "+" : "−"}
                  {formatPercent(Math.abs(row.perUnit), 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {thin ? (
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

      <p className="field-hint">
        Read the two middle columns against each other. <strong>Shoes won</strong> is what makes
        a system feel like it works, and the steep ones score very well on it &mdash; a
        Martingale finishes most shoes ahead. <strong>Per unit</strong> is what each one actually
        costs, and it lands in the same narrow band for all of them. The difference between the
        columns is the tail: the rare shoe where the ladder runs into the table maximum pays for
        every shoe it won.
      </p>

      {shoeArchive.length > 0 ? (
        <button
          type="button"
          className="button button-danger"
          onClick={() => dispatch({ type: "clear-shoe-archive" })}
        >
          Forget {shoeArchive.length} recorded shoe{shoeArchive.length === 1 ? "" : "s"}
        </button>
      ) : null}
    </Card>
  );
}
