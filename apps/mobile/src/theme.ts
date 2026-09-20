import { useColorScheme } from "react-native";

export interface Palette {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentInk: string;
  player: string;
  banker: string;
  tie: string;
  warn: string;
  danger: string;
}

const dark: Palette = {
  bg: "#0b1220",
  surface: "#131c2e",
  surface2: "#1a2438",
  border: "#243149",
  text: "#e8eefc",
  muted: "#8fa0c0",
  accent: "#34d399",
  accentInk: "#052e22",
  player: "#60a5fa",
  banker: "#f87171",
  tie: "#4ade80",
  warn: "#fbbf24",
  danger: "#f87171",
};

const light: Palette = {
  bg: "#f2f5fb",
  surface: "#ffffff",
  surface2: "#eef2f9",
  border: "#d7dfec",
  text: "#131c2e",
  muted: "#5b6b86",
  accent: "#059669",
  accentInk: "#ffffff",
  player: "#2563eb",
  banker: "#dc2626",
  tie: "#16a34a",
  warn: "#b45309",
  danger: "#dc2626",
};

export function usePalette(): Palette {
  return useColorScheme() === "light" ? light : dark;
}

export const RADIUS = 14;
export const ROAD_CELL = 22;
