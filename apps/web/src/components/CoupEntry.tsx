import { betLabel, type Outcome } from "@ba-predict/engine";
import { useState } from "react";
import { useAppState, useDispatch, useMoney } from "../state/store";
import { Card, Notice } from "./Primitives";

/**
 * Record what the table just did.
 *
 * The two conditional controls are not optional detail: Big/Small cannot be
 * settled without the card count, and a no-commission table pays a Banker win
 * on 6 differently. The engine refuses to guess either, so they appear exactly
 * when a wager depends on them.
 */
export default function CoupEntry() {
  const { session, pendingWager, lastSettlement } = useAppState();
  const dispatch = useDispatch();
  const money = useMoney();

  const [playerPair, setPlayerPair] = useState(false);
  const [bankerPair, setBankerPair] = useState(false);
  const [cardCount, setCardCount] = useState<4 | 5 | 6 | null>(null);
  const [bankerWinOnSix, setBankerWinOnSix] = useState(false);

  const needsCardCount = pendingWager?.bet === "big" || pendingWager?.bet === "small";
  const needsBankerSix =
    session.rules.bankerSixPayout !== null && pendingWager?.bet === "banker";

  const record = (outcome: Outcome) => {
    dispatch({
      type: "record-coup",
      coup: {
        outcome,
        playerPair,
        bankerPair,
        ...(cardCount !== null ? { cardCount } : {}),
        ...(needsBankerSix && outcome === "banker" ? { bankerWinOnSix } : {}),
      },
    });
    setPlayerPair(false);
    setBankerPair(false);
    setCardCount(null);
    setBankerWinOnSix(false);
  };

  return (
    <Card
      title="Record the result"
      subtitle={
        pendingWager
          ? `${money.format(pendingWager.amount)} on ${betLabel(pendingWager.bet)}`
          : "No wager on the table — this only updates the road"
      }
    >
      <div className="outcome-row">
        <button type="button" className="outcome outcome-player" onClick={() => record("player")}>
          <span className="outcome-mark">P</span>
          <span>Player</span>
        </button>
        <button type="button" className="outcome outcome-banker" onClick={() => record("banker")}>
          <span className="outcome-mark">B</span>
          <span>Banker</span>
        </button>
        <button type="button" className="outcome outcome-tie" onClick={() => record("tie")}>
          <span className="outcome-mark">T</span>
          <span>Tie</span>
        </button>
      </div>

      <div className="chip-row">
        <button
          type="button"
          className={`chip${playerPair ? " chip-active" : ""}`}
          aria-pressed={playerPair}
          onClick={() => setPlayerPair((value) => !value)}
        >
          Player pair
        </button>
        <button
          type="button"
          className={`chip${bankerPair ? " chip-active" : ""}`}
          aria-pressed={bankerPair}
          onClick={() => setBankerPair((value) => !value)}
        >
          Banker pair
        </button>
      </div>

      {needsCardCount ? (
        <div className="conditional">
          <p className="field-label">Cards dealt (needed to settle {betLabel(pendingWager.bet)})</p>
          <div className="chip-row">
            {([4, 5, 6] as const).map((count) => (
              <button
                key={count}
                type="button"
                className={`chip${cardCount === count ? " chip-active" : ""}`}
                aria-pressed={cardCount === count}
                onClick={() => setCardCount(count)}
              >
                {count}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {needsBankerSix ? (
        <div className="conditional">
          <p className="field-label">This table pays less on a Banker win with 6</p>
          <div className="chip-row">
            <button
              type="button"
              className={`chip${bankerWinOnSix ? " chip-active" : ""}`}
              aria-pressed={bankerWinOnSix}
              onClick={() => setBankerWinOnSix((value) => !value)}
            >
              Banker won on 6
            </button>
          </div>
        </div>
      ) : null}

      {lastSettlement?.unsettled ? <Notice tone="warn">{lastSettlement.unsettled}</Notice> : null}

      <div className="button-row">
        <button
          type="button"
          className="button"
          disabled={session.coups.length === 0}
          onClick={() => dispatch({ type: "undo" })}
        >
          Undo last coup
        </button>
        <button type="button" className="button" onClick={() => dispatch({ type: "new-shoe" })}>
          New shoe
        </button>
      </div>
    </Card>
  );
}
