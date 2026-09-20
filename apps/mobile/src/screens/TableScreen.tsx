import {
  RANKS,
  betLabel,
  cardsRemaining,
  penetration,
  type BetType,
  type Rank,
} from "@ba-predict/engine";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import ShoeRoads from "../components/ShoeRoads";
import SystemNextBet from "../components/SystemNextBet";
import Sparkline from "../components/Sparkline";
import { Btn, Card, Chip, Hint, Notice, Row, Stat, useStyles } from "../components/ui";
import { callToWager, describeEdge } from "@ba-predict/app-core";
import { formatOdds, formatPercent, formatUnits } from "../lib/format";
import {
  useAdvice,
  useAppState,
  useDispatch,
  useMoney,
  useStats,
  useTableCall,
} from "../state/store";
import { usePalette } from "../theme";

export default function TableScreen() {
  const p = usePalette();
  const s = useStyles(p);
  const local = useLocalStyles();
  const { session, pendingWager, cardEntry, lastSettlement, skipNextCoup, adviceReasonsOpen } =
    useAppState();
  const dispatch = useDispatch();
  const advice = useAdvice();
  // What the Bet card shows and what a recorded result settles against, so
  // the two can never disagree about the money that moved.
  const call = useTableCall();
  const settling = pendingWager ?? callToWager(call);
  const stats = useStats();
  const money = useMoney();

  // The per-coup modifiers and the `record` dispatch that used them moved
  // to `RecordDock` with the buttons they belong to.
  // In app state, not local: the tab navigator unmounts this screen, so a
  // `useState` here folded the reasoning again every time the user looked at
  // the roads and came back.
  const showWhy = adviceReasonsOpen;
  // Null means "follow the Bet card"; touching a control pins a value, and
  // taking the wager back (or the app's call moving on) releases it again.
  const [betOverride, setBetOverride] = useState<BetType | null>(null);
  const [amountOverride, setAmountOverride] = useState<number | null>(null);
  const [followedCall, setFollowedCall] = useState("");

  const callKey = `${call.bet ?? "none"}:${call.amount}`;
  if (callKey !== followedCall) {
    setFollowedCall(callKey);
    setBetOverride(null);
    setAmountOverride(null);
  }

  const manualBet = betOverride ?? call.bet ?? advice.bet ?? "banker";
  const suggested = call.amount > 0 ? call.amount : session.bankroll.tableMin;
  const manualAmount = amountOverride ?? suggested;
  const onTable = pendingWager !== null;

  const clampStake = (value: number) =>
    Math.min(Math.max(Math.round(value), 0), session.bankroll.tableMax);

  /**
   * Scale the stake, guaranteeing movement: +20% of 2 rounds back to 2, and
   * a button that visibly does nothing reads as broken.
   */
  const scale = (factor: number) => {
    const next = clampStake(manualAmount * factor);
    setAmountOverride(
      next !== manualAmount ? next : clampStake(manualAmount + (factor > 1 ? 1 : -1)),
    );
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={local.bankroll}>
        {/* The two headline figures moved to the app header, where they stay
            visible on every screen and through a scroll. Repeating them here
            would be the same number twice on one screen. */}
        <Hint>
          Next stake {formatUnits(session.progression.units)}u ·{" "}
          {session.progression.id.replace(/-/g, " ")} · {stats.wagers} wagers
        </Hint>
      </View>

      {/*
        Reserved so the Record buttons below do not move between coups: the
        card gains an amount, a cost line, a detail line and the skip button
        on a live call and drops all four on a warm-up. See the matching
        note in the web stylesheet for how the number was derived.
      */}
      {/*
        No reserved height any more. The Record buttons it existed to hold
        still are docked above the tab bar now, so nothing this card does
        can move them and it is free to be as tall as its content.
      */}
      <View style={local.advice}>
        <Text style={local.kicker}>
          {advice.action === "stop"
            ? "STOP"
            : call.source === "manual"
              ? "YOUR BET"
              : call.source === "skipped"
                ? "SITTING OUT"
                : (call.systemName ?? "BET").toUpperCase()}
        </Text>
        {call.bet !== null ? (
          <>
            <Text style={local.adviceBet}>{betLabel(call.bet)}</Text>
            <Text style={[local.adviceAmount, { color: p.accent }]}>
              {money.format(call.amount)}
            </Text>
            {advice.valuations?.[call.bet] ? (
              <Hint>
                {formatPercent(advice.valuations[call.bet]!.houseEdge)} house edge · costs{" "}
                {money.format(call.amount * advice.valuations[call.bet]!.houseEdge)} on this wager
              </Hint>
            ) : null}
            {call.detail ? <Hint>{call.detail}</Hint> : null}
          </>
        ) : (
          <>
            <Text style={[local.adviceBet, { color: p.muted, fontSize: 24 }]}>No bet</Text>
            {call.noBetReason ? <Hint>{call.noBetReason}</Hint> : null}
          </>
        )}

        {/* `stakes`, not `bet`: the card can point at Player 400 while
            observe mode, a stop or the bankroll refuses to act on it. */}
        <Text style={{ color: p.text, fontSize: 13, fontWeight: "600", marginTop: 8 }}>
          {call.stakes
            ? `Recording the result will settle ${money.format(call.amount)} on ${betLabel(call.bet!)}.`
            : "Recording the result will stake nothing."}
        </Text>

        {call.blockedReason ? <Notice tone="warn">{call.blockedReason}</Notice> : null}

        {/* The only control here: betting the suggestion is the default path,
            so the button is for the exception. */}
        {call.stakes || skipNextCoup ? (
          <Btn
            label={skipNextCoup ? "Bet after all" : "I don't bet this time"}
            variant={skipNextCoup ? "primary" : "danger"}
            onPress={() => dispatch({ type: "skip-next-coup", skip: !skipNextCoup })}
          />
        ) : null}

        {call.clipped && call.requestedAmount !== null ? (
          <Notice tone="warn">
            Table maximum — the ladder wanted {money.format(call.requestedAmount)}.
          </Notice>
        ) : null}

        {/* Folded: these lines are the same every hand, and open they were
            most of the height this card has to reserve. */}
        <Pressable
          onPress={() => dispatch({ type: "set-advice-reasons-open", open: !showWhy })}
          accessibilityRole="button"
        >
          <Text style={{ color: p.muted, fontSize: 12, fontWeight: "600", paddingVertical: 4 }}>
            {showWhy ? "Hide why" : "Why this"}
          </Text>
        </Pressable>
        {showWhy && call.engineSizes && advice.sizingReason ? (
          <Hint>• {advice.sizingReason}</Hint>
        ) : null}
        {showWhy && call.source === "system" && call.systemName ? (
          <Hint>
            • {call.systemName} is setting the side and the stake here, not the engine. It cannot
            change what a bet costs — only how much and how often you bet.
          </Hint>
        ) : null}
        {showWhy ? advice.reasons.map((reason) => <Hint key={reason}>• {reason}</Hint>) : null}
        {/* The engine's warnings are computed from the ENGINE's stake, so
            against a system's amount they describe money nobody is putting
            down — the same trap `sizingReason` was pulled out of `reasons`
            for. `blockedReason` above is the guard that does apply. */}
        {call.engineSizes
          ? advice.warnings.map((warning) => (
              <Notice key={warning} tone="warn">
                {warning}
              </Notice>
            ))
          : null}
      </View>

      <SystemNextBet />

      {/*
        Recording moved to `RecordDock`, pinned above the tab bar. What is
        left are the two actions taken once in a while rather than once a
        hand — see the web `CoupEntry` for the same split.
      */}
      <Card title="This shoe" subtitle="Fixing a mis-tap, and starting the next one">
        {lastSettlement?.unsettled ? <Notice tone="warn">{lastSettlement.unsettled}</Notice> : null}

        <Row>
          <Btn
            label="Undo last coup"
            disabled={session.coups.length === 0}
            onPress={() => dispatch({ type: "undo" })}
          />
          <Btn label="New shoe" onPress={() => dispatch({ type: "new-shoe" })} />
        </Row>

        <Hint>
          New shoe swaps the cards and leaves the sitting — and the money — running across shoes. To
          close the session and file it under History, use Start over at the top of the History tab.
        </Hint>
      </Card>

      <ShoeRoads />

      <Card title="Place a bet" subtitle="To override the recommendation">
        {/* Player, Tie, Banker in table order and on their own line, with the
            two real bets given the tap target their use deserves — Tie is a
            14.4% house edge and should not be as easy to hit as Banker. */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["player", "tie", "banker"] as const).map((bet) => (
            <Pressable
              key={bet}
              accessibilityRole="button"
              accessibilityState={{ selected: manualBet === bet }}
              onPress={() => setBetOverride(bet)}
              style={[
                s.chip,
                bet === "tie" ? { flex: 0 } : { flex: 1 },
                { alignItems: "center", paddingVertical: 12 },
                manualBet === bet && { borderColor: p.accent, backgroundColor: `${p.accent}22` },
              ]}
            >
              <Text
                style={[
                  s.chipText,
                  bet !== "tie" && { fontSize: 16, fontWeight: "700" },
                  manualBet === bet && { color: p.accent },
                ]}
              >
                {betLabel(bet)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Row>
          {(["playerPair", "bankerPair", "eitherPair", "big", "small"] as const).map((bet) => (
            <Chip
              key={bet}
              label={betLabel(bet)}
              active={manualBet === bet}
              onPress={() => setBetOverride(bet)}
            />
          ))}
        </Row>
        {/* The amount gets the line to itself: four percentage buttons
            beside it was too crowded to read the number being edited. */}
        <Text style={[local.stepperValue, { fontSize: 26, paddingVertical: 2 }]}>
          {money.format(manualAmount)}
        </Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {(
            [
              ["−50%", 0.5],
              ["−20%", 0.8],
              ["+20%", 1.2],
              ["+50%", 1.5],
            ] as const
          ).map(([label, factor]) => (
            <Btn key={label} label={label} onPress={() => scale(factor)} style={{ flex: 1 }} />
          ))}
        </View>
        <Row>
          <Btn label="Double × 2" onPress={() => scale(2)} />
          <Btn
            label={`Back to ${money.format(suggested)}`}
            disabled={amountOverride === null}
            onPress={() => setAmountOverride(null)}
          />
        </Row>
        {advice.valuations ? (
          <Hint>
            {betLabel(manualBet)} costs {formatPercent(advice.valuations[manualBet].houseEdge)} of
            every unit staked — about{" "}
            {money.format(manualAmount * advice.valuations[manualBet].houseEdge)} on this wager.
          </Hint>
        ) : null}
        <Row>
          <Btn
            label={onTable ? "On the table" : `Place ${money.format(manualAmount)}`}
            variant="primary"
            // Once it is on the table there is nothing left to place; a second
            // press would only stake it again. Take it back to edit.
            disabled={onTable || manualAmount <= 0 || manualAmount > session.bankroll.bankroll}
            onPress={() =>
              dispatch({ type: "place-wager", wager: { bet: manualBet, amount: manualAmount } })
            }
          />
          <Btn
            label="Take it back"
            disabled={!onTable}
            onPress={() => {
              dispatch({ type: "place-wager", wager: null });
              setBetOverride(null);
              setAmountOverride(null);
            }}
          />
        </Row>
      </Card>

      {advice.valuations ? (
        <Card title="What every bet costs" subtitle="Priced against the cards still in the shoe">
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row" }}>
              <Text style={[s.fieldLabel, { flex: 1 }]}>BET</Text>
              <Text style={[s.fieldLabel, { width: 64, textAlign: "right" }]}>WINS</Text>
              <Text style={[s.fieldLabel, { width: 62, textAlign: "right" }]}>ODDS</Text>
              <Text style={[s.fieldLabel, { width: 56, textAlign: "right" }]}>EDGE</Text>
            </View>
            {advice.ranked.map((valuation) => (
              <View
                key={valuation.bet}
                style={[
                  { flexDirection: "row", paddingVertical: 3 },
                  valuation.bet === advice.bet && { backgroundColor: `${p.accent}14` },
                ]}
              >
                <Text style={[local.cell, { flex: 1, color: p.text, fontWeight: "600" }]}>
                  {betLabel(valuation.bet)}
                </Text>
                <Text style={[local.cell, { width: 64, textAlign: "right", color: p.text }]}>
                  {formatPercent(valuation.winProbability)}
                </Text>
                <Text style={[local.cell, { width: 62, textAlign: "right", color: p.muted }]}>
                  {formatOdds(valuation.winProbability)}
                </Text>
                <Text
                  style={[
                    local.cell,
                    {
                      width: 56,
                      textAlign: "right",
                      color: valuation.houseEdge > 0.05 ? p.danger : p.text,
                    },
                  ]}
                >
                  {formatPercent(valuation.houseEdge)}
                </Text>
              </View>
            ))}
          </View>
          <Hint>
            House edge is quoted per unit staked, ties included. It is the fraction of everything
            you put on the table that you should expect to keep losing, and no staking plan changes
            it.
          </Hint>
        </Card>
      ) : null}

      <Card title="This session">
        <Row>
          <Stat label="Coups" value={String(stats.coups)} />
          <Stat label="Wagers" value={String(stats.wagers)} />
          <Stat label="Won / lost" value={`${stats.wins} / ${stats.losses}`} />
          <Stat label="Staked" value={money.format(stats.totalWagered)} />
          <Stat
            label="Net"
            value={money.signed(stats.netProfit)}
            tone={stats.netProfit >= 0 ? "good" : "bad"}
          />
          <Stat
            label="Drawdown"
            value={money.format(stats.maxDrawdown)}
            tone={stats.maxDrawdown > 0 ? "bad" : "muted"}
          />
        </Row>
        <Sparkline values={stats.bankrollCurve} baseline={session.bankroll.startingBankroll} />
        {stats.totalWagered > 0 ? (
          <Hint>
            {describeEdge(stats.actualEdge).ahead
              ? `You are ahead by ${formatPercent(describeEdge(stats.actualEdge).magnitude)} of everything you staked so far.`
              : `You have paid ${formatPercent(describeEdge(stats.actualEdge).magnitude)} of everything you staked so far.`}{" "}
            Over a long enough session that converges on the table's edge; over one session it is
            mostly luck in either direction.
          </Hint>
        ) : null}
      </Card>

      <Card
        title="Track the cards"
        subtitle={`${cardsRemaining(session.shoe)} left · ${formatPercent(penetration(session.shoe), 0)} dealt`}
      >
        <Row>
          {RANKS.map((rank: Rank) => {
            const left = session.shoe.byRank[RANKS.indexOf(rank)] ?? 0;
            const disabled = left === 0 || cardEntry.length >= 6;
            return (
              <Pressable
                key={rank}
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => dispatch({ type: "add-card", rank })}
                style={[
                  local.key,
                  { borderColor: p.border, backgroundColor: p.surface2 },
                  disabled && { opacity: 0.35 },
                ]}
              >
                <Text style={{ color: p.text, fontWeight: "700", fontSize: 14 }}>{rank}</Text>
                <Text style={{ color: p.muted, fontSize: 10 }}>{left}</Text>
              </Pressable>
            );
          })}
        </Row>
        <Row>
          {cardEntry.length === 0 ? (
            <Hint>nothing entered — odds stay at the shoe average</Hint>
          ) : (
            cardEntry.map((rank, index) => (
              <View
                key={`${rank}-${index}`}
                style={[local.entryCard, { backgroundColor: p.accent }]}
              >
                <Text style={{ color: p.accentInk, fontWeight: "700", fontSize: 13 }}>{rank}</Text>
              </View>
            ))
          )}
        </Row>
        <Row>
          <Btn
            label="Backspace"
            disabled={cardEntry.length === 0}
            onPress={() => dispatch({ type: "remove-card" })}
          />
          <Btn
            label="Clear"
            disabled={cardEntry.length === 0}
            onPress={() => dispatch({ type: "clear-cards" })}
          />
        </Row>
        {/* Say why the keypad has gone dead rather than letting it read as
            broken: a coup is at most six cards. */}
        {cardEntry.length >= 6 ? (
          <Hint tone="warn">
            That is the whole coup — six cards is the most one can use (two each, plus at most one
            third card a side). Record the result, or Backspace to correct.
          </Hint>
        ) : null}
        <Hint>
          Cards are applied when you record the result. Entering them is worth a fraction of a
          percent deep into a shoe — it is not what decides whether you are ahead.
        </Hint>
      </Card>
    </View>
  );
}

function useLocalStyles() {
  const p = usePalette();
  return StyleSheet.create({
    bankroll: {
      backgroundColor: p.surface,
      borderColor: p.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 14,
      padding: 14,
      gap: 6,
    },
    bankrollRow: { flexDirection: "row", justifyContent: "space-between" },
    bankrollValue: { color: p.text, fontSize: 22, fontWeight: "700" },
    advice: {
      backgroundColor: p.surface,
      borderColor: p.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 14,
      padding: 16,
      gap: 6,
    },
    kicker: { color: p.muted, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
    adviceBet: { color: p.text, fontSize: 32, fontWeight: "800" },
    adviceAmount: { fontSize: 40, fontWeight: "800" },
    stepperValue: { flex: 1, textAlign: "center", color: p.text, fontSize: 18, fontWeight: "700" },
    cell: { fontSize: 13 },
    key: {
      width: 52,
      minHeight: 48,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: "center",
      justifyContent: "center",
    },
    entryCard: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  });
}
