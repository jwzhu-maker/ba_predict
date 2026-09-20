import {
  askRoads,
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

export function DerivedRoad({ marks, label }: { marks: readonly DerivedMark[]; label: string }) {
  const layout = useMemo(() => layoutDerivedRoad(marks, ROWS), [marks]);
  const columns = Math.max(1, Math.ceil(marks.length / ROWS));
  return (
    <GridShell columns={columns} label={label}>
      {layout.map((entry, index) => (
        <span
          key={index}
          className={`derived derived-${entry.mark}`}
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
export function AskTheRoad({ roads }: { roads: RoadSet }) {
  const ask = useMemo(() => askRoads(roads), [roads]);
  const rows = [
    { label: "Big eye boy", player: ask.player.bigEyeBoy, banker: ask.banker.bigEyeBoy },
    { label: "Small road", player: ask.player.smallRoad, banker: ask.banker.smallRoad },
    { label: "Cockroach pig", player: ask.player.cockroachPig, banker: ask.banker.cockroachPig },
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
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>
                {row.player[0] ? (
                  <span className={`derived derived-${row.player[0]}`} aria-label={row.player[0]} />
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                {row.banker[0] ? (
                  <span className={`derived derived-${row.banker[0]}`} aria-label={row.banker[0]} />
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="field-hint">
        This describes the shape the next result would make on the board. It carries no
        information about which result that will be — the cards do not read the scoreboard.
      </p>
    </Card>
  );
}
