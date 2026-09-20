import { StatusBar } from "expo-status-bar";
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";
// SafeAreaView from the context package, not from react-native: only this one
// takes `edges`, and the bottom edge is handled by the tab bar's own padding.
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { Screen } from "@ba-predict/app-core";
import HistoryScreen from "./src/screens/HistoryScreen";
import RoadsScreen from "./src/screens/RoadsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import SimulatorScreen from "./src/screens/SimulatorScreen";
import TableScreen from "./src/screens/TableScreen";
import { AppProvider, useAppState, useDispatch } from "./src/state/store";
import { usePalette } from "./src/theme";

const TABS: { id: Screen; label: string; glyph: string }[] = [
  { id: "table", label: "Table", glyph: "◆" },
  { id: "roads", label: "Roads", glyph: "▦" },
  { id: "simulator", label: "Simulate", glyph: "∿" },
  { id: "history", label: "History", glyph: "◷" },
  { id: "settings", label: "Settings", glyph: "⚙" },
];

function Shell() {
  const p = usePalette();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { screen } = useAppState();
  const dispatch = useDispatch();

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: p.bg },
    header: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: p.border,
    },
    title: { color: p.text, fontSize: 17, fontWeight: "700" },
    tagline: { color: p.muted, fontSize: 12, marginTop: 2 },
    content: { padding: 16, paddingBottom: 32, gap: 12 },
    tabbar: {
      flexDirection: "row",
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: p.border,
      backgroundColor: p.bg,
      paddingTop: 6,
      paddingBottom: Math.max(insets.bottom, 6),
    },
    tab: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10, gap: 2 },
    tabActive: { backgroundColor: `${p.accent}1f` },
    tabGlyph: { fontSize: 16 },
    tabLabel: { fontSize: 11, fontWeight: "600" },
  });

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      <View style={styles.header}>
        <Text style={styles.title}>ba_predict</Text>
        <Text style={styles.tagline}>Baccarat odds, honestly</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {screen === "table" ? <TableScreen /> : null}
        {screen === "roads" ? <RoadsScreen /> : null}
        {screen === "simulator" ? <SimulatorScreen /> : null}
        {screen === "history" ? <HistoryScreen /> : null}
        {screen === "settings" ? <SettingsScreen /> : null}
      </ScrollView>

      <View style={styles.tabbar}>
        {TABS.map((tab) => {
          const active = screen === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => dispatch({ type: "set-screen", screen: tab.id })}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabGlyph, { color: active ? p.accent : p.muted }]}>
                {tab.glyph}
              </Text>
              <Text style={[styles.tabLabel, { color: active ? p.accent : p.muted }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
    </SafeAreaProvider>
  );
}
