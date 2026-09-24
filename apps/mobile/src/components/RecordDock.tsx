import { callToWager } from "@ba-predict/app-core";
import { betLabel, type Outcome } from "@ba-predict/engine";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatUnits } from "../lib/format";
import { revealRoad } from "../lib/reveal-road";
import { tapFeedback } from "../lib/tap-feedback";
import { useAppState, useDispatch, useMoney, useSystemRun, useTableCall } from "../state/store";
import { usePalette, type Palette } from "../theme";
import { Chip } from "./ui";

/**
 * P / B / T, docked above the tab bar on the Table tab.
 *
 * The web client's `RecordDock` carries the full reasoning. In short: these
 * three are pressed once per coup and are the only control used on every
 * single hand, so they must never move and never need scrolling to — and
 * three rounds of reserved-height floors on the cards above them each found
 * another state nobody had driven. Docking removes the question instead of
 * bounding it.
 *
 * Two things about the layout are load-bearing:
 *
 *   - the buttons are the LAST row, so a card-count row for a Big or Small
 *     wager grows the dock upward and the tap targets stay put;
 *   - the per-coup modifiers live here rather than in a card, because they
 *     have to be set BEFORE the result is recorded and a pinned button
 *     whose inputs are two screens away records whatever they were left at.
 *
 * The top row is the next bet — side, amount and how many units that is —
 * because the dock is on screen wherever the page is scrolled and the Bet
 * card is not. Recording a result then scrolls "The road" into view.
 *
 * Undo and Redo share the second line, rows away from P / B / T: close
 * enough to fix a mis-tap where it was made, far enough not to be hit while
 * tapping the next result.
 */
