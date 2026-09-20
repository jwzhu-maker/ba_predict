import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A table whose row header is a NAME must not push its last column off a
 * phone.
 *
 * This has shipped three times. `.odds-table` sets `white-space: nowrap` on
 * every cell, so a table whose row headers are long strings has a
 * min-content width larger than a phone, and `width: 100%` cannot shrink
 * below it. `.table-scroll` hides the excess behind a sideways scroll with
 * no affordance, and what disappears is the RIGHTMOST column — which on
 * every one of these tables is the column the screen exists for:
 *
 *   - StrategyRecord / ShoeReplay -> "Per unit", the column whose own prose
 *     calls it "the column worth reading";
 *   - OddsTable -> "House edge", the number this whole app is built around.
 *
 * Measured at 320/360/390px before the fix: the two plan tables wanted 386px
 * in a 266-336px holder at every width, and the odds table overflowed at 320
 * and 360. `.odds-table-fluid` wraps the text columns and pins the figures.
 *
 * This lives in app-core rather than apps/web because apps/web has no test
 * runner, and adding one would mean a new dev dependency. It is a convention
 * check, not a layout measurement — it cannot see a browser — so it pins
 * BOTH ends: every table of this shape asks for the modifier, and the
 * stylesheet still defines it with the rules that do the work. The honest
 * scope is "the fix is still wired up"; a real overflow check needs a
 * browser.
 */

const webSrc = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../apps/web/src");
const read = (relative: string) => readFileSync(resolve(webSrc, relative), "utf8");

/**
 * Tables with a name in the row header and figures beside it, and the last
 * column each one loses first when it overflows.
 */
const NAME_ROW_TABLES = [
  ["components/StrategyRecord.tsx", "Per unit"],
  ["components/ShoeReplay.tsx", "Per unit"],
  ["components/OddsTable.tsx", "House edge"],
  ["components/SystemRun.tsx", "Net"],
] as const;

describe("tables with a name in the row header fit a phone", () => {
  it.each(NAME_ROW_TABLES.map(([file]) => file))("%s asks for the fluid layout", (file) => {
    const tables = read(file).match(/<table className="[^"]*"/g) ?? [];
    expect(tables.length).toBeGreaterThan(0);
    for (const tag of tables) {
      expect(tag).toContain("odds-table-fluid");
    }
  });

  it.each(NAME_ROW_TABLES)("%s still renders its last column, %s", (file, lastColumn) => {
    expect(read(file)).toContain(lastColumn);
  });

  it("the stylesheet still defines the modifier, and still does the wrapping", () => {
    const css = read("styles.css");
    expect(css).toContain(".odds-table-fluid");

    // The row header and the column headers must be allowed to wrap...
    const wrapping = css.match(
      /\.odds-table-fluid thead th,\s*\.odds-table-fluid tbody th\s*\{[^}]*\}/,
    );
    expect(wrapping?.[0]).toMatch(/white-space:\s*normal/);

    // ...while the figures beside them must not, or a column breaks mid-number.
    const figures = css.match(/\.odds-table-fluid tbody td\s*\{[^}]*\}/);
    expect(figures?.[0]).toMatch(/white-space:\s*nowrap/);
  });

  it("the base rule the modifier overrides is still nowrap", () => {
    // If this ever stops being true the modifier is dead weight rather than a
    // fix, and the tests above would go on passing while nothing was wrong.
    const base = read("styles.css").match(
      /\.odds-table th,\s*\.odds-table td,\s*\.ask-table th,\s*\.ask-table td\s*\{[^}]*\}/,
    );
    expect(base?.[0]).toMatch(/white-space:\s*nowrap/);
  });

  it("no table of this shape was added without the modifier", () => {
    // A bare `.odds-table` is the defect's exact signature, so the set of
    // files allowed to carry one is empty: every current table has a name in
    // its row header. A new table that genuinely does not needs a line here.
    const offenders: string[] = [];
    for (const [file] of NAME_ROW_TABLES) {
      if (/className="odds-table"/.test(read(file))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
