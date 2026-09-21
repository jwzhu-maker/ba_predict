import { useEffect, useRef, type KeyboardEvent } from "react";
import { stopProfit } from "@ba-predict/app-core";
import { useDispatch, useMoney, usePendingStop } from "../state/store";

/**
 * The one interruption this app makes.
 *
 * A stop-win or stop-loss is the only thing here that is worth taking the
 * screen away for. Everything else the app has to say is advice about a
 * hand; a limit is a decision the player made in advance, while they were
 * not losing, and the moment it is reached is precisely the moment it stops
 * feeling binding. The Bet card already refuses to size a stake past it —
 * quietly, in a card that can be scrolled past. This cannot be scrolled
 * past.
 *
 * It is modal in the strict sense: it covers the screen, it takes focus, and
 * it does not close on Escape or on a click outside. There are two ways out
 * and they are both deliberate, because a limit dismissed by a stray tap is
 * a limit that was never set. The keys that record a coup are held off while
 * it is up (see `RecordDock`), so the shortcut cannot play a hand behind it.
 *
 * "Keep playing" is offered, and offered without argument beyond the one
 * line above the buttons. An app that hides the exit does not stop anyone
 * playing; it stops them recording what they play, which loses the one
 * honest number in the room.
 */
export default function StopDialog() {
  const stop = usePendingStop();
  const dispatch = useDispatch();
  const money = useMoney();
  const dialogRef = useRef<HTMLDivElement>(null);

  /**
   * Take focus, onto the dialog itself rather than onto a button.
   *
   * Focusing the primary button looks more helpful and is a trap: the
   * keystroke that RAISED the dialog is usually still going. Committing a
   * bankroll with Enter in Settings crosses the stop-loss, mounts this, the
   * button takes focus mid-keypress, and the same Enter closes the session
   * the player never chose to close. Driving it in a browser is the only
   * way that showed up.
   *
   * Focusing the container fixes it outright — nothing here is armed by a
   * key already held down — and is what an alert dialog is meant to do
   * anyway: a screen reader reads the title and the body before the
   * choices, instead of announcing one button in isolation.
   */
  useEffect(() => {
    if (stop) dialogRef.current?.focus();
  }, [stop]);

  /**
   * Hold the page still behind the dialog.
   *
   * Without this the page underneath scrolls on a phone, which both breaks
   * the illusion that it is blocked and can leave the player scrolled to a
   * card they cannot touch.
   */
  useEffect(() => {
    if (!stop) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [stop]);

  if (!stop) return null;

  const amount = money.format(stopProfit(stop.session, stop.kind));
  const limit = money.format(stop.limit);
  const win = stop.kind === "stop-win";

  /**
   * Keep Tab inside the dialog.
   *
   * Without this, tabbing walks straight out onto the tab bar and the
   * Record buttons behind the overlay — controls that are covered for the
   * mouse and would still be reachable from the keyboard.
   */
  const keepFocusInside = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    // Leaving either end wraps to the other; from the dialog itself, Tab
    // enters at the top and Shift-Tab at the bottom.
    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className={`modal${win ? " modal-good" : " modal-warn"}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="stop-dialog-title"
        aria-describedby="stop-dialog-body"
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={keepFocusInside}
      >
        <h2 className="modal-title" id="stop-dialog-title">
          {win ? "Stop-win reached" : "Stop-loss reached"}
        </h2>
        <div className="modal-body" id="stop-dialog-body">
          <p>
            {win
              ? `You are up ${amount}, at or past the ${limit} you set as your target.`
              : `You are down ${amount}, at or past the ${limit} you set as your limit.`}
          </p>
          <p>
            {win
              ? "Every further coup hands the edge back. Booking it is the only move here with a positive expectation."
              : "This is the limit you set while you were not losing. It was worth more than one session then, and it still is."}
          </p>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="button button-primary"
            onClick={() => dispatch({ type: "end-session" })}
          >
            {win ? "Book it and close the session" : "Stop and close the session"}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => dispatch({ type: "acknowledge-stop" })}
          >
            Keep playing
          </button>
        </div>
        <p className="modal-note">
          Closing files this session under History and opens a new one from the money you have
          now. Keeping playing changes nothing except that you were asked &mdash; the advisor
          still declines to size a stake while you are past a limit, until you move it in
          Settings.
        </p>
      </div>
    </div>
  );
}
