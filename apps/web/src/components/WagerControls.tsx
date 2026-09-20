import { BET_TYPES, betLabel, type BetType } from "@ba-predict/engine";
import { useState } from "react";
import { formatPercent } from "../lib/format";
import { useAdvice, useAppState, useDispatch, useMoney } from "../state/store";
import { Card } from "./Primitives";

/** Place a wager by hand when you are not taking the recommendation. */
export default function WagerControls() {
  const { session, pendingWager } = useAppState();
  const advice = useAdvice();
  const dispatch = useDispatch();
  const money = useMoney();
  const unit = session.bankroll.unitSize || 1;

  const [bet, setBet] = useState<BetType>(advice.bet ?? "banker");
  const [amount, setAmount] = useState<number>(session.bankroll.tableMin);

  const adjust = (delta: number) => {
    const next = Math.round((amount + delta * unit) / unit) * unit;
    setAmount(Math.min(Math.max(next, 0), session.bankroll.tableMax));
  };

  const edge = advice.valuations?.[bet]?.houseEdge;

  return (
    <Card title="Place a bet" subtitle="Or override the recommendation">
      <div className="chip-row" role="group" aria-label="Bet">
        {BET_TYPES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={`chip${bet === candidate ? " chip-active" : ""}`}
            onClick={() => setBet(candidate)}
            aria-pressed={bet === candidate}
          >
            {betLabel(candidate)}
          </button>
        ))}
      </div>

      <div className="stepper">
        <button type="button" className="button" onClick={() => adjust(-5)} aria-label="Less five units">
          −5u
        </button>
        <button type="button" className="button" onClick={() => adjust(-1)} aria-label="Less one unit">
          −1u
        </button>
        <output className="stepper-value">{money.format(amount)}</output>
        <button type="button" className="button" onClick={() => adjust(1)} aria-label="Plus one unit">
          +1u
        </button>
        <button type="button" className="button" onClick={() => adjust(5)} aria-label="Plus five units">
          +5u
        </button>
      </div>

      {edge !== undefined ? (
        <p className="field-hint">
          {betLabel(bet)} costs {formatPercent(edge)} of every unit staked &mdash; about{" "}
          {money.format(amount * edge)} on this wager.
        </p>
      ) : null}

      <div className="button-row">
        <button
          type="button"
          className="button button-primary"
          disabled={amount <= 0 || amount > session.bankroll.bankroll}
          onClick={() => dispatch({ type: "place-wager", wager: { bet, amount } })}
        >
          Place {money.format(amount)}
        </button>
        <button
          type="button"
          className="button"
          disabled={!pendingWager}
          onClick={() => dispatch({ type: "place-wager", wager: null })}
        >
          Take it back
        </button>
      </div>

      {amount > session.bankroll.bankroll ? (
        <p className="field-hint field-hint-warn">That is more than your remaining bankroll.</p>
      ) : null}
    </Card>
  );
}
