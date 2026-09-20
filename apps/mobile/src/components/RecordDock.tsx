import { callToWager } from "@ba-predict/app-core";
import { betLabel, type Outcome } from "@ba-predict/engine";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppState, useDispatch, useMoney, useTableCall } from "../state/store";
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
 */
export default function RecordDock() {
  const { session, pendingWager, cardEntry } = useAppState();
  const dispatch = useDispatch();
  const money = useMoney();
  const p = usePalette();
  const local = useLocalStyles(p);

  // What the Bet card shows and what a recorded result settles against, so
  // the two can never disagree about the money that moved.
  const call = useTableCall();
  const settling = pendingWager ?? callToWager(call);

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
  };

  return (
    <View style={local.dock}>
      <Text style={local.line} numberOfLines={1}>
        {settling
          ? `${money.format(settling.amount)} on ${betLabel(settling.bet)}`
          : "Nothing staked — road only"}
        {cardEntry.length > 0 ? ` · ${cardEntry.length} cards tracked` : ""}
      </Text>

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
    line: { color: p.muted, fontSize: 12, fontWeight: "600" },
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
