import {
  askRoads,
  layoutBigRoad,
  layoutDerivedRoad,
  type BigRoadCell,
  type DerivedMark,
  type Outcome,
  type RoadSet,
} from "@ba-predict/engine";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ROAD_CELL, usePalette, type Palette } from "../theme";
import { Card, Hint } from "./ui";

const ROWS = 6;

function useRoadStyles(p: Palette) {
  return useMemo(
    () =>
      StyleSheet.create({
        board: {
          backgroundColor: p.surface2,
          borderRadius: 8,
          padding: 4,
          gap: 2,
        },
        row: { flexDirection: "row", gap: 2 },
        cell: {
          width: ROAD_CELL,
          height: ROAD_CELL,
          borderRadius: ROAD_CELL / 2,
          alignItems: "center",
          justifyContent: "center",
        },
        beadText: { fontSize: 11, fontWeight: "800" },
        ring: { borderWidth: 2.5, backgroundColor: "transparent" },
        tie: {
          position: "absolute",
          width: 2.5,
          height: ROAD_CELL * 0.8,
          backgroundColor: p.tie,
          transform: [{ rotate: "45deg" }],
          borderRadius: 2,
        },
        small: {
          width: ROAD_CELL - 6,
          height: ROAD_CELL - 6,
          borderRadius: (ROAD_CELL - 6) / 2,
          margin: 3,
          borderWidth: 2.5,
        },
      }),
    [p],
  );
}

/** Render a fixed-height board as rows, inside a horizontal scroller. */
function Board({ rows }: { rows: React.ReactNode[][] }) {
  const p = usePalette();
  const s = useRoadStyles(p);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={s.board}>
        {rows.map((cells, row) => (
          <View key={row} style={s.row}>
            {cells}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function emptyGrid(columns: number): React.ReactNode[][] {
  return Array.from({ length: ROWS }, () => Array.from({ length: Math.max(columns, 1) }, () => null));
}

export function BeadPlate({ roads }: { roads: RoadSet }) {
  const p = usePalette();
  const s = useRoadStyles(p);
  const columns = Math.max(1, Math.ceil(roads.beadPlate.length / ROWS));
  const grid = emptyGrid(columns);

  const colourFor = (outcome: Outcome) =>
    outcome === "player" ? p.player : outcome === "banker" ? p.banker : p.tie;

  roads.beadPlate.forEach((outcome, index) => {
    const row = index % ROWS;
    const column = Math.floor(index / ROWS);
    const rowCells = grid[row];
    if (!rowCells) return;
    rowCells[column] = (
      <View key={`${row}-${column}`} style={[s.cell, { backgroundColor: colourFor(outcome) }]}>
        <Text style={[s.beadText, { color: p.bg }]}>
          {outcome === "player" ? "P" : outcome === "banker" ? "B" : "T"}
        </Text>
      </View>
    );
  });

  fill(grid, s.cell);
  return <Board rows={grid} />;
}

export function BigRoad({ roads }: { roads: RoadSet }) {
  const p = usePalette();
  const s = useRoadStyles(p);
  const layout = useMemo(() => layoutBigRoad(roads.bigRoad, ROWS), [roads.bigRoad]);
  const grid = emptyGrid(layout.columns);

  const mark = (cell: BigRoadCell, key: string) => (
    <View
      key={key}
      style={[
        s.cell,
        s.ring,
        { borderColor: cell.outcome === "player" ? p.player : p.banker },
      ]}
    >
      {cell.ties > 0 ? <View style={s.tie} /> : null}
    </View>
  );

  for (const placement of layout.placements) {
    const rowCells = grid[placement.row];
    if (!rowCells) continue;
    rowCells[placement.column] = mark(placement.cell, `${placement.row}-${placement.column}`);
  }

  fill(grid, s.cell);
  return <Board rows={grid} />;
}

export function DerivedRoad({ marks }: { marks: readonly DerivedMark[] }) {
  const p = usePalette();
  const s = useRoadStyles(p);
  const layout = useMemo(() => layoutDerivedRoad(marks, ROWS), [marks]);
  const columns = Math.max(1, Math.ceil(marks.length / ROWS));
  const grid = emptyGrid(columns);

  for (const entry of layout) {
    const rowCells = grid[entry.row];
    if (!rowCells) continue;
    rowCells[entry.column] = (
      <View
        key={`${entry.row}-${entry.column}`}
        style={[s.small, { borderColor: entry.mark === "red" ? p.banker : p.player }]}
      />
    );
  }

  fill(grid, s.cell);
  return <Board rows={grid} />;
}

/** Pad the empty squares so every row keeps the board's width. */
function fill(grid: React.ReactNode[][], cellStyle: object) {
  grid.forEach((cells, row) => {
    cells.forEach((cell, column) => {
      if (cell === null) cells[column] = <View key={`e-${row}-${column}`} style={cellStyle} />;
    });
  });
}

export function AskTheRoad({ roads }: { roads: RoadSet }) {
  const p = usePalette();
  const s = useRoadStyles(p);
  const ask = useMemo(() => askRoads(roads), [roads]);

  const rows = [
    { label: "Big eye boy", player: ask.player.bigEyeBoy[0], banker: ask.banker.bigEyeBoy[0] },
    { label: "Small road", player: ask.player.smallRoad[0], banker: ask.banker.smallRoad[0] },
    { label: "Cockroach pig", player: ask.player.cockroachPig[0], banker: ask.banker.cockroachPig[0] },
  ];

  const dot = (value: DerivedMark | undefined) =>
    value ? (
      <View style={[s.small, { borderColor: value === "red" ? p.banker : p.player }]} />
    ) : (
      <Text style={{ color: p.muted }}>—</Text>
    );

  return (
    <Card title="Ask the road" subtitle="The mark each result would draw next">
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row" }}>
          <Text style={{ flex: 1, color: p.muted, fontSize: 11, fontWeight: "700" }}>ROAD</Text>
          <Text style={{ width: 70, color: p.muted, fontSize: 11, fontWeight: "700" }}>
            IF PLAYER
          </Text>
          <Text style={{ width: 70, color: p.muted, fontSize: 11, fontWeight: "700" }}>
            IF BANKER
          </Text>
        </View>
        {rows.map((row) => (
          <View key={row.label} style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ flex: 1, color: p.text, fontSize: 13 }}>{row.label}</Text>
            <View style={{ width: 70 }}>{dot(row.player)}</View>
            <View style={{ width: 70 }}>{dot(row.banker)}</View>
          </View>
        ))}
      </View>
      <Hint>
        This describes the shape the next result would make on the board. It carries no
        information about which result that will be — the cards do not read the scoreboard.
      </Hint>
    </Card>
  );
}
