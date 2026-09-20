import { nextHandDetail, readSystemNext, tieReconciliation } from "@ba-predict/app-core";
import { Card } from "./Primitives";
import { useAppState, useMoney, useSystemRun } from "../state/store";

/**
 * The active system's own card: its full reading of the next hand.
 *
 * The Bet card above carries the INSTRUCTION — one side, one amount, and
 * whatever is actually going to be staked. This carries the system's
 * working: which hand of the tie-free sequence it is on, which hand it is
 * mirroring, where it is in its group, when it resumes, and how the rule's
 * hand number lines up with the coup number on the road.
 *
 * Two reasons it is worth a card of its own rather than a line on that one.
 * A player checking the app against the rule needs the reconciliation — with
 * three ties dealt, "hand 16" is coup 19 on the board, and nothing else on
 * screen says so. And a second system would want a second card here; the
 * Bet card can only ever show the one call that settles.
 */

const SIDE_LABEL = { player: "Player", banker: "Banker" } as const;

export default function SystemNextBet() {
  const { activeSystem } = useAppState();
  const { run, finished } = useSystemRun();
  const money = useMoney();
  const reading = readSystemNext(run);
  const next = run.next;

  // Nothing to say about a system nobody selected.
  if (activeSystem === null) return null;

  const body = () => {
    if (finished) {
      return (
        <p className="prose">
          That shoe is finished. {run.name} starts again from its warm-up on the next one.
        </p>
      );
    }
    if (next.skipped === "warm-up") {
      return (
        <p className="prose">
          Watching. <strong>{reading.handsToWatch}</strong> more hand
          {reading.handsToWatch === 1 ? "" : "s"} before the first bet, because hand{" "}
          {run.config.lookback + 1} is the first one with a hand {run.config.lookback} back to
          mirror.
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
    // Only a system whose groups gate play can reach this; Reverse Streak
    // 4 never sits a hand out once it has started.
    if (next.skipped === "group-over") {
      // `readSystemNext` is what knows there may be no next group: group 8
      // covers hands 55-60, so a loss inside it leaves nothing to wait for.
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
    if (next.bet === null) return null;
    return (
      <>
        <div className="system-call">
          <span className={`system-side system-side-${next.bet}`}>{SIDE_LABEL[next.bet]}</span>
          <span className="system-stake">{money.format(next.stake)}</span>
        </div>
        {/* Shared with the Bet card's own detail line, and shaped by the
            system: a group step is the ladder rung on Reverse 12 and is not
            on Reverse Streak 4, where a loss resets one and not the other. */}
        <p className="field-hint">{nextHandDetail(run)}</p>
      </>
    );
  };

  return (
    <Card
      className="card-system-says"
      title={`${run.name} says`}
      subtitle={finished ? "Last shoe" : `Hand ${next.hand} of this shoe, ties not counted`}
    >
      {body()}

      {/*
        The reconciliation nothing else on screen provides: the rule counts
        tie-free hands and the board counts coups, and a player checking the
        instruction by hand needs to know which number is which.

        Rendered on every hand, including before the first tie — appearing
        only once a tie was dealt made the card grow mid-shoe and moved the
        Record buttons under the thumb reaching for them.
      */}
      {finished ? null : <p className="field-hint">{tieReconciliation(run)}</p>}

      {/*
        The "Banker results are slightly generous" caveat is NOT here, and
        that is the point. It qualifies the shoe's TOTALS, which this card
        does not show — it shows one side and one stake, neither of which a
        reduced Banker-6 payout touches. The run card on the Strategies tab
        carries it, beside the numbers it is about.

        It also appeared the first time a Banker hand was settled and stayed
        for the rest of the shoe, which grew this card mid-shoe and moved
        the Record buttons — the one thing the floor above exists to stop.
      */}
    </Card>
  );
}
