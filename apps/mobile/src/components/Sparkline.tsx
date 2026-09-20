import { buildSparkline } from "@ba-predict/app-core";
import { View } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import { usePalette } from "../theme";
import { Hint } from "./ui";

/**
 * The bankroll curve.
 *
 * Geometry comes from the same `buildSparkline` the web client uses, so the
 * two draw the identical shape for identical numbers; only the renderer
 * differs (inline SVG there, react-native-svg here).
 */
export default function Sparkline({
  values,
  baseline,
  height = 72,
}: {
  values: readonly number[];
  baseline: number;
  height?: number;
}) {
  const p = usePalette();
  const geometry = buildSparkline(values, { baseline, height });

  if (!geometry) {
    return <Hint>No wagers yet — the curve appears once you have played.</Hint>;
  }

  const stroke = geometry.rising ? p.accent : p.danger;

  return (
    <View style={{ height }}>
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        preserveAspectRatio="none"
      >
        <Line
          x1={0}
          x2={geometry.width}
          y1={geometry.baselineY}
          y2={geometry.baselineY}
          stroke={p.border}
          strokeWidth={1}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
        <Path
          d={geometry.path}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </Svg>
    </View>
  );
}
