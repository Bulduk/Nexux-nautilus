import React, { useMemo } from "react";
import { View, ViewStyle } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";

interface SparklineChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showGradient?: boolean;
  strokeWidth?: number;
  style?: ViewStyle;
}

export default function SparklineChart({
  data,
  width = 80,
  height = 32,
  color,
  showGradient = true,
  strokeWidth = 1.5,
  style,
}: SparklineChartProps) {
  const { linePath, areaPath, autoColor } = useMemo(() => {
    if (!data || data.length < 2) return { linePath: "", areaPath: "", autoColor: "#8A97AD" };

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pad = 2;
    const w = width;
    const h = height - pad * 2;

    const toX = (i: number) => (i / (data.length - 1)) * w;
    const toY = (v: number) => pad + h - ((v - min) / range) * h;

    let line = `M ${toX(0)} ${toY(data[0])}`;
    for (let i = 1; i < data.length; i++) {
      const x0 = toX(i - 1), y0 = toY(data[i - 1]);
      const x1 = toX(i), y1 = toY(data[i]);
      const cpx = (x0 + x1) / 2;
      line += ` C ${cpx} ${y0}, ${cpx} ${y1}, ${x1} ${y1}`;
    }

    const area = line + ` L ${toX(data.length - 1)} ${height} L ${toX(0)} ${height} Z`;

    const trend = data[data.length - 1] >= data[0];
    const ac = trend ? "#00FFB2" : "#FF4D6D";

    return { linePath: line, areaPath: area, autoColor: ac };
  }, [data, width, height]);

  const finalColor = color ?? autoColor;
  const gradId = `sg_${Math.random().toString(36).slice(2, 7)}`;

  if (!data || data.length < 2) {
    return <View style={[{ width, height }, style]} />;
  }

  return (
    <View style={[{ width, height }, style]}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={finalColor} stopOpacity="0.3" />
            <Stop offset="1" stopColor={finalColor} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {showGradient && (
          <Path d={areaPath} fill={`url(#${gradId})`} />
        )}
        <Path
          d={linePath}
          stroke={finalColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

export function MiniBarChart({
  data,
  width = 64,
  height = 24,
  color = "#00C9A7",
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const bars = useMemo(() => {
    if (!data.length) return [];
    const max = Math.max(...data, 1);
    const barW = Math.floor((width - (data.length - 1) * 1) / data.length);
    return data.map((v, i) => ({
      x: i * (barW + 1),
      y: height - Math.max(2, (v / max) * height),
      w: barW,
      h: Math.max(2, (v / max) * height),
    }));
  }, [data, width, height]);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {bars.map((b, i) => (
          <Path
            key={i}
            d={`M ${b.x} ${b.y} L ${b.x} ${height} L ${b.x + b.w} ${height} L ${b.x + b.w} ${b.y} Z`}
            fill={`${color}88`}
          />
        ))}
      </Svg>
    </View>
  );
}