export default function RecordDock() {
  const { session, pendingWager, cardEntry, history, future, tapSound } = useAppState();
  const dispatch = useDispatch();
  const money = useMoney();
  const p = usePalette();
  const local = useLocalStyles(p);

  // What the Bet card shows and what a recorded result settles against, so
  // the two can never disagree about the money that moved.
  const call = useTableCall();
  const settling = pendingWager ?? callToWager(call);
  // What the app is pointing at, staked or not; an unstaked call is still
  // shown, marked as such. See the web dock.
  const nextBet =
    settling ??
    (call.bet !== null && call.amount > 0
      ? { bet: call.bet, amount: call.amount }
      : call.skippedSuggestion
        ? { bet: call.skippedSuggestion.bet, amount: call.skippedSuggestion.amount }
        : null);
  // Units are counted in whatever is setting the stake: a betting system's
  // own base stake while it is the one speaking ("1, 2, 4, 8 units" is how
  // its rule reads), otherwise the unit size from Settings.
  const { run } = useSystemRun();
  // A skipped call keeps the source of what it declined, so skipping a
  // system's bet does not re-count it in the Settings unit.
  const speaking = call.source === "skipped" ? call.skippedSuggestion?.source : call.source;
  const unitSize = speaking === "system" ? run.config.baseStake : session.bankroll.unitSize;
  const units = nextBet && unitSize > 0 ? nextBet.amount / unitSize : null;
  const sideColour =
    nextBet?.bet === "player"
      ? p.player
      : nextBet?.bet === "banker"
        ? p.banker
        : nextBet?.bet === "tie"
          ? p.tie
          : p.text;

  const [playerPair, setPlayerPair] = useState(false);
  const [bankerPair, setBankerPair] = useState(false);
  const [cardCount, setCardCount] = useState<4 | 5 | 6 | null>(null);
  const [bankerWinOnSix, setBankerWinOnSix] = useState(false);

  const needsCardCount = settling?.bet === "big" || settling?.bet === "small";
  /**
   * A property of the TABLE, not of what is being staked, so it is asked on
   * every coup at such a table rather than only while the wager is Banker.
   *
   * A tick is used when this coup settles a Banker wager and is a no-op
   * otherwise: `CoupRecord` has no field for it, so the strategy replay and
   * the system run cannot read it back. That is what the run card's
   * "slightly generous" caveat is about.
   */
  const noCommissionTable = session.rules.bankerSixPayout !== null;

  const record = (outcome: Outcome) => {
    // First, so the buzz lands with the tap rather than after the render.
    tapFeedback(tapSound);
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
    revealRoad();
  };

  return (
    <View style={local.dock}>
      <View style={local.next} accessibilityLiveRegion="polite">
        <Text style={local.label}>NEXT BET</Text>
        {nextBet ? (
          <>
            <Text style={[local.nextSide, { color: sideColour }]}>{betLabel(nextBet.bet)}</Text>
            <Text style={local.nextAmount}>{money.format(nextBet.amount)}</Text>
            {units !== null ? (
              <Text style={local.nextUnits}>
                = {formatUnits(units)} {units === 1 ? "unit" : "units"}
              </Text>
            ) : null}
            {settling ? null : <Text style={local.nextOff}>NOT STAKED</Text>}
          </>
        ) : (
          <Text style={local.nextUnits}>No bet — road only</Text>
        )}
      </View>

      <View style={local.top}>
        <Text style={[local.line, { flex: 1 }]} numberOfLines={1}>
          {!settling && nextBet ? (call.blockedReason ?? "Recording will not stake it") : ""}
          {!settling && nextBet && cardEntry.length > 0 ? " · " : ""}
          {cardEntry.length > 0 ? `${cardEntry.length} cards tracked` : ""}
        </Text>
        {(
          [
            ["↶ Undo last coup", history.length === 0, "undo"],
            ["Redo ↷", future.length === 0, "redo"],
          ] as const
        ).map(([label, disabled, type]) => (
          <Pressable
            key={type}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => dispatch({ type })}
            style={({ pressed }) => [
              local.step,
              disabled && { opacity: 0.4 },
              pressed && !disabled && { opacity: 0.7 },
            ]}
          >
            <Text style={local.stepText}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={local.mods}>
        <Chip label="P pair" active={playerPair} onPress={() => setPlayerPair((v) => !v)} />
        <Chip label="B pair" active={bankerPair} onPress={() => setBankerPair((v) => !v)} />
        {noCommissionTable ? (
          <Chip
            label="B won on 6"
            active={bankerWinOnSix}
            onPress={() => setBankerWinOnSix((v) => !v)}
          />
        ) : null}
      </View>

      {/* Only a hand-placed Big or Small wager can need this, so it is the
          one row that appears in response to something the user did. It is
          above the buttons, so adding it does not move them. */}
      {needsCardCount ? (
        <View style={local.mods}>
          <Text style={local.label}>CARDS DEALT</Text>
          {([4, 5, 6] as const).map((count) => (
            <Chip
              key={count}
              label={String(count)}
              active={cardCount === count}
              onPress={() => setCardCount(count)}
            />
          ))}
        </View>
      ) : null}

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
            <Text style={[local.glyph, { color: colour }]}>{glyph}</Text>
            <Text style={[local.outcomeLabel, { color: colour }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function useLocalStyles(p: Palette) {
  return StyleSheet.create({
    dock: {
      gap: 6,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: p.border,
      backgroundColor: p.surface,
    },
    next: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 8 },
    nextSide: { fontSize: 16, fontWeight: "800" },
    nextAmount: { color: p.text, fontSize: 16, fontWeight: "700" },
    nextUnits: { color: p.muted, fontSize: 13 },
    nextOff: {
      color: p.muted,
      fontSize: 10,
      letterSpacing: 0.5,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      borderRadius: 999,
      paddingHorizontal: 6,
    },
    top: { flexDirection: "row", alignItems: "center", gap: 6 },
    line: { color: p.muted, fontSize: 12, fontWeight: "600" },
    step: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      backgroundColor: p.surface2,
    },
    stepText: { color: p.muted, fontSize: 12, fontWeight: "600" },
    mods: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 6,
    },
    label: { color: p.muted, fontSize: 11, letterSpacing: 0.5 },
    // Shorter than the in-card version: the dock competes with the content
    // for the screen, and a 78px button is more than a thumb needs.
    outcome: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      paddingVertical: 8,
      borderWidth: 1,
      borderRadius: 12,
      minHeight: 56,
    },
    glyph: { fontSize: 22, fontWeight: "800", lineHeight: 24 },
    outcomeLabel: { fontSize: 11, fontWeight: "600" },
  });
}
