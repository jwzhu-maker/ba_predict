import { nextHandDetail, readSystemNext, tieReconciliation } from "@ba-predict/app-core";
import { Dimensions, Text, View } from "react-native";
import { useAppState, useMoney, useSystemRun } from "../state/store";
import { usePalette } from "../theme";
import { Card, Hint, Notice, Prose } from "./ui";

/**
 * The active system's own card: its full reading of the next hand.
 *
 * The Bet card above carries the INSTRUCTION — one side, one amount, and
 * whatever is actually going to be staked. This carries the working: which
 * hand of the tie-free sequence, which hand it mirrors, where in the group,
 * when it resumes, and how the rule's hand number lines up with the coup
 * number on the road. With three ties dealt, "hand 16" is coup 19 on the
 * board, and nothing else on screen says so.
 *
 * It is also where a SECOND system's reading would go; the Bet card can only
 * ever show the one call that settles.
 */

const SIDE_LABEL = { player: "Player", banker: "Banker" } as const;

export default function SystemNextBet() {
  const { activeSystem } = useAppState();
  const { run, finished } = useSystemRun();
  const money = useMoney();
  const p = usePalette();
  const narrowPhone = Dimensions.get("window").width <= 340;
  const reading = readSystemNext(run);
  const next = run.next;

  if (activeSystem === null) return null;

  const body = () => {
    if (finished) {
      return (
        <Prose>
          That shoe is finished. {run.name} starts again from its warm-up on the next one.
        </Prose>
      );
    }
    if (next.skipped === "warm-up") {
      return (
        <Prose>
          Watching. {reading.handsToWatch} more hand{reading.handsToWatch === 1 ? "" : "s"} before
          the first bet, because hand {run.config.lookback + 1} is the first one with a hand{" "}
          {run.config.lookback} back to mirror.
        </Prose>
      );
    }
    if (next.skipped === "past-last-hand") {
      return (
        <Prose>
          Done for this shoe — hand {run.config.lastHand} was the last one the rule plays. Ties
          are not counted, so there may still be cards left.
        </Prose>
      );
    }
    // Only a system whose groups gate play can reach this; Reverse Streak
    // 4 never sits a hand out once it has started.
    if (next.skipped === "group-over") {
      if (reading.resumesAtHand === null) {
        return (
          <Prose>
            Sitting out, and that was the last group — group {next.group} lost, and hand{" "}
            {run.config.lastHand} is where the rule stops. Nothing more this shoe.
          </Prose>
        );
      }
      return (
        <Prose>
          Sitting out. Group {next.group} lost, so the rule waits for group{" "}
          {reading.resumesAtGroup}, which opens on hand {reading.resumesAtHand} at{" "}
          {money.format(run.config.baseStake)}.
        </Prose>
      );
    }
    if (next.bet === null) return null;
    return (
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 12 }}>
          <Text
            style={{
              fontSize: 30,
              fontWeight: "800",
              color: next.bet === "player" ? p.player : p.banker,
            }}
          >
            {SIDE_LABEL[next.bet]}
          </Text>
          <Text style={{ fontSize: 25, fontWeight: "700", color: p.accent }}>
            {money.format(next.stake)}
          </Text>
        </View>
        {/* Shared with the Bet card's own detail line, and shaped by the
            system: a group step is the ladder rung on Reverse 12 and is not
            on Reverse Streak 4, where a loss resets one and not the other. */}
        <Hint>{nextHandDetail(run)}</Hint>
      </View>
    );
  };

  return (
    <Card
      // Reserved so the Record buttons below do not move between coups.
      //
      // Mirrored from `--system-card-min-height` in the web stylesheet,
      // which is where the derivation lives — the two cards render the same
      // body helpers, so the same content drives both. It was left at the
      // OLD web value when that one was re-measured after the tie
      // reconciliation line became unconditional, at which point the floor
      // stopped binding here and these buttons started moving again on
      // mobile alone.
      //
      // Stated plainly: these numbers are the web measurement, not a
      // measurement taken on a device. RN has no cascade and no media
      // query, so the narrow tier is read off the window the same way the
      // stylesheet reads it off the viewport.
      style={{ minHeight: narrowPhone ? 275 : 260 }}
      title={`${run.name} says`}
      subtitle={finished ? "Last shoe" : `Hand ${next.hand} of this shoe, ties not counted`}
    >
      {body()}
      {/* Rendered on every hand, including before the first tie: appearing
          only once a tie was dealt made the card grow mid-shoe and moved the
          Record buttons under the thumb reaching for them. */}
      {finished ? null : <Hint>{tieReconciliation(run)}</Hint>}
      {run.approximate ? (
        <Notice tone="warn">
          Your table pays a reduced rate on a Banker win with 6, which recorded coups do not
          capture, so this shoe’s Banker results are slightly generous.
        </Notice>
      ) : null}
    </Card>
  );
}
