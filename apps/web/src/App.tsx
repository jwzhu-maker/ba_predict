import BankrollHeader from "./components/BankrollHeader";
import HistoryScreen from "./screens/HistoryScreen";
import SettingsScreen from "./screens/SettingsScreen";
import SimulatorScreen from "./screens/SimulatorScreen";
import TableScreen from "./screens/TableScreen";
import { useAppState, useDispatch } from "./state/store";
import type { Screen } from "@ba-predict/app-core";

const TABS: { id: Screen; label: string; glyph: string }[] = [
  { id: "table", label: "Table", glyph: "◆" },
  { id: "simulator", label: "Strategies", glyph: "∿" },
  { id: "history", label: "History", glyph: "◷" },
  { id: "settings", label: "Settings", glyph: "⚙" },
];

export default function App() {
  const { screen } = useAppState();
  const dispatch = useDispatch();

  return (
    <div className="app">
      {/*
        Sticky, and carrying the money. What you have and what the sitting
        has cost you are the two numbers that should never be more than a
        glance away — scrolling to the roads or the odds table used to take
        both off screen, which is exactly when a player stops noticing.
      */}
      <header className="app-header">
        <div className="app-title">
          <h1>ba_predict</h1>
          <p>Baccarat odds, honestly</p>
        </div>
        <BankrollHeader />
      </header>

      <main className="app-main">
        {screen === "table" ? <TableScreen /> : null}
        {screen === "simulator" ? <SimulatorScreen /> : null}
        {screen === "history" ? <HistoryScreen /> : null}
        {screen === "settings" ? <SettingsScreen /> : null}
      </main>

      <nav className="tabbar" aria-label="Sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab${screen === tab.id ? " tab-active" : ""}`}
            aria-current={screen === tab.id ? "page" : undefined}
            onClick={() => dispatch({ type: "set-screen", screen: tab.id })}
          >
            <span className="tab-glyph" aria-hidden="true">
              {tab.glyph}
            </span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
