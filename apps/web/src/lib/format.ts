/**
 * Non-money formatting.
 *
 * Money now goes through `useMoney()`, which reads the chosen currency from
 * state — a module-level money formatter cannot see that setting, and having
 * one around invites a screen to quietly keep using it.
 */

const compact = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatPercent(value: number, digits = 2): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatUnits(value: number): string {
  return compact.format(value);
}

/** "1 in 11" reads better than "9.5%" for a rare outcome. */
export function formatOdds(probability: number): string {
  if (probability <= 0) return "never";
  if (probability >= 1) return "always";
  return `1 in ${(1 / probability).toFixed(probability < 0.02 ? 0 : 1)}`;
}

const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const dayOnly = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function formatDateTime(epochMs: number): string {
  return dateTime.format(new Date(epochMs));
}

export function formatDay(epochMs: number): string {
  return dayOnly.format(new Date(epochMs));
}

/** "2h 14m", for how long a session ran. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
