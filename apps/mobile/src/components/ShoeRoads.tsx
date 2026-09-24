import { View } from "react-native";
import { formatPercent } from "../lib/format";
import { roadCardRef } from "../lib/reveal-road";
import { useRoads } from "../state/store";
import { AskTheRoad, BeadPlate, BigRoad, DerivedRoad } from "./Roads";
import { Card, Hint, Prose, Row, Stat } from "./ui";

/**
 * The scoreboard, sitting directly under "Record the result".
 *
 * Adjacency is the point: recording an outcome and watching the road move are
 * one action to a player, and putting them on separate tabs meant tapping
 * away to see the effect of what you just did. Pressing P / B / T in the
 * record dock scrolls this card into view (see `revealRoad`), and every
 * board keeps its newest column in view (see `Board`).
 *
 * Both branches are wrapped in the same View so the dock can measure the
 * card whether or not a coup has been recorded yet.
 */
export default function ShoeRoads() {
  const { roads, summary } = useRoads();
  const resolved = summary.playerWins + summary.bankerWins;

  if (summary.total === 0) {
    return (
      <View ref={roadCardRef} collapsable={false}>
        <Card title="The road" subtitle="Fills in as you record results">
          <Prose>
            Record a result above and the bead plate, big road and the three derived roads all
            draw here.
          </Prose>
        </Card>
      </View>
    );
  }

  return (
    <View ref={roadCardRef} collapsable={false} style={{ gap: 12 }}>
      <Card title="The road" subtitle={`${summary.total} coups this shoe`}>
        <Row>
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
        </Row>

        <View style={{ gap: 4 }}>
          <Hint>BIG ROAD</Hint>
          <BigRoad roads={roads} />
        </View>
        <View style={{ gap: 4 }}>
          <Hint>BEAD PLATE</Hint>
          <BeadPlate roads={roads} />
        </View>
        <View style={{ gap: 4 }}>
          <Hint>BIG EYE BOY · HOLLOW</Hint>
          <DerivedRoad marks={roads.bigEyeBoy} shape="ring" />
        </View>
        <View style={{ gap: 4 }}>
          <Hint>SMALL ROAD · SOLID</Hint>
          <DerivedRoad marks={roads.smallRoad} shape="solid" />
        </View>
        <View style={{ gap: 4 }}>
          <Hint>COCKROACH PIG · SLASH</Hint>
          <DerivedRoad marks={roads.cockroachPig} shape="slash" />
        </View>

        <Hint>
          The roads record what happened and describe its patterns exactly. They do not forecast
          the next coup — the recommendation above comes from the cards in the shoe, not from
          this board, and where the two disagree the numbers are right.
        </Hint>
      </Card>

      <AskTheRoad roads={roads} />
    </View>
  );
}
