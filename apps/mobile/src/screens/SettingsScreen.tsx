import AsyncStorage from "@react-native-async-storage/async-storage";
import { CURRENCIES, STORAGE_KEY, createInitialState } from "@ba-predict/app-core";
import {
  BET_TYPES,
  PROGRESSIONS,
  betLabel,
  type BetType,
  type ProgressionId,
} from "@ba-predict/engine";
import { Linking, View } from "react-native";
import { Btn, Card, Hint, Notice, NumberInput, Picker, Prose, Row, SwitchRow } from "../components/ui";
import { useAppState, useDispatch } from "../state/store";

export default function SettingsScreen() {
  const { session, currency } = useAppState();
  const dispatch = useDispatch();
  const { rules, bankroll } = session;

  return (
    <View style={{ gap: 12 }}>
      <Card title="Table rules" subtitle="Match these to the table you are actually at">
        <NumberInput
          label="Decks"
          value={rules.decks}
          min={1}
          max={8}
          hint="Changing this starts a new shoe"
          onChange={(decks) =>
            dispatch({ type: "update-rules", rules: { decks: Math.round(decks) } })
          }
        />
        <NumberInput
          label="Tie pays"
          value={rules.tiePayout}
          min={1}
          hint="8:1 is usual; 9:1 is much better"
          onChange={(tiePayout) => dispatch({ type: "update-rules", rules: { tiePayout } })}
        />
        <SwitchRow
          label="No-commission table"
          hint="Banker pays even money but only half on a win with 6 — which costs more, not less"
          value={rules.bankerSixPayout !== null}
          onChange={(enabled) =>
            dispatch({
              type: "update-rules",
              rules: { bankerSixPayout: enabled ? 0.5 : null },
            })
          }
        />
        {rules.bankerSixPayout === null ? (
          <NumberInput
            label="Banker commission"
            value={rules.bankerCommission}
            min={0}
            max={0.25}
            hint="0.05 is the standard 5%"
            onChange={(bankerCommission) =>
              dispatch({ type: "update-rules", rules: { bankerCommission } })
            }
          />
        ) : (
          <NumberInput
            label="Banker-wins-on-6 pays"
            value={rules.bankerSixPayout}
            min={0}
            max={1}
            onChange={(bankerSixPayout) =>
              dispatch({ type: "update-rules", rules: { bankerSixPayout } })
            }
          />
        )}
        <NumberInput
          label="Pair pays"
          value={rules.pairPayout}
          min={1}
          onChange={(pairPayout) => dispatch({ type: "update-rules", rules: { pairPayout } })}
        />
        <NumberInput
          label="Either pair pays"
          value={rules.eitherPairPayout}
          min={1}
          onChange={(eitherPairPayout) =>
            dispatch({ type: "update-rules", rules: { eitherPairPayout } })
          }
        />
      </Card>

      <Card title="Money" subtitle="Everything else is derived from these">
        <Picker
          label="Currency"
          value={currency}
          options={CURRENCIES.map((option) => ({ value: option.code, label: option.label }))}
          hint="Display only — it labels the numbers and does not convert anything."
          onChange={(next: string) => dispatch({ type: "set-currency", currency: next })}
        />
        <NumberInput
          label="Bankroll"
          value={bankroll.bankroll}
          min={0}
          onChange={(value) => dispatch({ type: "update-bankroll", bankroll: { bankroll: value } })}
        />
        <NumberInput
          label="Session opened at"
          value={bankroll.startingBankroll}
          min={0}
          hint="What profit and loss is measured from"
          onChange={(value) =>
            dispatch({ type: "update-bankroll", bankroll: { startingBankroll: value } })
          }
        />
        <NumberInput
          label="Unit size"
          value={bankroll.unitSize}
          min={1}
          onChange={(value) => dispatch({ type: "update-bankroll", bankroll: { unitSize: value } })}
        />
        <NumberInput
          label="Table minimum"
          value={bankroll.tableMin}
          min={0}
          onChange={(value) => dispatch({ type: "update-bankroll", bankroll: { tableMin: value } })}
        />
        <NumberInput
          label="Table maximum"
          value={bankroll.tableMax}
          min={1}
          onChange={(value) => dispatch({ type: "update-bankroll", bankroll: { tableMax: value } })}
        />
      </Card>

      <Card
        title="Limits"
        subtitle="Set while you are not losing, which is the only time they get set honestly"
      >
        <NumberInput
          label="Stop-win"
          value={bankroll.stopWin ?? 0}
          min={0}
          hint="0 to disable"
          onChange={(value) =>
            dispatch({ type: "update-bankroll", bankroll: { stopWin: value > 0 ? value : null } })
          }
        />
        <NumberInput
          label="Stop-loss"
          value={bankroll.stopLoss ?? 0}
          min={0}
          hint="0 to disable"
          onChange={(value) =>
            dispatch({ type: "update-bankroll", bankroll: { stopLoss: value > 0 ? value : null } })
          }
        />
        <Hint>
          The advisor refuses to size a bet once either is reached. It is the only place in this
          app that will tell you to stop, so it is worth setting.
        </Hint>
      </Card>

      <Card title="Staking plan">
        <Picker
          label="System"
          value={session.progression.id}
          options={PROGRESSIONS.map((entry) => ({ value: entry.id, label: entry.name }))}
          hint={PROGRESSIONS.find((entry) => entry.id === session.progression.id)?.summary}
          onChange={(progression: ProgressionId) =>
            dispatch({ type: "set-progression", progression })
          }
        />
        <Picker
          label="Bet to follow"
          value={session.preferredBet}
          options={[
            { value: "auto" as const, label: "Automatic" },
            ...BET_TYPES.map((bet) => ({ value: bet, label: betLabel(bet) })),
          ]}
          hint="Automatic follows the lowest house edge"
          onChange={(bet: BetType | "auto") => dispatch({ type: "set-preferred-bet", bet })}
        />
        <NumberInput
          label="Kelly fraction"
          value={session.kellyMultiplier}
          min={0}
          max={1}
          hint="Only used if a bet is ever genuinely +EV, which on a real table it is not"
          onChange={(multiplier) => dispatch({ type: "set-kelly-multiplier", multiplier })}
        />
      </Card>

      <Card title="Start over" subtitle="Ending a session files it under History">
        <Row>
          {/* This one BANKS the session, unlike the "New shoe" on the Table
              tab, which only swaps the cards and keeps the sitting running. */}
          <Btn label="New shoe & file it" onPress={() => dispatch({ type: "end-session" })} />
          <Btn
            label="End session"
            variant="primary"
            onPress={() => dispatch({ type: "end-session" })}
          />
          <Btn label="Reset stake" onPress={() => dispatch({ type: "reset-session" })} />
        </Row>
        <Hint>
          End session banks the night and carries your current balance into a new one. Reset
          stake also files it, but puts the original starting bankroll back — for when you were
          experimenting rather than playing.
        </Hint>
        <Btn
          label="Erase everything"
          variant="danger"
          onPress={() => {
            void AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
            dispatch({ type: "hydrate", state: createInitialState() });
          }}
        />
        <Hint>
          Everything is stored on this device only. There is no account and no server — nothing
          you record here leaves your phone.
        </Hint>
      </Card>

      <Card title="What this app can and cannot do">
        <Prose>
          It computes the exact odds of the next coup from the cards still in the shoe, prices
          every bet on the layout against your table's rules, and sizes a stake from your own
          staking plan and limits. All of that is real arithmetic and it is correct.
        </Prose>
        <Prose>
          It cannot tell you who is going to win the next hand, and neither can anything else.
          Every bet here has a negative expected value, the best of them costs about 1.06% of
          everything you stake, and no pattern on the road and no progression changes that
          number. The most valuable thing in this app is the stop-loss.
        </Prose>
        <Notice tone="info">
          If gambling has stopped being entertainment, the numbers on this screen are not the
          problem this app can solve. Support is available at begambleaware.org.
        </Notice>
        <Btn
          label="Open BeGambleAware"
          onPress={() => void Linking.openURL("https://www.begambleaware.org")}
        />
      </Card>
    </View>
  );
}
