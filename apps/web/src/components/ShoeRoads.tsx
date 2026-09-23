import { Card, Stat } from "./Primitives";
import { AskTheRoad, BeadPlate, BigRoad, DerivedRoad } from "./Roads";
import { formatPercent } from "../lib/format";
import { ROAD_CARD_ID } from "../lib/reveal-road";
import { useRoads } from "../state/store";

/**
 * The scoreboard, sitting directly under "Record the result".
 *
 * Adjacency is the point: recording an outcome and watching the road move are
 * one action to a player, and putting them on separate tabs made you tap away
 * to see the effect of what you just did. Pressing P / B / T in the record
 * dock scrolls this card into view (see `revealRoad`), and every board
 * keeps its newest column in view (see `GridShell`).
 */
export default function ShoeRoads() {
  const { roads, summary } = useRoads();
  const resolved = summary.playerWins + summary.bankerWins;

  if (summary.total === 0) {
    return (
      <Card id={ROAD_CARD_ID} title="The road" subtitle="Fills in as you record results">
        <p className="prose">
          Record a result above and the bead plate, big road and the three derived roads all
          draw here.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card id={ROAD_CARD_ID} title="The road" subtitle={`${summary.total} coups this shoe`}>
        <div className="stat-grid">
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
          <Stat
            label="Now"
            value={
              summary.currentStreak.outcome
                ? `${summary.currentStreak.length} ${summary.currentStreak.outcome === "banker" ? "B" : "P"}`
                : "—"
            }
          />
        </div>

        <div className="road-block">
          <span className="road-label">Big road</span>
          <BigRoad roads={roads} />
        </div>

        <div className="road-block">
          <span className="road-label">Bead plate</span>
          <BeadPlate roads={roads} />
        </div>

        <div className="road-block">
          <span className="road-label">Big eye boy · hollow</span>
          <DerivedRoad marks={roads.bigEyeBoy} label="Big eye boy" shape="ring" />
        </div>

        <div className="road-block">
          <span className="road-label">Small road · solid</span>
          <DerivedRoad marks={roads.smallRoad} label="Small road" shape="solid" />
        </div>

        <div className="road-block">
          <span className="road-label">Cockroach pig · slash</span>
          <DerivedRoad marks={roads.cockroachPig} label="Cockroach pig" shape="slash" />
        </div>

        <p className="field-hint">
          The roads record what happened and describe its patterns exactly. They do not forecast
          the next coup — the recommendation above comes from the cards in the shoe, not from
          this board, and where the two disagree the numbers are right.
        </p>
      </Card>

      <AskTheRoad roads={roads} />
    </>
  );
}
