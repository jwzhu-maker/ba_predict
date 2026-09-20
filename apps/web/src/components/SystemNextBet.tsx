import { Card, Notice } from "./Primitives";
import { useMoney, useSystemRun } from "../state/store";

/**
 * What Reverse 12 says to do on the very next hand.
 *
 * This sits on the Table tab rather than with the analysis, because it is the
 * only part of the system you need while the cards are out: the side, the
 * amount, and — just as often — the fact that it is sitting this one out.
 *
 * It deliberately does NOT replace the app's own recommendation above it.
 * That one says what the cards are worth; this one says what your rule says.
 * They disagree most of the time, and showing both is the honest thing: the
 * rule is a rule you chose, not a reading of the shoe.
 */

const SIDE_LABEL = { player: "Player", banker: "Banker" } as const;

export default function SystemNextBet() {
  const { run, finished } = useSystemRun();
  const money = useMoney();
  const next = run.next;

  // Nothing has been recorded and the shoe is not over: the card would be a
  // countdown from 12 with no information in it.
  if (run.handsAvailable === 0 && !finished) return null;

  const waiting = run.config.lookback + 1 - next.hand;

  const body = (() => {
    if (finished) {
      return (
        <p className="prose">
          That shoe is finished. Reverse 12 starts again from its warm-up on the next one.
        </p>
      );
    }
    if (next.skipped === "warm-up") {
      return (
        <p className="prose">
          Watching. <strong>{waiting}</strong> more hand{waiting === 1 ? "" : "s"} before the
          first bet, because hand {run.config.lookback + 1} is the first one with a hand{" "}
          {run.config.lookback} back to mirror.
        </p>
      );
    }
    if (next.skipped === "past-last-hand") {
      return (
        <p className="prose">
          Done for this shoe — hand {run.config.lastHand} was the last one the rule plays. Ties
          are not counted, so there may still be cards left.
        </p>
      );
    }
    if (next.skipped === "group-over") {
      const resumesAt = (next.group ?? 0) * run.config.groupSize + run.config.lookback + 1;
      return (
        <p className="prose">
          Sitting out. Group {next.group} lost, so the rule waits for group {(next.group ?? 0) + 1}
          , which opens on hand {resumesAt} at {money.format(run.config.baseStake)}.
        </p>
      );
    }
    return (
      <>
        <div className="system-call">
          <span className={`system-side system-side-${next.bet}`}>
            {SIDE_LABEL[next.bet ?? "banker"]}
          </span>
          <span className="system-stake">{money.format(next.stake)}</span>
        </div>
        <p className="field-hint">
          Hand {next.hand} · group {next.group}, bet {next.step} of {run.config.groupSize} ·
          mirroring hand {next.referenceHand}
          {next.step === 1 ? " · fresh group, back to the base stake" : null}
        </p>
      </>
    );
  })();

  return (
    <Card
      title="Reverse 12 says"
      subtitle={finished ? "Last shoe" : `Hand ${next.hand} of this shoe, ties not counted`}
    >
      {body}
      {run.tiesRemoved > 0 && !finished ? (
        <p className="field-hint">
          {run.tiesRemoved} tie{run.tiesRemoved === 1 ? "" : "s"} recorded and not counted, so this
          is hand {next.hand} of the rule but coup {run.tiesRemoved + next.hand} of the shoe.
        </p>
      ) : null}
      {run.approximate ? (
        <Notice tone="warn">
          Your table pays a reduced rate on a Banker win with 6, which recorded coups do not
          capture, so this shoe&rsquo;s Banker results are slightly generous.
        </Notice>
      ) : null}
    </Card>
  );
}
