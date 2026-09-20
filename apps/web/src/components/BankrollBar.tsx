import { describeEdge } from "@ba-predict/app-core";
import { formatPercent, formatUnits } from "../lib/format";
import { useAppState, useMoney, useStats } from "../state/store";

export default function BankrollBar() {
  const { session } = useAppState();
  const stats = useStats();
  const money = useMoney();
  const profit = session.bankroll.bankroll - session.bankroll.startingBankroll;
  const edge = describeEdge(stats.actualEdge);
  const { stopWin, stopLoss } = session.bankroll;

  const progress =
    profit >= 0
      ? stopWin
        ? Math.min(1, profit / stopWin)
        : 0
      : stopLoss
        ? Math.min(1, -profit / stopLoss)
        : 0;

  return (
    <div className="bankroll">
      <div className="bankroll-row">
        <div>
          <span className="bankroll-label">Bankroll</span>
          <span className="bankroll-value">{money.format(session.bankroll.bankroll)}</span>
        </div>
        <div className="bankroll-right">
          <span className="bankroll-label">Session</span>
          <span className={`bankroll-value ${profit >= 0 ? "good" : "bad"}`}>
            {money.signed(profit)}
          </span>
        </div>
      </div>

      <div
        className={`bankroll-meter ${profit >= 0 ? "meter-good" : "meter-bad"}`}
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={profit >= 0 ? "Progress to stop-win" : "Progress to stop-loss"}
      >
        <span style={{ width: `${progress * 100}%` }} />
      </div>

      <p className="bankroll-meta">
        Next stake {formatUnits(session.progression.units)}u &middot;{" "}
        {session.progression.id.replace(/-/g, " ")} &middot; {stats.wagers} wagers &middot;{" "}
        {stats.totalWagered > 0
          ? `${formatPercent(edge.magnitude)} ${edge.noun}`
          : "no action yet"}
      </p>
    </div>
  );
}
