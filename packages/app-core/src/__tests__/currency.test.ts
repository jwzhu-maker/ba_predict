import { describe, expect, it } from "vitest";
import { CURRENCIES, PLAIN_CURRENCY, createMoneyFormatter } from "../currency";
import { buildSparkline } from "../sparkline";

describe("money formatting", () => {
  it("shows a bare number when no currency is chosen", () => {
    const money = createMoneyFormatter(PLAIN_CURRENCY);
    expect(money.format(1000)).toBe("1,000.00");
    expect(money.format(0.5)).toBe("0.50");
  });

  it("labels a real currency", () => {
    const usd = createMoneyFormatter("USD");
    expect(usd.format(1000)).toMatch(/\$/);
    expect(usd.format(1000)).toMatch(/1,000/);
  });

  it("respects a currency's own decimal convention", () => {
    // Yen has no minor unit; forcing two decimals would be wrong.
    const jpy = createMoneyFormatter("JPY");
    expect(jpy.format(1000)).not.toMatch(/\.00/);
  });

  it("signs a gain and a loss explicitly", () => {
    const money = createMoneyFormatter(PLAIN_CURRENCY);
    expect(money.signed(10)).toBe("+10.00");
    expect(money.signed(-10)).toBe("−10.00");
    expect(money.signed(0)).toBe("0.00");
  });

  it("offers an unlabelled rendering for tight columns", () => {
    const myr = createMoneyFormatter("MYR");
    expect(myr.plain(1234.5)).toBe("1,234.50");
    expect(myr.plain(1234.5)).not.toMatch(/RM/);
  });

  it("falls back to a plain number rather than throwing on a bad code", () => {
    const bogus = createMoneyFormatter("NOTACURRENCY");
    expect(bogus.format(12)).toBe("12.00");
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
