import { readSystemNext } from "@ba-predict/app-core";
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
  const reading = readSystemNext(run);

  // Nothing has been recorded and the shoe is not over: the card would be a
  // countdown from 12 with no information in it.
  if (run.handsAvailable === 0 && !finished) return null;

  const waiting = reading.handsToWatch;

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
      if (reading.resumesAtHand === null) {
        return (
          <p className="prose">
            Sitting out, and that was the last group — group {next.group} lost, and hand{" "}
            {run.config.lastHand} is where the rule stops. Nothing more this shoe.
          </p>
        );
      }
      return (
        <p className="prose">
          Sitting out. Group {next.group} lost, so the rule waits for group{" "}
          {reading.resumesAtGroup}, which opens on hand {reading.resumesAtHand} at{" "}
          {money.format(run.config.baseStake)}.
        </p>
      );
    }
    // A live hand always has a side; rendering nothing beats inventing one on
    // an instruction the user puts money behind.
    if (next.bet === null) return null;
    return (
      <>
        <div className="system-call">
          <span className={`system-side system-side-${next.bet}`}>{SIDE_LABEL[next.bet]}</span>
          <span className="system-stake">{money.format(next.stake)}</span>
        </div>
        <p className="field-hint">
          Hand {next.hand} · group {next.group}, bet {next.step} of {run.config.groupSize} ·
          mirroring hand {next.referenceHand}
          {next.step === 1 ? " · fresh group, back to the base stake" : null}
        </p>
        {next.clipped ? (
          <Notice tone="warn">
            Your ladder asks for {money.format(next.requestedStake)} here, but the table maximum
            is {money.format(next.stake)}. The amount above is what you can actually put on.
          </Notice>
        ) : null}
        {next.unaffordable ? (
          <Notice tone="danger">
            That is more than your bankroll has left. The rule does not know about your balance
            — this is the point at which it stops being playable as written.
          </Notice>
        ) : null}
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
