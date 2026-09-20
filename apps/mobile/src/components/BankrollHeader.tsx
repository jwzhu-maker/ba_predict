import { Text, View } from "react-native";
import { useAppState, useMoney } from "../state/store";
import { usePalette } from "../theme";

/**
 * Bankroll and session result, pinned to the top-right of every screen.
 *
 * It sits in the app shell's header, which is outside the ScrollView, so it
 * survives a scroll to the roads or the odds table. Those are all below the
 * fold, and the moment a player starts reading one of them the only two
 * figures that matter used to leave the screen — not noticing is how a
 * session gets away from someone.
 *
 * The detail (the staking plan, the wager count) stays on the Table tab.
 * This is the glance; that is the look.
 */
export default function BankrollHeader() {
  const { session } = useAppState();
  const money = useMoney();
  const p = usePalette();
  const profit = session.bankroll.bankroll - session.bankroll.startingBankroll;

  const cell = { alignItems: "flex-end" as const };
  const label = { color: p.muted, fontSize: 9, fontWeight: "700" as const, letterSpacing: 0.7 };
  const value = { fontSize: 15, fontWeight: "800" as const, lineHeight: 19 };

  return (
    <View style={{ flexDirection: "row", gap: 14 }}>
      <View style={cell}>
        <Text style={label}>BANKROLL</Text>
        <Text style={[value, { color: p.text }]} numberOfLines={1}>
          {money.format(session.bankroll.bankroll)}
        </Text>
      </View>
      <View style={cell}>
        <Text style={label}>SESSION</Text>
        <Text
          style={[value, { color: profit >= 0 ? p.accent : p.danger }]}
          numberOfLines={1}
        >
          {money.signed(profit)}
        </Text>
      </View>
    </View>
  );
}
