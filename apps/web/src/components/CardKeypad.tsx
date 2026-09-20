import { RANKS, cardsRemaining, penetration, type Rank } from "@ba-predict/engine";
import { formatPercent } from "../lib/format";
import { useAppState, useDispatch } from "../state/store";
import { Card } from "./Primitives";

/**
 * Optional card tracking.
 *
 * Optional on purpose. Not entering cards is not a degraded mode: unseen cards
 * leave the shoe in the proportions it already holds, so an untracked shoe's
 * fresh-shoe probabilities are the correct estimate, not a fallback. Tracking
 * sharpens the numbers by a fraction of a percent late in a shoe, and the app
 * says so rather than implying the opposite.
 */
export default function CardKeypad() {
  const { session, cardEntry } = useAppState();
  const dispatch = useDispatch();
  const remaining = cardsRemaining(session.shoe);

  return (
    <Card
      title="Track the cards"
      subtitle={`${remaining} left · ${formatPercent(penetration(session.shoe), 0)} dealt`}
    >
      <div className="keypad">
        {RANKS.map((rank: Rank) => {
          const left = session.shoe.byRank[RANKS.indexOf(rank)] ?? 0;
          return (
            <button
              key={rank}
              type="button"
              className="key"
              disabled={left === 0 || cardEntry.length >= 6}
              onClick={() => dispatch({ type: "add-card", rank })}
            >
              <span className="key-rank">{rank}</span>
              <span className="key-left">{left}</span>
            </button>
          );
        })}
      </div>

      <div className="entry-row">
        <span className="field-label">This coup</span>
        <span className="entry-cards">
          {cardEntry.length === 0 ? (
            <em className="field-hint">nothing entered — odds stay at the shoe average</em>
          ) : (
            cardEntry.map((rank, index) => (
              <span key={`${rank}-${index}`} className="entry-card">
                {rank}
              </span>
            ))
          )}
        </span>
      </div>

      <div className="button-row">
        <button
          type="button"
          className="button"
          disabled={cardEntry.length === 0}
          onClick={() => dispatch({ type: "remove-card" })}
        >
          Backspace
        </button>
        <button
          type="button"
          className="button"
          disabled={cardEntry.length === 0}
          onClick={() => dispatch({ type: "clear-cards" })}
        >
          Clear
        </button>
      </div>
      {/*
        Say why the keypad has gone dead, rather than letting it read as
        broken: a coup is at most six cards — two each, plus at most one
        third card a side — so the seventh tap has nowhere to go.
      */}
      {cardEntry.length >= 6 ? (
        <p className="field-hint field-hint-warn">
          That is the whole coup — six cards is the most one can use (two each, plus at most one
          third card a side). Record the result, or Backspace to correct.
        </p>
      ) : null}

      <p className="field-hint">
        Cards are applied when you record the result. Entering them is worth a fraction of a
        percent deep into a shoe — it is not what decides whether you are ahead.
      </p>
    </Card>
  );
}
