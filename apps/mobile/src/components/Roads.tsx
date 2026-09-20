import {
  askRoads,
  derivedMarkLabel,
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
        // Cockroach pig is a slash, not a circle: the bar is drawn across an
        // otherwise empty cell.
        slashCell: {
          width: ROAD_CELL - 6,
          height: ROAD_CELL - 6,
          margin: 3,
          alignItems: "center",
          justifyContent: "center",
        },
        slashBar: {
          width: 2.5,
          height: (ROAD_CELL - 6) * 1.18,
          borderRadius: 2,
          transform: [{ rotate: "45deg" }],
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

/**
 * Each derived road has its own mark, and they are not interchangeable.
 *
 * A casino board draws big eye boy as a hollow circle, small road as a solid
 * one, and cockroach pig as a slash. Drawing all three as rings made the app
 * disagree with the board a player reads it against.
 */
export type DerivedShape = "ring" | "solid" | "slash";

export function derivedMarkNode(
  mark: DerivedMark,
  shape: DerivedShape,
  styles: ReturnType<typeof useRoadStyles>,
  palette: Palette,
  key: string,
) {
  const colour = mark === "red" ? palette.banker : palette.player;
  if (shape === "slash") {
    return (
      <View key={key} style={styles.slashCell}>
        <View style={[styles.slashBar, { backgroundColor: colour }]} />
      </View>
    );
  }
  return (
    <View
      key={key}
      style={[
        styles.small,
        shape === "solid"
          ? { borderColor: "transparent", backgroundColor: colour }
          : { borderColor: colour },
      ]}
    />
  );
}

export function DerivedRoad({
  marks,
  shape,
}: {
  marks: readonly DerivedMark[];
  shape: DerivedShape;
}) {
  const p = usePalette();
  const s = useRoadStyles(p);
  const layout = useMemo(() => layoutDerivedRoad(marks, ROWS), [marks]);
  const columns = Math.max(1, Math.ceil(marks.length / ROWS));
  const grid = emptyGrid(columns);

  for (const entry of layout) {
    const rowCells = grid[entry.row];
    if (!rowCells) continue;
    rowCells[entry.column] = derivedMarkNode(
      entry.mark,
      shape,
      s,
      p,
      `${entry.row}-${entry.column}`,
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

  const rows: { label: string; shape: DerivedShape; player?: DerivedMark; banker?: DerivedMark }[] = [
    { label: "Big eye boy", shape: "ring", player: ask.player.bigEyeBoy[0], banker: ask.banker.bigEyeBoy[0] },
    { label: "Small road", shape: "solid", player: ask.player.smallRoad[0], banker: ask.banker.smallRoad[0] },
    { label: "Cockroach pig", shape: "slash", player: ask.player.cockroachPig[0], banker: ask.banker.cockroachPig[0] },
  ];

  /*
   * The mark with its verdict in words underneath. The word is the point:
   * the two columns legitimately show the SAME mark about 40% of the time,
   * and two identical dots side by side are indistinguishable from a broken
   * render. It is also the only part a colour-blind reader can use.
   */
  const dot = (value: DerivedMark | undefined, shape: DerivedShape, key: string) =>
    value ? (
      <View style={{ alignItems: "flex-start", gap: 1 }}>
        {derivedMarkNode(value, shape, s, p, key)}
        <Text style={{ color: p.muted, fontSize: 10, fontWeight: "600" }}>
          {derivedMarkLabel(value)}
        </Text>
      </View>
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
        {rows.map((row) => {
          // Agreement is a real answer, not a rendering fault, so the row
          // says so rather than leaving the reader to wonder.
          const agree = row.player !== undefined && row.player === row.banker;
          return (
            <View key={row.label} style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: p.text, fontSize: 13 }}>{row.label}</Text>
                {agree ? (
                  <Text style={{ color: p.muted, fontSize: 10 }}>same either way</Text>
                ) : null}
              </View>
              <View style={{ width: 70 }}>{dot(row.player, row.shape, `${row.label}-p`)}</View>
              <View style={{ width: 70 }}>{dot(row.banker, row.shape, `${row.label}-b`)}</View>
            </View>
          );
        })}
      </View>
      <Hint>
        This describes the shape the next result would make on the board. It carries no
        information about which result that will be — the cards do not read the scoreboard.
      </Hint>
      <Hint>
        A row reading the same on both sides is the real answer, not a glitch. The two results
        land in different places on the big road — one extends the current column, the other
        starts a new one — so each is measured against a different column, and two different
        comparisons often reach the same verdict.
      </Hint>
    </Card>
  );
}
