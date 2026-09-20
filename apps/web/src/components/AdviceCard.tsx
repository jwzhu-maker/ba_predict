import { betLabel } from "@ba-predict/engine";
import { formatMoney, formatPercent } from "../lib/format";
import { useAdvice, useAppState, useDispatch } from "../state/store";
import { Notice } from "./Primitives";

const HEADLINE: Record<string, string> = {
  bet: "Bet",
  "sit-out": "Sit this one out",
  stop: "Stop",
  shuffle: "New shoe",
};

/**
 * The headline answer to "what do I bet, and how much".
 *
 * It deliberately shows the cost of the bet next to the bet itself. The
 * number is small per coup and that is exactly why it belongs on screen: the
 * edge is invisible hand-to-hand and decisive over a session.
 */
export default function AdviceCard() {
  const advice = useAdvice();
  const dispatch = useDispatch();
  const { pendingWager } = useAppState();

  // Prefixed `advice-tone-` rather than `advice-`: a bare `advice-bet`
  // modifier collides with the `.advice-bet` headline class and hands the
  // whole card that heading's font.
  const tone =
    advice.action === "stop" ? "stop" : advice.action === "bet" ? "bet" : "neutral";

  return (
    <section className={`advice advice-tone-${tone}`}>
      <p className="advice-kicker">{HEADLINE[advice.action]}</p>

      {advice.action === "bet" && advice.bet ? (
        <>
          <p className="advice-bet">{betLabel(advice.bet)}</p>
          <p className="advice-amount">{formatMoney(advice.amount)}</p>
          <p className="advice-cost">
            {formatPercent(advice.valuations![advice.bet].houseEdge)} house edge &middot; costs{" "}
            {formatMoney(advice.expectedCost)} per coup on average
          </p>
          <button
            type="button"
            className="button button-primary advice-action"
            disabled={
              pendingWager?.bet === advice.bet && pendingWager?.amount === advice.amount
            }
            onClick={() =>
              dispatch({
                type: "place-wager",
                wager: { bet: advice.bet!, amount: advice.amount },
              })
            }
          >
            {pendingWager?.bet === advice.bet && pendingWager?.amount === advice.amount
              ? "On the table"
              : "Put it on the table"}
          </button>
        </>
      ) : (
        <p className="advice-bet advice-bet-quiet">
          {advice.action === "stop"
            ? "Walk away"
            : advice.action === "shuffle"
              ? "Shoe exhausted"
              : "No stake"}
        </p>
      )}

      <ul className="advice-reasons">
        {advice.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>

      {advice.warnings.map((warning) => (
        <Notice key={warning} tone="warn">
          {warning}
        </Notice>
      ))}
    </section>
  );
}
