/**
 * Money formatting, shared by both clients.
 *
 * It lives here rather than in each client's `lib/format.ts` for the reason
 * every other shared rule does: two copies of a formatter drift, and a screen
 * that renders "RM 1,000.00" in the bankroll and "1000.00" in the advice text
 * beneath it looks broken even though both numbers are right.
 */

export interface CurrencyOption {
  /** ISO 4217 code, or PLAIN for unlabelled numbers. */
  code: string;
  label: string;
}

/** Sentinel for "just show the number", which is the old behaviour. */
export const PLAIN_CURRENCY = "PLAIN";

export const DEFAULT_CURRENCY = PLAIN_CURRENCY;

export const CURRENCIES: readonly CurrencyOption[] = [
  { code: PLAIN_CURRENCY, label: "None" },
  { code: "USD", label: "USD $" },
  { code: "EUR", label: "EUR €" },
  { code: "GBP", label: "GBP £" },
  { code: "MYR", label: "MYR RM" },
  { code: "SGD", label: "SGD S$" },
  { code: "CNY", label: "CNY ¥" },
  { code: "HKD", label: "HKD HK$" },
  { code: "TWD", label: "TWD NT$" },
  { code: "JPY", label: "JPY ¥" },
  { code: "KRW", label: "KRW ₩" },
  { code: "AUD", label: "AUD A$" },
  { code: "THB", label: "THB ฿" },
  { code: "PHP", label: "PHP ₱" },
];

export interface MoneyFormatter {
  code: string;
  /** "RM 1,000.00" */
  format(value: number): string;
  /** "+RM 1,000.00" / "−RM 1,000.00", with an explicit sign either way. */
  signed(value: number): string;
  /** The number alone, no currency mark. For tight columns. */
  plain(value: number): string;
}

// Intl formatters are not cheap to construct and these are called once per
// rendered amount, so each currency's pair is built once and reused.
const cache = new Map<string, MoneyFormatter>();

/** The currency mark Intl would render for a code, or null if it cannot. */
function currencyMark(code: string, display: "narrowSymbol" | "symbol"): string | null {
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      currencyDisplay: display,
    }).formatToParts(0);
    return parts.find((part) => part.type === "currency")?.value ?? null;
  } catch {
    return null;
  }
}

let ambiguous: Set<string> | null = null;

/**
 * Codes whose narrow symbol is shared with another currency we offer.
 *
 * `narrowSymbol` is the nicer rendering — "RM" beats "MYR" — but on most
 * English locales it collapses USD, SGD, HKD, TWD and AUD all to a bare "$".
 * A bankroll that cannot say which dollar it is in is worse than a slightly
 * clunkier mark, so those fall back to `symbol` (which gives "HK$", "NT$",
 * "A$", "SGD") while the unambiguous ones keep their narrow form.
 *
 * Computed from the runtime's own locale, because which symbols collide
 * depends on it.
 */
function isAmbiguous(code: string): boolean {
  if (!ambiguous) {
    const seen = new Map<string, string[]>();
    for (const option of CURRENCIES) {
      if (option.code === PLAIN_CURRENCY) continue;
      const mark = currencyMark(option.code, "narrowSymbol");
      if (!mark) continue;
      const bucket = seen.get(mark);
      if (bucket) bucket.push(option.code);
      else seen.set(mark, [option.code]);
    }
    ambiguous = new Set<string>();
    for (const [, codes] of seen) {
      if (codes.length > 1) for (const collided of codes) ambiguous.add(collided);
    }
  }
  return ambiguous.has(code);
}

function build(code: string): MoneyFormatter {
  const plainFormat = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  let currencyFormat: Intl.NumberFormat | null = null;
  if (code !== PLAIN_CURRENCY) {
    const display = isAmbiguous(code) ? "symbol" : "narrowSymbol";
    try {
      currencyFormat = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: code,
        currencyDisplay: display,
      });
    } catch {
      // An unknown code, or a runtime whose ICU lacks this display mode.
      // Either way an unlabelled number beats throwing while painting a
      // bankroll.
      try {
        currencyFormat = new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: code,
        });
      } catch {
        currencyFormat = null;
      }
    }
  }

  const format = (value: number) =>
    currencyFormat ? currencyFormat.format(value) : plainFormat.format(value);

  return {
    code,
    format,
    // Formats the magnitude and prefixes the sign, so a gain reads "+" rather
    // than relying on the locale's own (absent) positive marker.
    signed: (value: number) => {
      const sign = value > 0 ? "+" : value < 0 ? "−" : "";
      return `${sign}${format(Math.abs(value))}`;
    },
    plain: (value: number) => plainFormat.format(value),
  };
}

export function createMoneyFormatter(code: string): MoneyFormatter {
  const key = code || PLAIN_CURRENCY;
  const cached = cache.get(key);
  if (cached) return cached;
  const formatter = build(key);
  cache.set(key, formatter);
  return formatter;
}
