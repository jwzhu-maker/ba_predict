import { readSystemNext } from "@ba-predict/app-core";
import { Text, View } from "react-native";
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
        <Hint>
          Hand {next.hand} · group {next.group}, bet {next.step} of {run.config.groupSize} ·
          mirroring hand {next.referenceHand}
          {next.step === 1 ? " · fresh group, back to the base stake" : ""}
        </Hint>
      </View>
    );
  };

  return (
    <Card
      // Reserved so the Record buttons below do not move between coups; see
      // the same note in the web stylesheet for how the number was derived.
      style={{ minHeight: 200 }}
      title={`${run.name} says`}
      subtitle={finished ? "Last shoe" : `Hand ${next.hand} of this shoe, ties not counted`}
    >
      {body()}
      {run.tiesRemoved > 0 && !finished ? (
        <Hint>
          {run.tiesRemoved} tie{run.tiesRemoved === 1 ? "" : "s"} recorded and not counted, so this
          is hand {next.hand} of the rule but coup {run.tiesRemoved + next.hand} of the shoe.
        </Hint>
      ) : null}
      {run.approximate ? (
        <Notice tone="warn">
          Your table pays a reduced rate on a Banker win with 6, which recorded coups do not
          capture, so this shoe’s Banker results are slightly generous.
        </Notice>
      ) : null}
    </Card>
  );
}
