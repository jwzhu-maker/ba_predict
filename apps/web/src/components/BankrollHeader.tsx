import { useAppState, useMoney } from "../state/store";

/**
 * Bankroll and session result, pinned to the top-right of every screen.
 *
 * These two numbers live in the sticky header rather than in a card because
 * a card scrolls away. The roads, the odds table and the strategy record are
 * all below the fold, so the moment a player starts reading any of them the
 * only figures that matter stop being visible — and not noticing is how a
 * session gets away from someone.
 *
 * The detail (the stop-win/stop-loss meter, the staking plan, the running
 * cost) stays in `BankrollBar` on the Table tab. This is the glance; that is
 * the look.
 */
export default function BankrollHeader() {
  const { session } = useAppState();
  const money = useMoney();
  const profit = session.bankroll.bankroll - session.bankroll.startingBankroll;

  return (
    <div className="header-money">
      <div className="header-money-cell">
        <span className="header-money-label">Bankroll</span>
        <span className="header-money-value">{money.format(session.bankroll.bankroll)}</span>
      </div>
      <div className="header-money-cell">
        <span className="header-money-label">Session</span>
        <span className={`header-money-value ${profit >= 0 ? "good" : "bad"}`}>
          {money.signed(profit)}
        </span>
      </div>
    </div>
  );
}
