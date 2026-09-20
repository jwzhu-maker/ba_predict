import { betLabel } from "@ba-predict/engine";
import { formatOdds, formatPercent } from "../lib/format";
import { useAdvice } from "../state/store";
import { Card } from "./Primitives";

/** Every bet on the layout, priced against the shoe as it stands. */
export default function OddsTable() {
  const advice = useAdvice();
  if (!advice.valuations) return null;

  return (
    <Card title="What every bet costs" subtitle="Priced against the cards still in the shoe">
      <div className="table-scroll">
        <table className="odds-table odds-table-fluid">
          <thead>
            <tr>
              <th scope="col">Bet</th>
              <th scope="col">Wins</th>
              <th scope="col">Frequency</th>
              <th scope="col">House edge</th>
            </tr>
          </thead>
          <tbody>
            {advice.ranked.map((valuation) => (
              <tr key={valuation.bet} className={valuation.bet === advice.bet ? "row-active" : ""}>
                <th scope="row">{betLabel(valuation.bet)}</th>
                <td>{formatPercent(valuation.winProbability, 2)}</td>
                <td className="muted">{formatOdds(valuation.winProbability)}</td>
                <td className={valuation.houseEdge > 0.05 ? "bad" : ""}>
                  {formatPercent(valuation.houseEdge)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="field-hint">
        House edge is quoted per unit staked, ties included. It is the fraction of everything you
        put on the table that you should expect to keep losing, and no staking plan changes it.
      </p>
    </Card>
  );
}
