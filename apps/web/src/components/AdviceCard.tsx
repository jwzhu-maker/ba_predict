import { betLabel } from "@ba-predict/engine";
import { formatPercent } from "../lib/format";
import { useAdvice, useAppState, useDispatch, useMoney, useTableCall } from "../state/store";
import { Notice } from "./Primitives";

/**
 * The one instruction on the table: what to put down on the next coup.
 *
 * Two things about this card are deliberate and easy to undo by accident.
 *
 * It shows the ACTIVE SYSTEM's call when one is selected, not the engine's
 * flat recommendation. A player who has chosen Reverse 12 is playing Reverse
 * 12; showing them the engine's $10 beside the rule's $400 gave them two
 * answers and no way to tell which the app would actually stake.
 *
 * And the stake is opt-OUT. Recording the result settles against whatever
 * this card shows, so the only button here is the one for the exception —
 * sitting a coup out. "Put it on the table" was a tap that had to be made on
 * every single hand to make the app behave the way it already read.
 */
export default function AdviceCard() {
  const call = useTableCall();
  const advice = useAdvice();
  const money = useMoney();
  const dispatch = useDispatch();
  const { skipNextCoup } = useAppState();

  const betting = call.bet !== null;
  // A stop is the app's most important message and it must keep its colour
  // and its word. `betting` is false on a stop with no system running, so
  // keying the tone off `betting` alone rendered the stop-loss card as a
  // neutral "Bet" over a grey "No bet".
  const stopping = advice.action === "stop";
  const tone = stopping ? "stop" : betting ? "bet" : "neutral";

  const kicker = stopping
    ? "Stop"
    : call.source === "manual"
      ? "Your bet"
      : call.source === "skipped"
        ? "Sitting out"
        : (call.systemName ?? "Bet");

  // The engine's cost line is only meaningful for a bet it priced.
  const edge = call.bet ? advice.valuations?.[call.bet]?.houseEdge : undefined;

  return (
    <section className={`advice advice-tone-${tone}`}>
      <p className="advice-kicker">{kicker}</p>

      {betting ? (
        <>
          <p className="advice-bet">{betLabel(call.bet!)}</p>
          <p className="advice-amount">{money.format(call.amount)}</p>
          {edge !== undefined ? (
            <p className="advice-cost">
              {formatPercent(edge)} house edge &middot; costs {money.format(call.amount * edge)} on
              this wager
            </p>
          ) : null}
          {call.detail ? <p className="advice-detail">{call.detail}</p> : null}
        </>
      ) : (
        <>
          <p className="advice-bet advice-bet-quiet">No bet</p>
          {call.noBetReason ? <p className="advice-detail">{call.noBetReason}</p> : null}
        </>
      )}

      {/* `stakes`, not `betting`: the card can be pointing at Player 400
          while observe mode, a stop or the bankroll refuses to act on it. */}
      <p className="advice-settle">
        {call.stakes
          ? `Recording the result will settle ${money.format(call.amount)} on ${betLabel(call.bet!)}.`
          : "Recording the result will stake nothing."}
      </p>

      {call.blockedReason ? <Notice tone="warn">{call.blockedReason}</Notice> : null}

      {/*
        The only control here, because betting the suggestion is the default
        path and needs no confirmation. Red because it is the exception, and
        toggleable because pressing it by mistake must cost one tap.
      */}
      {call.stakes || skipNextCoup ? (
        <button
          type="button"
          className={`button advice-action ${skipNextCoup ? "button-primary" : "button-danger"}`}
          onClick={() => dispatch({ type: "skip-next-coup", skip: !skipNextCoup })}
        >
          {skipNextCoup ? "Bet after all" : "I don't bet this time"}
        </button>
      ) : null}

      {call.clipped && call.requestedAmount !== null ? (
        <Notice tone="warn">
          The ladder asks for {money.format(call.requestedAmount)} here, but the table maximum is{" "}
          {money.format(call.amount)}. The amount above is what you can actually put on.
        </Notice>
      ) : null}

      <ul className="advice-reasons">
        {advice.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
        {/* Only while the engine's amount is the one on the table — a system
            or a hand-placed wager makes this sentence describe a stake that
            is not about to be placed. */}
        {call.engineSizes && advice.sizingReason ? <li>{advice.sizingReason}</li> : null}
        {call.source === "system" && call.systemName ? (
          <li>
            {call.systemName} is setting the side and the stake here, not the engine. It cannot
            change what a bet costs &mdash; only how much and how often you bet.
          </li>
        ) : null}
      </ul>

      {/*
        The engine's warnings are all computed from the ENGINE's stake
        ("this is 12% of your bankroll", "the next step needs more than the
        table allows"), so against a system's or a hand-placed amount they
        describe money nobody is putting down — the same trap `sizingReason`
        was pulled out of `reasons` for. The stake-shaped guards that DO
        apply to the call are `blockedReason` and the clip notice above.
      */}
      {call.engineSizes
        ? advice.warnings.map((warning) => (
            <Notice key={warning} tone="warn">
              {warning}
            </Notice>
          ))
        : null}
    </section>
  );
}
