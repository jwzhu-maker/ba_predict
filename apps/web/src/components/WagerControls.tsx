import { betLabel, type BetType } from "@ba-predict/engine";
import { useState } from "react";
import { formatPercent } from "../lib/format";
import { useAdvice, useAppState, useDispatch, useMoney, useTableCall } from "../state/store";
import { Card } from "./Primitives";

/**
 * Override the app's call: a different side, a different amount, or both.
 *
 * Everything here starts from what the Bet card is already showing, because
 * that is what will be staked if this card is never touched. Opening it on
 * the table minimum instead meant the commonest edit — "same bet, a bit more"
 * — began by dialling the suggestion back up from scratch.
 *
 * The stepper is proportional (±20%, ±50%, ×2) rather than in units. A unit
 * step is the wrong size at both ends of a ladder that runs from 100 to 600:
 * +1u is invisible at the top and +5u overshoots at the bottom.
 */

/** Player, Tie, Banker in table order; the rest are side bets. */
const PRIMARY: BetType[] = ["player", "tie", "banker"];
const SECONDARY: BetType[] = ["playerPair", "bankerPair", "eitherPair", "big", "small"];

export default function WagerControls() {
  const { session, pendingWager } = useAppState();
  const advice = useAdvice();
  const call = useTableCall();
  const dispatch = useDispatch();
  const money = useMoney();

  // Null means "follow the Bet card". Touching a control pins a value here;
  // taking the wager back, or the app's call changing, releases it again.
  const [betOverride, setBetOverride] = useState<BetType | null>(null);
  const [amountOverride, setAmountOverride] = useState<number | null>(null);
  const [followedCall, setFollowedCall] = useState<string>("");

  const callKey = `${call.bet ?? "none"}:${call.amount}`;
  if (callKey !== followedCall) {
    // The suggestion moved (a new coup, a ladder step, a different system),
    // so the default moves with it rather than stranding the previous one.
    // Setting state during render is the documented way to reset derived
    // state on a prop change; React re-renders before committing.
    setFollowedCall(callKey);
    setBetOverride(null);
    setAmountOverride(null);
  }

  const bet = betOverride ?? call.bet ?? advice.bet ?? "banker";
  const suggested = call.amount > 0 ? call.amount : session.bankroll.tableMin;
  const amount = amountOverride ?? suggested;

  const clamp = (value: number) =>
    Math.min(Math.max(Math.round(value), 0), session.bankroll.tableMax);

  /**
   * Scale the stake, guaranteeing movement.
   *
   * Rounding to whole currency keeps the amount placeable in chips, but on a
   * small stake it can round straight back to where it started — +20% of 2 is
   * 2 — and a button that visibly does nothing reads as broken.
   */
  const scale = (factor: number) => {
    const next = clamp(amount * factor);
    setAmountOverride(next !== amount ? next : clamp(amount + (factor > 1 ? 1 : -1)));
  };

  const edge = advice.valuations?.[bet]?.houseEdge;
  const onTable = pendingWager !== null;

  const chip = (candidate: BetType, large: boolean) => (
    <button
      key={candidate}
      type="button"
      className={`chip${large ? " chip-large" : ""}${bet === candidate ? " chip-active" : ""}`}
      onClick={() => setBetOverride(candidate)}
      aria-pressed={bet === candidate}
    >
      {betLabel(candidate)}
    </button>
  );

  return (
    <Card title="Place a bet" subtitle="To override the recommendation">
      {/* Player, Tie, Banker on their own line and in table order, with the
          two real bets given the size their use deserves. */}
      <div className="chip-row chip-row-primary" role="group" aria-label="Bet">
        {PRIMARY.map((candidate) => chip(candidate, candidate !== "tie"))}
      </div>

      <div className="chip-row" role="group" aria-label="Side bets">
        {SECONDARY.map((candidate) => chip(candidate, false))}
      </div>

      <div className="stepper">
        <button type="button" className="button" onClick={() => scale(0.5)}>
          &minus;50%
        </button>
        <button type="button" className="button" onClick={() => scale(0.8)}>
          &minus;20%
        </button>
        <output className="stepper-value">{money.format(amount)}</output>
        <button type="button" className="button" onClick={() => scale(1.2)}>
          +20%
        </button>
        <button type="button" className="button" onClick={() => scale(1.5)}>
          +50%
        </button>
      </div>

      <div className="button-row">
        <button type="button" className="button" onClick={() => scale(2)}>
          Double &times; 2
        </button>
        <button
          type="button"
          className="button"
          disabled={amountOverride === null}
          onClick={() => setAmountOverride(null)}
        >
          Back to {money.format(suggested)}
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
          // Once it is on the table there is nothing left to place; a second
          // press would only stake it again. Take it back to edit.
          disabled={onTable || amount <= 0 || amount > session.bankroll.bankroll}
          onClick={() => dispatch({ type: "place-wager", wager: { bet, amount } })}
        >
          {onTable ? "On the table" : `Place ${money.format(amount)}`}
        </button>
        <button
          type="button"
          className="button"
          disabled={!onTable}
          onClick={() => {
            dispatch({ type: "place-wager", wager: null });
            setBetOverride(null);
            setAmountOverride(null);
          }}
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
