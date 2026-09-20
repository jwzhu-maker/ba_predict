import {
  BET_TYPES,
  RANKS,
  betLabel,
  cardsRemaining,
  penetration,
  type BetType,
  type Outcome,
  type Rank,
} from "@ba-predict/engine";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import ShoeRoads from "../components/ShoeRoads";
import SystemNextBet from "../components/SystemNextBet";
import Sparkline from "../components/Sparkline";
import { Btn, Card, Chip, Hint, Notice, Row, Stat, useStyles } from "../components/ui";
import { describeEdge } from "@ba-predict/app-core";
import { formatOdds, formatPercent, formatUnits } from "../lib/format";
import { useAdvice, useAppState, useDispatch, useMoney, useStats } from "../state/store";
import { usePalette } from "../theme";

export default function TableScreen() {
  const p = usePalette();
  const s = useStyles(p);
  const local = useLocalStyles();
  const { session, pendingWager, cardEntry, lastSettlement } = useAppState();
  const dispatch = useDispatch();
  const advice = useAdvice();
  const stats = useStats();
  const money = useMoney();

  const [playerPair, setPlayerPair] = useState(false);
  const [bankerPair, setBankerPair] = useState(false);
  const [cardCount, setCardCount] = useState<4 | 5 | 6 | null>(null);
  const [bankerWinOnSix, setBankerWinOnSix] = useState(false);
  const [manualBet, setManualBet] = useState<BetType>("banker");
  const [manualAmount, setManualAmount] = useState(session.bankroll.tableMin);

  const profit = session.bankroll.bankroll - session.bankroll.startingBankroll;
  const unit = session.bankroll.unitSize || 1;
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

  const adjust = (delta: number) => {
    const next = Math.round((manualAmount + delta * unit) / unit) * unit;
    setManualAmount(Math.min(Math.max(next, 0), session.bankroll.tableMax));
  };

  const onTable =
    pendingWager?.bet === advice.bet && pendingWager?.amount === advice.amount;

  return (
    <View style={{ gap: 12 }}>
      <View style={local.bankroll}>
        <View style={local.bankrollRow}>
          <View>
            <Text style={s.statLabel}>BANKROLL</Text>
            <Text style={local.bankrollValue}>{money.format(session.bankroll.bankroll)}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.statLabel}>SESSION</Text>
            <Text style={[local.bankrollValue, { color: profit >= 0 ? p.accent : p.danger }]}>
              {money.signed(profit)}
            </Text>
          </View>
        </View>
        <Hint>
          Next stake {formatUnits(session.progression.units)}u ·{" "}
          {session.progression.id.replace(/-/g, " ")} · {stats.wagers} wagers
        </Hint>
      </View>

      <View style={local.advice}>
        <Text style={local.kicker}>
          {advice.action === "bet"
            ? "BET"
            : advice.action === "stop"
              ? "STOP"
              : advice.action === "shuffle"
                ? "NEW SHOE"
                : "SIT OUT"}
        </Text>
        {advice.action === "bet" && advice.bet ? (
          <>
            <Text style={local.adviceBet}>{betLabel(advice.bet)}</Text>
            <Text style={[local.adviceAmount, { color: p.accent }]}>
              {money.format(advice.amount)}
            </Text>
            <Hint>
              {formatPercent(advice.valuations![advice.bet].houseEdge)} house edge · costs{" "}
              {money.format(advice.expectedCost)} per coup on average
            </Hint>
            <Btn
              label={onTable ? "On the table" : "Put it on the table"}
              variant="primary"
              disabled={onTable}
              onPress={() =>
                dispatch({
                  type: "place-wager",
                  wager: { bet: advice.bet!, amount: advice.amount },
                })
              }
            />
          </>
        ) : (
          <Text style={[local.adviceBet, { color: p.muted, fontSize: 24 }]}>
            {advice.action === "stop"
              ? "Walk away"
              : advice.action === "shuffle"
                ? "Shoe exhausted"
                : "No stake"}
          </Text>
        )}
        {advice.reasons.map((reason) => (
          <Hint key={reason}>• {reason}</Hint>
        ))}
        {advice.warnings.map((warning) => (
          <Notice key={warning} tone="warn">
            {warning}
          </Notice>
        ))}
      </View>

      <Card
        title="Record the result"
        subtitle={
          pendingWager
            ? `${money.format(pendingWager.amount)} on ${betLabel(pendingWager.bet)}`
            : "No wager on the table — this only updates the road"
        }
      >
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(
            [
              ["player", "P", "Player", p.player],
              ["banker", "B", "Banker", p.banker],
              ["tie", "T", "Tie", p.tie],
            ] as const
          ).map(([outcome, glyph, label, colour]) => (
            <Pressable
              key={outcome}
              accessibilityRole="button"
              onPress={() => record(outcome)}
              style={({ pressed }) => [
                local.outcome,
                { borderColor: `${colour}88`, backgroundColor: p.surface2 },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[local.outcomeGlyph, { color: colour }]}>{glyph}</Text>
              <Text style={[local.outcomeLabel, { color: colour }]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <Row>
          <Chip label="Player pair" active={playerPair} onPress={() => setPlayerPair((v) => !v)} />
          <Chip label="Banker pair" active={bankerPair} onPress={() => setBankerPair((v) => !v)} />
        </Row>

        {needsCardCount ? (
          <View style={{ gap: 6 }}>
            <Text style={s.fieldLabel}>
              CARDS DEALT (NEEDED TO SETTLE {betLabel(pendingWager.bet).toUpperCase()})
            </Text>
            <Row>
              {([4, 5, 6] as const).map((count) => (
                <Chip
                  key={count}
                  label={String(count)}
                  active={cardCount === count}
                  onPress={() => setCardCount(count)}
                />
              ))}
            </Row>
          </View>
        ) : null}

        {needsBankerSix ? (
          <View style={{ gap: 6 }}>
            <Text style={s.fieldLabel}>THIS TABLE PAYS LESS ON A BANKER WIN WITH 6</Text>
            <Row>
              <Chip
                label="Banker won on 6"
                active={bankerWinOnSix}
                onPress={() => setBankerWinOnSix((v) => !v)}
              />
            </Row>
          </View>
        ) : null}

        {lastSettlement?.unsettled ? (
          <Notice tone="warn">{lastSettlement.unsettled}</Notice>
        ) : null}

        <Row>
          <Btn
            label="Undo last coup"
            disabled={session.coups.length === 0}
            onPress={() => dispatch({ type: "undo" })}
          />
          <Btn label="New shoe" onPress={() => dispatch({ type: "new-shoe" })} />
        </Row>
      </Card>

      <SystemNextBet />
      <ShoeRoads />

      <Card title="Place a bet" subtitle="Or override the recommendation">
        <Row>
          {BET_TYPES.map((bet) => (
            <Chip
              key={bet}
              label={betLabel(bet)}
              active={manualBet === bet}
              onPress={() => setManualBet(bet)}
            />
          ))}
        </Row>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Btn label="−5u" onPress={() => adjust(-5)} />
          <Btn label="−1u" onPress={() => adjust(-1)} />
          <Text style={local.stepperValue}>{money.format(manualAmount)}</Text>
          <Btn label="+1u" onPress={() => adjust(1)} />
          <Btn label="+5u" onPress={() => adjust(5)} />
        </View>
        {advice.valuations ? (
          <Hint>
            {betLabel(manualBet)} costs {formatPercent(advice.valuations[manualBet].houseEdge)} of
            every unit staked — about{" "}
            {money.format(manualAmount * advice.valuations[manualBet].houseEdge)} on this wager.
          </Hint>
        ) : null}
        <Row>
          <Btn
            label={`Place ${money.format(manualAmount)}`}
            variant="primary"
            disabled={manualAmount <= 0 || manualAmount > session.bankroll.bankroll}
            onPress={() =>
              dispatch({ type: "place-wager", wager: { bet: manualBet, amount: manualAmount } })
            }
          />
          <Btn
            label="Take it back"
            disabled={!pendingWager}
            onPress={() => dispatch({ type: "place-wager", wager: null })}
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
            you put on the table that you should expect to keep losing, and no staking plan
            changes it.
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
        <Sparkline
          values={stats.bankrollCurve}
          baseline={session.bankroll.startingBankroll}
        />
        {stats.totalWagered > 0 ? (
          <Hint>
            {describeEdge(stats.actualEdge).ahead
              ? `You are ahead by ${formatPercent(describeEdge(stats.actualEdge).magnitude)} of everything you staked so far.`
              : `You have paid ${formatPercent(describeEdge(stats.actualEdge).magnitude)} of everything you staked so far.`}{" "}
            Over a long enough session that converges on the table's edge; over one session it
            is mostly luck in either direction.
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
                style={[local.key, { borderColor: p.border, backgroundColor: p.surface2 }, disabled && { opacity: 0.35 }]}
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
    outcome: {
      flex: 1,
      minHeight: 78,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    outcomeGlyph: { fontSize: 24, fontWeight: "800" },
    outcomeLabel: { fontSize: 12, fontWeight: "600" },
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
