import { betLabel, type Outcome } from "@ba-predict/engine";
import { useCallback, useEffect, useState } from "react";
import { callToWager } from "@ba-predict/app-core";
import {
  useAppState,
  useDispatch,
  useMoney,
  usePendingStop,
  useTableCall,
} from "../state/store";

/** Which key records which result. Lower-case; the handler folds case. */
const KEY_OUTCOMES: Record<string, Outcome> = {
  p: "player",
  b: "banker",
  t: "tie",
};

/**
 * P / B / T, docked to the bottom of the screen on the Table tab — and on
 * the P, B and T keys.
 *
 * These three buttons are pressed once per coup and are the only control in
 * the app that is used on every single hand, so they are the one thing that
 * must never move and never need scrolling to.
 *
 * They used to live in a card partway down the page, which put them below
 * the Bet card and the system card — both of which change height as the shoe
 * goes on. Three rounds of reserved-height floors were spent chasing that,
 * and each round found another state nobody had driven (a tie appearing, the
 * reasoning unfolded, a table maximum below the ladder's ask). The floors
 * worked, at the cost of ~670px of reserved whitespace and a button a screen
 * and a half down the page. Docking the row removes the problem rather than
 * bounding it: nothing above it can move it, whatever is added up there
 * later.
 *
 * Two things about the layout are load-bearing:
 *
 *   - The buttons are the LAST row. Everything conditional sits above them,
 *     so the dock grows upward and the tap targets stay exactly where the
 *     thumb left them, even when a Big/Small wager adds a card-count row.
 *   - The per-coup modifiers live here, not in a card. Pairs, the Banker-6
 *     answer and the card count all have to be set BEFORE the result is
 *     recorded, and a pinned button whose inputs are two screens away
 *     records whatever those inputs happened to be left at.
 *
 * Undo and Redo share the top line with the stake, at the far end from the
 * buttons: a mis-tap is noticed the moment it lands, so taking it back has
 * to be as close to hand as the tap was — but small, and a row away, so it
 * is not what the thumb hits while tapping P and B.
 */
