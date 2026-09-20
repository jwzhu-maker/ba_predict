import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The staking-plan tables must not push their last column off a phone.
 *
 * This has now shipped twice. Both tables list a staking plan against three
 * numeric columns, the longest plan names are "Grand Martingale" and
 * "Reverse D'Alembert", and `.odds-table` sets `white-space: nowrap` on every
 * cell — so the table's min-content width exceeds the card at every phone
 * width. `.table-scroll` hides the excess behind a sideways scroll with no
 * affordance, and what disappears is the RIGHTMOST column: "Per unit", the
 * one the prose under both tables tells you to read.
 *
 * Measured before the fix: 386px of table in a 266-336px holder at 320/360/
 * 390px viewports. `.odds-table-plans` wraps the text columns and pins the
 * figures, which brings it to 258-328px and inside the holder at all three.
 *
 * This lives in app-core rather than apps/web because apps/web has no test
 * runner, and adding one for this would mean a new dev dependency. It is a
 * convention check, not a layout measurement — it cannot see a browser — so
 * it pins BOTH ends: every plan table asks for the modifier, and the
 * stylesheet still defines it with the rules that do the work. A real
 * overflow check needs a browser; the honest scope of this test is "the fix
 * is still wired up".
 */

const webSrc = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../apps/web/src");
const read = (relative: string) => readFileSync(resolve(webSrc, relative), "utf8");

/** Components whose table lists one row per staking plan. */
const PLAN_TABLES = ["components/StrategyRecord.tsx", "components/ShoeReplay.tsx"];

describe("staking-plan tables fit a phone", () => {
  it.each(PLAN_TABLES)("%s asks for the fluid plan layout", (file) => {
    const source = read(file);
    const tables = source.match(/<table className="[^"]*"/g) ?? [];
    expect(tables.length).toBeGreaterThan(0);
    for (const tag of tables) {
      expect(tag).toContain("odds-table-plans");
    }
  });

  it("every plan table renders a Per unit column, which is the one that gets cut", () => {
    for (const file of PLAN_TABLES) {
      expect(read(file)).toContain("Per unit");
    }
  });

  it("the stylesheet still defines the modifier, and still does the wrapping", () => {
    const css = read("styles.css");
    expect(css).toContain(".odds-table-plans");

    // The row header and the column headers must be allowed to wrap...
    const wrapping = css.match(
      /\.odds-table-plans thead th,\s*\.odds-table-plans tbody th\s*\{[^}]*\}/,
    );
    expect(wrapping?.[0]).toMatch(/white-space:\s*normal/);

    // ...while the figures beside them must not, or a column breaks mid-number.
    const figures = css.match(/\.odds-table-plans tbody td\s*\{[^}]*\}/);
    expect(figures?.[0]).toMatch(/white-space:\s*nowrap/);
  });

  it("the base table rule the modifier overrides is still nowrap", () => {
    // If this ever stops being true the modifier is dead weight rather than a
    // fix, and the test above would go on passing while nothing was wrong.
    const css = read("styles.css");
    const base = css.match(
      /\.odds-table th,\s*\.odds-table td,\s*\.ask-table th,\s*\.ask-table td\s*\{[^}]*\}/,
    );
    expect(base?.[0]).toMatch(/white-space:\s*nowrap/);
  });
});
