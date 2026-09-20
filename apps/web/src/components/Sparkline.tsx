/** A bankroll curve, drawn as a single inline SVG path. */
export default function Sparkline({
  values,
  baseline,
  height = 72,
}: {
  values: readonly number[];
  baseline: number;
  height?: number;
}) {
  if (values.length < 2) {
    return <p className="field-hint">No wagers yet — the curve appears once you have played.</p>;
  }

  const width = 320;
  const min = Math.min(...values, baseline);
  const max = Math.max(...values, baseline);
  const span = max - min || 1;
  const x = (index: number) => (index / (values.length - 1)) * width;
  const y = (value: number) => height - ((value - min) / span) * height;

  const path = values.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(" ");
  const last = values[values.length - 1] ?? baseline;
  const up = last >= baseline;

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Bankroll curve, ${up ? "up" : "down"} over ${values.length - 1} wagers`}
    >
      <line
        x1={0}
        x2={width}
        y1={y(baseline)}
        y2={y(baseline)}
        className="sparkline-baseline"
      />
      <path d={path} className={up ? "sparkline-up" : "sparkline-down"} />
    </svg>
  );
}
