import { describe, expect, it } from "vitest";
import { CURRENCIES, PLAIN_CURRENCY, createMoneyFormatter } from "../currency";
import { describeEdge } from "../edge";
import { buildSparkline } from "../sparkline";

/**
 * Every formatter here renders in the RUNTIME's own locale, which is the
 * point of using Intl at all — so nothing below may pin an English glyph.
 *
 * `1,000.00` is `1'000.00` under de-CH and `1.000,00` under de-DE, and USD
 * is `$`, `US$` or `USD` depending on where the device is. A test that pins
 * one of those passes on the machine it was written on and fails on a real
 * user's phone, which is exactly what happened.
 */
const localeNumber = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

describe("money formatting", () => {
  it("shows a bare number when no currency is chosen", () => {
    // Two decimals and no currency mark, in whatever the local convention
    // for grouping and decimals happens to be.
    const money = createMoneyFormatter(PLAIN_CURRENCY);
    expect(money.format(1000)).toBe(localeNumber.format(1000));
    expect(money.format(0.5)).toBe(localeNumber.format(0.5));
    // No letters and no currency symbol. Spelling that as an ASCII digit
    // class instead fails under ar-EG, whose digits are ١٢٣ — and `\d` in a
    // JS regex is ASCII only.
    expect(money.format(1000)).not.toMatch(/\p{L}|\p{Sc}/u);
  });

  it("labels a real currency", () => {
    const usd = createMoneyFormatter("USD");
    // Some mark, and the number still in it. Which mark is the locale's
    // business — "$" in en-US, "US$" in en-GB, "USD" in ms-MY.
    expect(usd.format(1000)).toMatch(/\$|USD/);
    expect(usd.format(1000)).toContain(localeNumber.format(1000));
  });

  it("respects a currency's own decimal convention", () => {
    // Yen has no minor unit; forcing two decimals would be wrong. Looking
    // for ".00" reads de-DE's GROUPING dot in "1.000 ¥" as a decimal one,
    // so the property is tested directly: a currency with no minor unit
    // renders 1000 and 1000.40 identically, and one with a minor unit does
    // not.
    const jpy = createMoneyFormatter("JPY");
    expect(jpy.format(1000)).toBe(jpy.format(1000.4));
    const usd = createMoneyFormatter("USD");
    expect(usd.format(1000)).not.toBe(usd.format(1000.4));
  });

  it("signs a gain and a loss explicitly", () => {
    // The sign is ours — a real minus, not a hyphen — and is prepended to
    // the locale's own rendering rather than replacing it.
    const money = createMoneyFormatter(PLAIN_CURRENCY);
    expect(money.signed(10)).toBe(`+${localeNumber.format(10)}`);
    expect(money.signed(-10)).toBe(`−${localeNumber.format(10)}`);
    expect(money.signed(0)).toBe(localeNumber.format(0));
  });

  it("offers an unlabelled rendering for tight columns", () => {
    const myr = createMoneyFormatter("MYR");
    expect(myr.plain(1234.5)).toBe(localeNumber.format(1234.5));
    expect(myr.plain(1234.5)).not.toMatch(/RM|MYR/);
  });

  it("falls back to a plain number rather than throwing on a bad code", () => {
    const bogus = createMoneyFormatter("NOTACURRENCY");
    expect(bogus.format(12)).toBe(localeNumber.format(12));
  });

  it("returns the same formatter for the same code", () => {
    expect(createMoneyFormatter("EUR")).toBe(createMoneyFormatter("EUR"));
  });

  it("can format every currency it offers", () => {
    for (const option of CURRENCIES) {
      expect(() => createMoneyFormatter(option.code).format(1234.56)).not.toThrow();
    }
  });
});

describe("sparkline geometry", () => {
  it("declines to draw fewer than two points", () => {
    expect(buildSparkline([], { baseline: 0 })).toBeNull();
    expect(buildSparkline([100], { baseline: 100 })).toBeNull();
  });

  it("spans the full width and height", () => {
    const geometry = buildSparkline([0, 100], { baseline: 0, width: 200, height: 50 })!;
    expect(geometry.points[0]).toEqual({ x: 0, y: 50 });
    expect(geometry.points[1]).toEqual({ x: 200, y: 0 });
    expect(geometry.path).toBe("M0.00,50.00 L200.00,0.00");
  });

  it("puts the baseline where the opening balance sits", () => {
    const geometry = buildSparkline([50, 150], { baseline: 100, width: 100, height: 100 })!;
    // Range is 50..150, so 100 lands exactly halfway up.
    expect(geometry.baselineY).toBeCloseTo(50, 10);
  });

  it("knows whether the session is up or down", () => {
    expect(buildSparkline([100, 120], { baseline: 100 })!.rising).toBe(true);
    expect(buildSparkline([100, 80], { baseline: 100 })!.rising).toBe(false);
    // Exactly break-even counts as not losing.
    expect(buildSparkline([100, 90, 100], { baseline: 100 })!.rising).toBe(true);
  });

  it("does not divide by zero on a flat series", () => {
    const geometry = buildSparkline([100, 100, 100], { baseline: 100, height: 40 })!;
    expect(geometry.points.every((point) => Number.isFinite(point.y))).toBe(true);
    expect(geometry.path).not.toMatch(/NaN/);
  });

  it("keeps every point inside the box", () => {
    const values = [1000, 1200, 800, 950, 1100];
    const geometry = buildSparkline(values, { baseline: 1000, width: 320, height: 72 })!;
    for (const point of geometry.points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(320);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(72);
    }
  });
});

