/**
 * Geometry for the bankroll curve.
 *
 * Only the maths lives here — web draws it into an inline `<svg>` and mobile
 * into `react-native-svg`, but both need the same path for the same numbers,
 * and "the curve looks different on my phone" is not a bug anyone enjoys
 * chasing.
 */

export interface SparklinePoint {
  x: number;
  y: number;
}

export interface SparklineGeometry {
  /** SVG path data for the curve. */
  path: string;
  /** Y coordinate of the session's opening balance. */
  baselineY: number;
  width: number;
  height: number;
  /** True when the last value is at or above the opening balance. */
  rising: boolean;
  points: SparklinePoint[];
}

export interface SparklineOptions {
  width?: number;
  height?: number;
  /** The opening balance, drawn as a reference line. */
  baseline: number;
}

/**
 * Build the curve, or null when there is nothing to draw.
 *
 * Null rather than an empty path: one data point has no shape, and a caller
 * that renders "no wagers yet" says something more useful than a flat line
 * that looks like a break-even session.
 */
export function buildSparkline(
  values: readonly number[],
  options: SparklineOptions,
): SparklineGeometry | null {
  const width = options.width ?? 320;
  const height = options.height ?? 72;
  if (values.length < 2) return null;

  const min = Math.min(...values, options.baseline);
  const max = Math.max(...values, options.baseline);
  // A dead-flat series would divide by zero; draw it down the middle instead.
  const span = max - min || 1;

  const toY = (value: number) => height - ((value - min) / span) * height;
  const points = values.map((value, index) => ({
    x: (index / (values.length - 1)) * width,
    y: toY(value),
  }));

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");

  const last = values[values.length - 1] ?? options.baseline;

  return {
    path,
    baselineY: toY(options.baseline),
    width,
    height,
    rising: last >= options.baseline,
    points,
  };
}
