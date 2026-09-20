import AdviceCard from "../components/AdviceCard";
import BankrollBar from "../components/BankrollBar";
import CardKeypad from "../components/CardKeypad";
import CoupEntry from "../components/CoupEntry";
import OddsTable from "../components/OddsTable";
import { Card, Stat } from "../components/Primitives";
import Sparkline from "../components/Sparkline";
import WagerControls from "../components/WagerControls";
import { formatPercent } from "../lib/format";
import { useAppState, useMoney, useStats } from "../state/store";

export default function TableScreen() {
  const { session } = useAppState();
  const stats = useStats();
  const money = useMoney();

  return (
    <div className="screen">
      <BankrollBar />
      <AdviceCard />
      <CoupEntry />
      <WagerControls />
      <OddsTable />

      <Card title="This session">
        <div className="stat-grid">
          <Stat label="Coups" value={String(stats.coups)} />
          <Stat label="Wagers" value={String(stats.wagers)} />
          <Stat
            label="Won / lost"
            value={`${stats.wins} / ${stats.losses}`}
            hint={stats.pushes > 0 ? `${stats.pushes} pushed` : undefined}
          />
          <Stat label="Total staked" value={money.format(stats.totalWagered)} />
          <Stat
            label="Net"
            value={money.signed(stats.netProfit)}
            tone={stats.netProfit >= 0 ? "good" : "bad"}
          />
          <Stat
            label="Worst drawdown"
            value={money.format(stats.maxDrawdown)}
            tone={stats.maxDrawdown > 0 ? "bad" : "muted"}
          />
        </div>
        <Sparkline
          values={stats.bankrollCurve}
          baseline={session.bankroll.startingBankroll}
        />
        {stats.totalWagered > 0 ? (
          <p className="field-hint">
            {stats.actualEdge >= 0
              ? `You have paid ${formatPercent(stats.actualEdge)} of everything you staked so far.`
              : `You are ahead by ${formatPercent(-stats.actualEdge)} of everything you staked so far.`}{" "}
            Over a long enough session that converges on the table's edge; over one session it
            is mostly luck in either direction.
          </p>
        ) : null}
      </Card>

      <CardKeypad />
    </div>
  );
}
