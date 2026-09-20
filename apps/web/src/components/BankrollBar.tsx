import { describeEdge } from "@ba-predict/app-core";
import { formatPercent, formatUnits } from "../lib/format";
import { useAppState, useStats } from "../state/store";

export default function BankrollBar() {
  const { session } = useAppState();
  const stats = useStats();
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
      {/*
        The two headline figures moved to the sticky header, where they are
        visible from every screen. Repeating them here would be the same
        number twice on one screen; what stays is the detail the header has
        no room for.
      */}
      <p className="bankroll-meta bankroll-meta-top">
        {profit >= 0 ? "Toward your stop-win" : "Toward your stop-loss"}
      </p>

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
