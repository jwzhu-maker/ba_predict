const money = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compact = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatMoney(value: number): string {
  return money.format(value);
}

export function formatSigned(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${money.format(Math.abs(value))}`;
}

export function formatPercent(value: number, digits = 2): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatUnits(value: number): string {
  return compact.format(value);
}

export function formatOdds(probability: number): string {
  if (probability <= 0) return "never";
  if (probability >= 1) return "always";
  return `1 in ${(1 / probability).toFixed(probability < 0.02 ? 0 : 1)}`;
}
