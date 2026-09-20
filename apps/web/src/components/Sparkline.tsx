import { buildSparkline } from "@ba-predict/app-core";

/** The bankroll curve. Geometry is shared with mobile; only the markup differs. */
export default function Sparkline({
  values,
  baseline,
  height = 72,
}: {
  values: readonly number[];
  baseline: number;
  height?: number;
}) {
  const geometry = buildSparkline(values, { baseline, height });
  if (!geometry) {
    return <p className="field-hint">No wagers yet — the curve appears once you have played.</p>;
  }

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Bankroll curve, ${geometry.rising ? "up" : "down"} over ${values.length - 1} wagers`}
    >
      <line
        x1={0}
        x2={geometry.width}
        y1={geometry.baselineY}
        y2={geometry.baselineY}
        className="sparkline-baseline"
      />
      <path d={geometry.path} className={geometry.rising ? "sparkline-up" : "sparkline-down"} />
    </svg>
  );
}
