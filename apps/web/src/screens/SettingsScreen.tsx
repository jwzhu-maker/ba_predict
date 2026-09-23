import { CURRENCIES } from "@ba-predict/app-core";
import {
  BET_TYPES,
  PROGRESSIONS,
  betLabel,
  type BetType,
  type ProgressionId,
} from "@ba-predict/engine";
import { Card, NumberField, Notice, SelectField, Toggle } from "../components/Primitives";
import { useAppState, useDispatch } from "../state/store";

/** The shoe sizes a real table is dealt from. */
const DECK_COUNTS = [1, 2, 4, 6, 8, 10, 12] as const;

/**
 * Deck counts to offer, including whatever is currently set.
 *
 * A list rather than a number box because the choice is a handful of fixed
 * values, and because a one-character number box is where a controlled
 * input's refusal to be cleared bites hardest — the field the user reported
 * as impossible to change. A dropdown cannot be half-typed.
 *
 * The current value is folded in so a shoe size set by an older build (or
 * by a hand-edited payload) is shown rather than silently reading as
 * whatever sorts first.
 */
function deckOptions(current: number): { value: number; label: string }[] {
  const counts = DECK_COUNTS.includes(current as (typeof DECK_COUNTS)[number])
    ? [...DECK_COUNTS]
    : [...DECK_COUNTS, current].sort((a, b) => a - b);
  return counts.map((count) => ({
    value: count,
    label: count === 1 ? "1 deck" : `${count} decks`,
  }));
}

