import { Text, View } from "react-native";
import { useMoney, useSystemRun } from "../state/store";
import { usePalette } from "../theme";
import { Card, Hint, Notice, Prose } from "./ui";

/**
 * What Reverse 12 says to do on the very next hand.
 *
 * On the Table tab rather than with the analysis, because it is the only part
 * of the system you need while the cards are out: the side, the amount, and —
 * just as often — the fact that it is sitting this one out.
 *
 * It does not replace the app's own recommendation above it. That one says
 * what the cards are worth; this says what your rule says. They disagree most
 * of the time, and showing both is the honest thing.
 */

const SIDE_LABEL = { player: "Player", banker: "Banker" } as const;

export default function SystemNextBet() {
  const { run, finished } = useSystemRun();
  const money = useMoney();
  const p = usePalette();
  const next = run.next;

  if (run.handsAvailable === 0 && !finished) return null;

  const waiting = run.config.lookback + 1 - next.hand;

  const body = () => {
    if (finished) {
      return (
        <Prose>
          That shoe is finished. Reverse 12 starts again from its warm-up on the next one.
        </Prose>
      );
    }
    if (next.skipped === "warm-up") {
      return (
        <Prose>
          Watching. {waiting} more hand{waiting === 1 ? "" : "s"} before the first bet, because
          hand {run.config.lookback + 1} is the first one with a hand {run.config.lookback} back
          to mirror.
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
      const resumesAt = (next.group ?? 0) * run.config.groupSize + run.config.lookback + 1;
      return (
        <Prose>
          Sitting out. Group {next.group} lost, so the rule waits for group{" "}
          {(next.group ?? 0) + 1}, which opens on hand {resumesAt} at{" "}
          {money.format(run.config.baseStake)}.
        </Prose>
      );
    }
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
            {SIDE_LABEL[next.bet ?? "banker"]}
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
      title="Reverse 12 says"
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
