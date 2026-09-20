import {
  askRoads,
  derivedMarkLabel,
  layoutBigRoad,
  layoutDerivedRoad,
  type DerivedMark,
  type RoadSet,
} from "@ba-predict/engine";
import { useMemo } from "react";
import { Card } from "./Primitives";

const ROWS = 6;

function GridShell({
  columns,
  children,
  label,
}: {
  columns: number;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="road-scroll">
      <div
        className="road-grid"
        role="img"
        aria-label={label}
        style={{
          gridTemplateColumns: `repeat(${Math.max(columns, 1)}, var(--road-cell))`,
          gridTemplateRows: `repeat(${ROWS}, var(--road-cell))`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function BeadPlate({ roads }: { roads: RoadSet }) {
  const columns = Math.max(1, Math.ceil(roads.beadPlate.length / ROWS));
  return (
    <GridShell columns={columns} label="Bead plate">
      {roads.beadPlate.map((outcome, index) => (
        <span
          key={index}
          className={`bead bead-${outcome}`}
          style={{
            gridRow: (index % ROWS) + 1,
            gridColumn: Math.floor(index / ROWS) + 1,
          }}
        >
          {outcome === "player" ? "P" : outcome === "banker" ? "B" : "T"}
        </span>
      ))}
    </GridShell>
  );
}

export function BigRoad({ roads }: { roads: RoadSet }) {
  const layout = useMemo(() => layoutBigRoad(roads.bigRoad, ROWS), [roads.bigRoad]);
  return (
    <GridShell columns={layout.columns} label="Big road">
      {layout.placements.map((placement, index) => (
        <span
          key={index}
          className={`big-mark big-${placement.cell.outcome}`}
          style={{ gridRow: placement.row + 1, gridColumn: placement.column + 1 }}
        >
          {placement.cell.ties > 0 ? (
            <span className="tie-slash" aria-hidden="true">
              {placement.cell.ties > 1 ? placement.cell.ties : ""}
            </span>
          ) : null}
        </span>
      ))}
    </GridShell>
  );
}

/**
 * Each derived road has its own mark, and they are not interchangeable.
 *
 * A casino board draws big eye boy as a hollow circle, small road as a solid
 * one, and cockroach pig as a slash. Drawing all three as rings made the app
 * disagree with the board a player is reading it against, which is the one
 * thing this screen must not do.
 */
export type DerivedShape = "ring" | "solid" | "slash";

export function DerivedRoad({
  marks,
  label,
  shape,
}: {
  marks: readonly DerivedMark[];
  label: string;
  shape: DerivedShape;
}) {
  const layout = useMemo(() => layoutDerivedRoad(marks, ROWS), [marks]);
  const columns = Math.max(1, Math.ceil(marks.length / ROWS));
  return (
    <GridShell columns={columns} label={label}>
      {layout.map((entry, index) => (
        <span
          key={index}
          className={`derived derived-${shape} derived-${entry.mark}`}
          style={{ gridRow: entry.row + 1, gridColumn: entry.column + 1 }}
        />
      ))}
    </GridShell>
  );
}

/**
 * "Asking the road" — the mark each next result would produce.
 *
 * Reproduced because every live scoreboard offers it and its absence would be
 * conspicuous. Labelled for what it is: a statement about the pattern a result
 * would draw, not about which result is coming.
 */
/**
 * One cell of "Ask the road": the mark, and what it says in words.
 *
 * The word is the point. Colour alone cannot distinguish "both results draw
 * the same mark" — a real and common answer — from a broken render, and it is
 * also the only part of this cell a colour-blind reader can use.
 */
function AskMark({ mark, shape }: { mark: DerivedMark | undefined; shape: DerivedShape }) {
  if (!mark) return <span className="muted">—</span>;
  return (
    <span className="ask-mark">
      <span className={`derived derived-${shape} derived-${mark}`} aria-hidden="true" />
      <span className="ask-mark-label">{derivedMarkLabel(mark)}</span>
    </span>
  );
}

export function AskTheRoad({ roads }: { roads: RoadSet }) {
  const ask = useMemo(() => askRoads(roads), [roads]);
  const rows: { label: string; shape: DerivedShape; player: readonly DerivedMark[]; banker: readonly DerivedMark[] }[] = [
    { label: "Big eye boy", shape: "ring", player: ask.player.bigEyeBoy, banker: ask.banker.bigEyeBoy },
    { label: "Small road", shape: "solid", player: ask.player.smallRoad, banker: ask.banker.smallRoad },
    { label: "Cockroach pig", shape: "slash", player: ask.player.cockroachPig, banker: ask.banker.cockroachPig },
  ];

  return (
    <Card
      title="Ask the road"
      subtitle="The mark each result would draw next"
    >
      <table className="ask-table">
        <thead>
          <tr>
            <th scope="col">Road</th>
            <th scope="col">If Player</th>
            <th scope="col">If Banker</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const player = row.player[0];
            const banker = row.banker[0];
            // The two columns agree about 40% of the time, which is a real
            // answer and not a rendering fault — but two identical marks
            // side by side are indistinguishable from one, so the row says
            // so rather than leaving the reader to wonder.
            const agree = player !== undefined && player === banker;
            return (
              <tr key={row.label}>
                <th scope="row">
                  {row.label}
                  {agree ? <span className="row-note row-note-muted">same either way</span> : null}
                </th>
                <td>
                  <AskMark mark={player} shape={row.shape} />
                </td>
                <td>
                  <AskMark mark={banker} shape={row.shape} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="field-hint">
        This describes the shape the next result would make on the board. It carries no
        information about which result that will be — the cards do not read the scoreboard.
      </p>
      <p className="field-hint">
        A row reading the same on both sides is the real answer, not a glitch. The two results
        land in different places on the big road — one extends the current column, the other
        starts a new one — so each is measured against a different column, and two different
        comparisons often reach the same verdict.
      </p>
    </Card>
  );
}