export default function SettingsScreen() {
  const { session, currency } = useAppState();
  const dispatch = useDispatch();
  const { rules, bankroll } = session;

  return (
    <div className="screen">
      <Card title="Table rules" subtitle="Match these to the table you are actually at">
        <div className="field-grid">
          <SelectField
            label="Decks"
            value={rules.decks}
            options={deckOptions(rules.decks)}
            hint="Changing this starts a new shoe"
            onChange={(decks) => dispatch({ type: "update-rules", rules: { decks } })}
          />
          <NumberField
            label="Tie pays"
            value={rules.tiePayout}
            min={1}
            step={1}
            hint="8:1 is usual; 9:1 is much better"
            onChange={(tiePayout) => dispatch({ type: "update-rules", rules: { tiePayout } })}
          />
        </div>

        <Toggle
          label="No-commission table"
          hint="Banker pays even money but only half on a win with 6 — which costs more, not less"
          checked={rules.bankerSixPayout !== null}
          onChange={(enabled) =>
            dispatch({
              type: "update-rules",
              rules: { bankerSixPayout: enabled ? 0.5 : null },
            })
          }
        />

        {rules.bankerSixPayout === null ? (
          <NumberField
            label="Banker commission"
            value={rules.bankerCommission}
            min={0}
            max={0.25}
            step={0.01}
            hint="0.05 is the standard 5%"
            onChange={(bankerCommission) =>
              dispatch({ type: "update-rules", rules: { bankerCommission } })
            }
          />
        ) : (
          <NumberField
            label="Banker-wins-on-6 pays"
            value={rules.bankerSixPayout}
            min={0}
            max={1}
            step={0.05}
            onChange={(bankerSixPayout) =>
              dispatch({ type: "update-rules", rules: { bankerSixPayout } })
            }
          />
        )}

        <div className="field-grid">
          <NumberField
            label="Pair pays"
            value={rules.pairPayout}
            min={1}
            onChange={(pairPayout) => dispatch({ type: "update-rules", rules: { pairPayout } })}
          />
          <NumberField
            label="Either pair pays"
            value={rules.eitherPairPayout}
            min={1}
            onChange={(eitherPairPayout) =>
              dispatch({ type: "update-rules", rules: { eitherPairPayout } })
            }
          />
        </div>
      </Card>

      <Card title="Money" subtitle="Everything else is derived from these">
        <div className="field">
          <span className="field-label">Currency</span>
          <select
            className="input"
            value={currency}
            onChange={(event) =>
              dispatch({ type: "set-currency", currency: event.target.value })
            }
          >
            {CURRENCIES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Display only — it labels the numbers and does not convert anything.
          </span>
        </div>
        <div className="field-grid">
          <NumberField
            label="Bankroll"
            value={bankroll.bankroll}
            min={0}
            onChange={(value) => dispatch({ type: "update-bankroll", bankroll: { bankroll: value } })}
          />
          <NumberField
            label="Session opened at"
            value={bankroll.startingBankroll}
            min={0}
            hint="What profit and loss is measured from"
            onChange={(value) =>
              dispatch({ type: "update-bankroll", bankroll: { startingBankroll: value } })
            }
          />
          <NumberField
            label="Unit size"
            value={bankroll.unitSize}
            min={1}
            onChange={(value) => dispatch({ type: "update-bankroll", bankroll: { unitSize: value } })}
          />
          <NumberField
            label="Table minimum"
            value={bankroll.tableMin}
            min={0}
            onChange={(value) => dispatch({ type: "update-bankroll", bankroll: { tableMin: value } })}
          />
          <NumberField
            label="Table maximum"
            value={bankroll.tableMax}
            min={1}
            onChange={(value) => dispatch({ type: "update-bankroll", bankroll: { tableMax: value } })}
          />
        </div>
      </Card>

      <Card
        title="Limits"
        subtitle="Set while you are not losing, which is the only time they get set honestly"
      >
        <div className="field-grid">
          <NumberField
            label="Stop-win"
            value={bankroll.stopWin ?? 0}
            min={0}
            hint="0 to disable"
            onChange={(value) =>
              dispatch({ type: "update-bankroll", bankroll: { stopWin: value > 0 ? value : null } })
            }
          />
          <NumberField
            label="Stop-loss"
            value={bankroll.stopLoss ?? 0}
            min={0}
            hint="0 to disable"
            onChange={(value) =>
              dispatch({ type: "update-bankroll", bankroll: { stopLoss: value > 0 ? value : null } })
            }
          />
        </div>
        <p className="field-hint">
          The advisor refuses to size a bet once either is reached. It is the only place in this
          app that will tell you to stop, so it is worth setting.
        </p>
      </Card>

      <Card title="Staking plan">
        <div className="field">
          <span className="field-label">System</span>
          <select
            className="input"
            value={session.progression.id}
            onChange={(event) =>
              dispatch({ type: "set-progression", progression: event.target.value as ProgressionId })
            }
          >
            {PROGRESSIONS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          <span className="field-hint">
            {PROGRESSIONS.find((entry) => entry.id === session.progression.id)?.summary}
          </span>
        </div>

        <div className="field">
          <span className="field-label">Bet to follow</span>
          <select
            className="input"
            value={session.preferredBet}
            onChange={(event) =>
              dispatch({
                type: "set-preferred-bet",
                bet: event.target.value as BetType | "auto",
              })
            }
          >
            <option value="auto">Automatic (lowest house edge)</option>
            {BET_TYPES.map((bet) => (
              <option key={bet} value={bet}>
                {betLabel(bet)}
              </option>
            ))}
          </select>
        </div>

        <NumberField
          label="Kelly fraction"
          value={session.kellyMultiplier}
          min={0}
          max={1}
          step={0.25}
          hint="Only used if a bet is ever genuinely +EV, which on a real table it is not"
          onChange={(multiplier) => dispatch({ type: "set-kelly-multiplier", multiplier })}
        />
      </Card>

      <Card title="What this app can and cannot do">
        {/* "Start over" used to sit above this, and now opens the History
            tab, where both of its buttons file the session. The privacy
            line it carried stays here, which is where a statement about
            where your data lives belongs. */}
        <p className="prose">
          Everything is stored on this device only. There is no account and no server &mdash;
          nothing you record here leaves your phone.
        </p>
        <p className="prose">
          It computes the exact odds of the next coup from the cards still in the shoe, prices
          every bet on the layout against your table's rules, and sizes a stake from your own
          staking plan and limits. All of that is real arithmetic and it is correct.
        </p>
        <p className="prose">
          It cannot tell you who is going to win the next hand, and neither can anything else.
          Every bet here has a negative expected value, the best of them costs about 1.06% of
          everything you stake, and no pattern on the road and no progression changes that
          number. The most valuable thing in this app is the stop-loss.
        </p>
        <Notice tone="info">
          If gambling has stopped being entertainment, the numbers on this screen are not the
          problem this app can solve. Support is available at{" "}
          <a href="https://www.begambleaware.org" target="_blank" rel="noreferrer noopener">
            BeGambleAware
          </a>
          .
        </Notice>
      </Card>
    </div>
  );
}