export default function RecordDock() {
  const { session, pendingWager, cardEntry, history, future } = useAppState();
  const dispatch = useDispatch();
  const money = useMoney();
  // What the Bet card is showing. Recording settles against it, so the two
  // can never disagree about the money that moved.
  const call = useTableCall();
  const settling = pendingWager ?? callToWager(call);
  // A limit waiting to be answered blocks the screen; the keys must not be
  // a way around it. The buttons are covered by the dialog, the keys are
  // not attached to anything the dialog can cover.
  const blocked = usePendingStop() !== null;

  const [playerPair, setPlayerPair] = useState(false);
  const [bankerPair, setBankerPair] = useState(false);
  const [cardCount, setCardCount] = useState<4 | 5 | 6 | null>(null);
  const [bankerWinOnSix, setBankerWinOnSix] = useState(false);

  const needsCardCount = settling?.bet === "big" || settling?.bet === "small";
  /**
   * Whether to ask about a Banker win with 6 — a property of the TABLE, not
   * of what is being staked.
   *
   * Asked only while the resolved wager was on Banker, the control appeared
   * and vanished as the app's recommendation moved between the two sides.
   *
   * A tick is used when this coup settles a Banker wager and is a no-op
   * otherwise: `CoupRecord` has no field for it, so the strategy replay and
   * the system run cannot read it back. That is what the run card's
   * "slightly generous" caveat is about, and closing it needs the coup to
   * persist the answer.
   */
  const noCommissionTable = session.rules.bankerSixPayout !== null;

  const record = useCallback(
    (outcome: Outcome) => {
      dispatch({
        type: "record-coup",
        wager: callToWager(call),
        coup: {
          outcome,
          playerPair,
          bankerPair,
          ...(cardCount !== null ? { cardCount } : {}),
          ...(noCommissionTable && outcome === "banker" ? { bankerWinOnSix } : {}),
        },
      });
      setPlayerPair(false);
      setBankerPair(false);
      setCardCount(null);
      setBankerWinOnSix(false);
    },
    [call, dispatch, playerPair, bankerPair, cardCount, bankerWinOnSix, noCommissionTable],
  );

  /**
   * P, B and T on the keyboard, doing exactly what the three buttons do.
   *
   * On a laptop this is the whole difference between transcribing a shoe
   * and fighting a mouse for it, and it costs nothing on a phone. It runs
   * through the same `record` as the buttons — same wager, same modifier
   * chips, same reset afterwards — so there is no second path through which
   * money can move.
   *
   * What it must never do is swallow a letter meant for something else, so
   * it stands down for:
   *
   *   - anything typed into a field, which is what keeps the "paste a run
   *     of results" box on this same screen from recording a coup per
   *     keystroke as "BPPB" is typed into it;
   *   - a shortcut (Ctrl/Cmd/Alt held), so Ctrl-P still prints;
   *   - a key another handler has already dealt with;
   *   - a key that is part of composing text in an IME;
   *   - a stop-win or stop-loss waiting to be answered, which blocks the
   *     screen and must block the shortcut with it.
   *
   * The listener is on `window` rather than on the dock because the dock is
   * not focusable and nothing here should require a click to "arm" it. The
   * dock renders only on the Table tab, so the keys are live exactly where
   * the buttons are.
   */
  useEffect(() => {
    if (blocked) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.isComposing) return;
      // A held key must not deal a coup every 30ms. Typing a run fast is
      // fine — auto-repeat is not typing.
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      const outcome = KEY_OUTCOMES[event.key.toLowerCase()];
      if (!outcome) return;
      // So the key cannot also scroll, type or trigger a browser shortcut.
      event.preventDefault();
      record(outcome);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [record, blocked]);

  return (
    <div className="record-dock">
      <div className="record-dock-top">
        <p className="record-dock-line">
          {settling
            ? `${money.format(settling.amount)} on ${betLabel(settling.bet)}`
            : "Nothing staked — road only"}
          {cardEntry.length > 0 ? ` · ${cardEntry.length} cards tracked` : null}
        </p>
        <div className="record-dock-history">
          <button
            type="button"
            className="chip chip-small"
            disabled={history.length === 0}
            onClick={() => dispatch({ type: "undo" })}
          >
            ↶ Undo last coup
          </button>
          <button
            type="button"
            className="chip chip-small"
            disabled={future.length === 0}
            onClick={() => dispatch({ type: "redo" })}
          >
            Redo ↷
          </button>
        </div>
      </div>

      <div className="record-dock-mods">
        <button
          type="button"
          className={`chip chip-small${playerPair ? " chip-active" : ""}`}
          aria-pressed={playerPair}
          onClick={() => setPlayerPair((value) => !value)}
        >
          P pair
        </button>
        <button
          type="button"
          className={`chip chip-small${bankerPair ? " chip-active" : ""}`}
          aria-pressed={bankerPair}
          onClick={() => setBankerPair((value) => !value)}
        >
          B pair
        </button>
        {noCommissionTable ? (
          <button
            type="button"
            className={`chip chip-small${bankerWinOnSix ? " chip-active" : ""}`}
            aria-pressed={bankerWinOnSix}
            onClick={() => setBankerWinOnSix((value) => !value)}
          >
            B won on 6
          </button>
        ) : null}
      </div>

      {/* Only a hand-placed Big or Small wager can need this, so it is the
          one row that appears in response to something the user did. It is
          above the buttons, so adding it does not move them. */}
      {needsCardCount ? (
        <div className="record-dock-mods">
          <span className="record-dock-label">
            Cards dealt, to settle {betLabel(settling!.bet)}
          </span>
          {([4, 5, 6] as const).map((count) => (
            <button
              key={count}
              type="button"
              className={`chip chip-small${cardCount === count ? " chip-active" : ""}`}
              aria-pressed={cardCount === count}
              onClick={() => setCardCount(count)}
            >
              {count}
            </button>
          ))}
        </div>
      ) : null}

      {/* The mark on each button is also its key, so the shortcut needs no
          legend of its own — only a title for anyone who hovers. */}
      <div className="outcome-row">
        <button
          type="button"
          className="outcome outcome-player"
          title="Player — or press P"
          aria-keyshortcuts="P"
          onClick={() => record("player")}
        >
          <span className="outcome-mark">P</span>
          <span>Player</span>
        </button>
        <button
          type="button"
          className="outcome outcome-banker"
          title="Banker — or press B"
          aria-keyshortcuts="B"
          onClick={() => record("banker")}
        >
          <span className="outcome-mark">B</span>
          <span>Banker</span>
        </button>
        <button
          type="button"
          className="outcome outcome-tie"
          title="Tie — or press T"
          aria-keyshortcuts="T"
          onClick={() => record("tie")}
        >
          <span className="outcome-mark">T</span>
          <span>Tie</span>
        </button>
      </div>
    </div>
  );
}
