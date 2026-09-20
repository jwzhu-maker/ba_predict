import { Card, Stat } from "../components/Primitives";
import { AskTheRoad, BeadPlate, BigRoad, DerivedRoad } from "../components/Roads";
import { formatPercent } from "../lib/format";
import { useRoads } from "../state/store";

export default function RoadsScreen() {
  const { roads, summary } = useRoads();
  const resolved = summary.playerWins + summary.bankerWins;

  return (
    <div className="screen">
      <Card title="This shoe">
        <div className="stat-grid">
          <Stat label="Coups" value={String(summary.total)} />
          <Stat label="Banker" value={String(summary.bankerWins)} />
          <Stat label="Player" value={String(summary.playerWins)} />
          <Stat label="Ties" value={String(summary.ties)} />
          <Stat
            label="Banker share"
            value={resolved > 0 ? formatPercent(summary.bankerWins / resolved, 1) : "—"}
            hint="50.68% long run"
          />
          <Stat
            label="Longest run"
            value={
              summary.longestStreak.outcome
                ? `${summary.longestStreak.length} ${summary.longestStreak.outcome === "banker" ? "B" : "P"}`
                : "—"
            }
          />
        </div>
      </Card>

      <Card title="Bead plate" subtitle="Every coup in order, ties included">
        <BeadPlate roads={roads} />
      </Card>

      <Card
        title="Big road"
        subtitle={
          roads.leadingTies > 0
            ? `${roads.leadingTies} tie${roads.leadingTies === 1 ? "" : "s"} before the first result`
            : "A new column each time the winner changes"
        }
      >
        <BigRoad roads={roads} />
      </Card>

      <Card title="Big eye boy" subtitle="One column back">
        <DerivedRoad marks={roads.bigEyeBoy} label="Big eye boy" />
      </Card>

      <Card title="Small road" subtitle="Two columns back">
        <DerivedRoad marks={roads.smallRoad} label="Small road" />
      </Card>

      <Card title="Cockroach pig" subtitle="Three columns back">
        <DerivedRoad marks={roads.cockroachPig} label="Cockroach pig" />
      </Card>

      <AskTheRoad roads={roads} />

      <Card title="What the roads are">
        <p className="prose">
          The roads are an exact record of what has happened and a complete description of the
          patterns in it. They are drawn here because they are on the board above every table and
          the app would be awkward to use without them.
        </p>
        <p className="prose">
          They are not a forecast. Each coup is dealt from a shoe whose composition barely moves,
          so the result of the last hand tells you essentially nothing about the next one. Where
          the roads seem to disagree with the numbers on the Table screen, the numbers are right.
        </p>
      </Card>
    </div>
  );
}