describe("telling the dollars apart", () => {
  /**
   * The currency mark a formatted amount carries, with the number removed.
   *
   * Everything that is not part of a mark goes: digits in any numbering
   * system, spaces of every width, the directionality marks ar-EG inserts,
   * and punctuation (de-CH groups thousands with an apostrophe). What is
   * left is letters and currency symbols, which is exactly what a mark is
   * made of — "$", "US$", "RM", "NT$".
   */
  const markOf = (code: string) =>
    createMoneyFormatter(code)
      .format(1000)
      .replace(/[\p{N}\p{Zs}\p{Cf}\p{P}\s]/gu, "");

  /** What this runtime's own ICU renders for a code, in one display form. */
  const intlMark = (code: string, display: "narrowSymbol" | "symbol") =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      currencyDisplay: display,
    })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? "";

  it("gives every offered currency a distinct mark", () => {
    // `narrowSymbol` alone renders USD, SGD, HKD, TWD and AUD all as a bare
    // "$" on common English locales, so a bankroll cannot say which dollar
    // it is in. Ambiguous codes fall back to `symbol`.
    const seen = new Map<string, string>();
    for (const option of CURRENCIES) {
      if (option.code === PLAIN_CURRENCY) continue;
      const mark = markOf(option.code);
      expect(mark, `${option.code} rendered no currency mark`).not.toBe("");
      const clash = seen.get(mark);
      expect(clash, `${option.code} and ${clash} both render as "${mark}"`).toBeUndefined();
      seen.set(mark, option.code);
    }
  });

  it("keeps the friendlier narrow mark where nothing collides with it", () => {
    // The rule, not one machine's glyphs. Pinning `markOf("USD")` to "$"
    // passed under en-US, where USD's narrow and wide marks are the same
    // string, and failed under en-GB, where the wide one is "US$" — and
    // "US$" is the RIGHT answer there: USD shares its narrow "$" with SGD,
    // HKD, TWD and AUD, which is the whole reason the fallback exists.
    //
    // So: a currency whose narrow mark is unique among the ones on offer
    // must keep it, and never be downgraded to the wider form.
    const narrowCounts = new Map<string, number>();
    for (const option of CURRENCIES) {
      if (option.code === PLAIN_CURRENCY) continue;
      const narrow = intlMark(option.code, "narrowSymbol");
      narrowCounts.set(narrow, (narrowCounts.get(narrow) ?? 0) + 1);
    }

    let unique = 0;
    for (const option of CURRENCIES) {
      if (option.code === PLAIN_CURRENCY) continue;
      const narrow = intlMark(option.code, "narrowSymbol");
      if (narrowCounts.get(narrow) !== 1) continue;
      unique += 1;
      expect(markOf(option.code), `${option.code} was downgraded needlessly`).toBe(narrow);
    }
    // MYR's "RM" and GBP's "£" collide with nothing in any locale, so this
    // loop is never vacuous however the runtime renders the dollars.
    expect(unique).toBeGreaterThanOrEqual(2);
  });

  it("still formats an amount for every currency", () => {
    for (const option of CURRENCIES) {
      // Not pinned to "1,234": a zero-decimal currency like JPY correctly
      // rounds 1234.5 to 1,235, which is the point of using Intl at all.
      const formatted = createMoneyFormatter(option.code).format(1234.5);
      // Either the locale's own two-decimal rendering, or its zero-decimal
      // one for a currency with no minor unit. Matching "1,234" directly
      // assumes an ASCII-digit, comma-grouping locale; de-CH groups with an
      // apostrophe and ar-EG does not use ASCII digits at all.
      const withMinor = localeNumber.format(1234.5);
      const withoutMinor = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
        1234.5,
      );
      expect(
        formatted.includes(withMinor) || formatted.includes(withoutMinor),
        `${option.code} rendered ${formatted}`,
      ).toBe(true);
    }
  });
});

describe("describing a realised edge", () => {
  it("calls a positive edge a cost", () => {
    const described = describeEdge(0.0106);
    expect(described.ahead).toBe(false);
    expect(described.magnitude).toBeCloseTo(0.0106, 10);
    expect(described.noun).toBe("cost");
    expect(described.label).toBe("Cost of play");
  });

  it("calls a negative edge being ahead, and never hands back a negative", () => {
    // -22.08% "cost" is being up 22.08% on turnover. Rendering the raw number
    // under a cost label states the opposite of what happened.
    const described = describeEdge(-0.2208);
    expect(described.ahead).toBe(true);
    expect(described.magnitude).toBeCloseTo(0.2208, 10);
    expect(described.noun).toBe("ahead");
    expect(described.label).toBe("Ahead by");
  });

  it("treats exactly break-even as a cost of zero, not as ahead", () => {
    const described = describeEdge(0);
    expect(described.ahead).toBe(false);
    expect(described.magnitude).toBe(0);
  });

  it("never returns a negative magnitude for any input", () => {
    for (const value of [-5, -0.5, -1e-9, 0, 1e-9, 0.5, 5]) {
      expect(describeEdge(value).magnitude).toBeGreaterThanOrEqual(0);
    }
  });
});
