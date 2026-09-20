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

function build(code: string): MoneyFormatter {
  const plainFormat = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  let currencyFormat: Intl.NumberFormat | null = null;
  if (code !== PLAIN_CURRENCY) {
    try {
      currencyFormat = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: code,
        currencyDisplay: "narrowSymbol",
      });
    } catch {
      // An unknown code, or a runtime whose ICU lacks narrowSymbol. Either way
      // an unlabelled number beats throwing while painting a bankroll.
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
