import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { apiGet, type Candle, type OhlcvResp } from "@/lib/api";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

interface Props {
  symbol: string;
  height?: number;
  /** Default 1h. */
  defaultTimeframe?: Timeframe;
  /** Default 80. */
  limit?: number;
  /** Üst başlık (sembol + son fiyat) göster */
  showHeader?: boolean;
}

const REFETCH: Record<Timeframe, number> = {
  "1m": 5_000,
  "5m": 15_000,
  "15m": 30_000,
  "1h": 60_000,
  "4h": 120_000,
  "1d": 300_000,
};

export default function CandlestickChart({
  symbol,
  height = 240,
  defaultTimeframe = "1h",
  limit = 80,
  showHeader = true,
}: Props) {
  const colors = useColors();
  const [tf, setTf] = useState<Timeframe>(defaultTimeframe);

  const { data, isLoading } = useQuery<OhlcvResp>({
    queryKey: ["chart", symbol, tf, limit],
    queryFn: () =>
      apiGet<OhlcvResp>(
        `/markets/ohlcv?symbol=${encodeURIComponent(symbol)}&timeframe=${tf}&limit=${limit}`,
      ),
    refetchInterval: REFETCH[tf],
    staleTime: REFETCH[tf] / 2,
  });

  const candles = data?.candles ?? [];
  const last = candles[candles.length - 1];
  const first = candles[0];
  const change = last && first ? ((last.close - first.open) / first.open) * 100 : 0;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {showHeader && (
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.symbol, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {symbol}
            </Text>
            {last && (
              <Text style={[styles.price, { color: change >= 0 ? "#00FFB2" : "#FF4D6D", fontFamily: "Inter_700Bold" }]}>
                {fmtPrice(last.close)}
                <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium" }}>
                  {"  "}{change >= 0 ? "+" : ""}{change.toFixed(2)}%
                </Text>
              </Text>
            )}
          </View>
          <View style={styles.tfRow}>
            {TIMEFRAMES.map((t) => {
              const active = t === tf;
              return (
                <Pressable
                  key={t}
                  onPress={() => setTf(t)}
                  style={[
                    styles.tfBtn,
                    {
                      backgroundColor: active ? "#00FFB218" : "transparent",
                      borderColor: active ? "#00FFB255" : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tfTxt,
                      {
                        color: active ? "#00FFB2" : colors.mutedForeground,
                        fontFamily: active ? "Inter_700Bold" : "Inter_500Medium",
                      },
                    ]}
                  >
                    {t}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View style={{ height }}>
        {isLoading || candles.length < 2 ? (
          <View style={styles.loading}>
            <Text style={[styles.loadingTxt, { color: colors.mutedForeground }]}>Grafik yükleniyor…</Text>
          </View>
        ) : (
          <CandlesSvg candles={candles} height={height} colors={colors} />
        )}
      </View>
    </View>
  );
}

function CandlesSvg({
  candles,
  height,
  colors,
}: {
  candles: Candle[];
  height: number;
  colors: { mutedForeground: string; border: string };
}) {
  const [width, setWidth] = useState(0);

  const chart = useMemo(() => {
    if (width < 10) return null;
    const padTop = 12;
    const padBottom = 28; // volume area
    const volH = 28;
    const priceH = height - padTop - padBottom;

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const vols = candles.map((c) => c.volume);
    const max = Math.max(...highs);
    const min = Math.min(...lows);
    const span = Math.max(max - min, max * 0.0001);
    const maxVol = Math.max(...vols, 1);

    const slot = width / candles.length;
    const cw = Math.max(slot * 0.7, 1.2);

    const yPrice = (p: number) =>
      padTop + ((max - p) / span) * priceH;
    const yVol = (v: number) =>
      padTop + priceH + 4 + (1 - v / maxVol) * (volH - 4);

    return { padTop, padBottom, priceH, volH, max, min, span, slot, cw, yPrice, yVol };
  }, [candles, width, height]);

  if (!chart) {
    return (
      <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} />
    );
  }

  // Y-axis labels: top, mid, bottom
  const labels = [
    { y: chart.padTop, val: chart.max },
    { y: chart.padTop + chart.priceH / 2, val: (chart.max + chart.min) / 2 },
    { y: chart.padTop + chart.priceH, val: chart.min },
  ];

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Svg width={width} height={height}>
        {/* Horizontal grid lines */}
        <G>
          {labels.map((l, i) => (
            <Line
              key={i}
              x1={0}
              x2={width - 50}
              y1={l.y}
              y2={l.y}
              stroke={colors.border}
              strokeWidth={0.5}
              strokeDasharray="2,3"
            />
          ))}
        </G>

        {/* Candles */}
        <G>
          {candles.map((c, i) => {
            const x = i * chart.slot + chart.slot / 2;
            const isUp = c.close >= c.open;
            const color = isUp ? "#00FFB2" : "#FF4D6D";
            const yOpen = chart.yPrice(c.open);
            const yClose = chart.yPrice(c.close);
            const yHigh = chart.yPrice(c.high);
            const yLow = chart.yPrice(c.low);
            const bodyTop = Math.min(yOpen, yClose);
            const bodyH = Math.max(Math.abs(yClose - yOpen), 1);

            return (
              <G key={c.time + "_" + i}>
                {/* Wick */}
                <Line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} strokeWidth={1} />
                {/* Body */}
                <Rect
                  x={x - chart.cw / 2}
                  y={bodyTop}
                  width={chart.cw}
                  height={bodyH}
                  fill={color}
                  rx={0.5}
                />
                {/* Volume */}
                <Rect
                  x={x - chart.cw / 2}
                  y={chart.yVol(c.volume)}
                  width={chart.cw}
                  height={chart.padTop + chart.priceH + chart.volH - chart.yVol(c.volume)}
                  fill={color}
                  opacity={0.35}
                />
              </G>
            );
          })}
        </G>

        {/* Y labels (right edge) */}
        <G>
          {labels.map((l, i) => (
            <SvgText
              key={"lb" + i}
              x={width - 4}
              y={l.y + 3}
              fontSize={9}
              textAnchor="end"
              fill={colors.mutedForeground}
              fontFamily="Inter_500Medium"
            >
              {fmtPrice(l.val)}
            </SvgText>
          ))}
        </G>
      </Svg>
    </View>
  );
}

function fmtPrice(p: number): string {
  if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  symbol: { fontSize: 13, letterSpacing: 0.5 },
  price: { fontSize: 18, marginTop: 2 },
  tfRow: { flexDirection: "row", gap: 4 },
  tfBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  tfTxt: { fontSize: 10 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingTxt: { fontSize: 12, fontFamily: "Inter_500Medium" },
});
