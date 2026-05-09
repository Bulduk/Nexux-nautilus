import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { apiGet, type OrderBookResp } from "@/lib/api";

interface Props {
  symbol: string;
  depth?: number;
  /** ms */
  refetchInterval?: number;
}

export default function OrderBook({ symbol, depth = 12, refetchInterval = 3000 }: Props) {
  const colors = useColors();

  const { data, isLoading } = useQuery<OrderBookResp>({
    queryKey: ["orderbook", symbol, depth],
    queryFn: () =>
      apiGet<OrderBookResp>(
        `/markets/orderbook?symbol=${encodeURIComponent(symbol)}&depth=${depth}`,
      ),
    refetchInterval,
    staleTime: refetchInterval / 2,
  });

  const view = useMemo(() => {
    const bids = (data?.bids ?? []).slice(0, depth);
    const asks = (data?.asks ?? []).slice(0, depth);

    const allSizes = [...bids, ...asks].map(([, size]) => size);
    const maxSize = Math.max(...allSizes, 1);
    const bestBid = bids[0]?.[0];
    const bestAsk = asks[0]?.[0];
    const spread =
      bestBid !== undefined && bestAsk !== undefined ? bestAsk - bestBid : 0;
    const spreadPct =
      bestBid !== undefined && bestAsk !== undefined
        ? (spread / ((bestAsk + bestBid) / 2)) * 100
        : 0;
    const mid =
      bestBid !== undefined && bestAsk !== undefined ? (bestAsk + bestBid) / 2 : 0;

    return { bids, asks, maxSize, spread, spreadPct, mid };
  }, [data, depth]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Order Book
        </Text>
        <Text style={[styles.spread, { color: colors.mutedForeground }]}>
          {view.mid > 0 ? `Spread ${fmt(view.spread)} (${view.spreadPct.toFixed(3)}%)` : "—"}
        </Text>
      </View>

      <View style={[styles.colHead, { borderBottomColor: colors.border }]}>
        <Text style={[styles.colHeadTxt, styles.priceCol, { color: colors.mutedForeground }]}>Price</Text>
        <Text style={[styles.colHeadTxt, styles.sizeCol, { color: colors.mutedForeground, textAlign: "right" }]}>Size</Text>
        <Text style={[styles.colHeadTxt, styles.totCol, { color: colors.mutedForeground, textAlign: "right" }]}>Total</Text>
      </View>

      {isLoading && !data ? (
        <View style={styles.loading}>
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 12 }}>
            Yükleniyor…
          </Text>
        </View>
      ) : (
        <>
          {/* Asks (reversed so worst price at top, best near mid) */}
          <View>
            {[...view.asks].reverse().map(([price, size], i) => {
              const cum = view.asks.slice(0, view.asks.length - i).reduce((s, [, sz]) => s + sz, 0);
              const pct = (size / view.maxSize) * 100;
              return (
                <Row
                  key={"a" + i}
                  price={price}
                  size={size}
                  total={cum}
                  pct={pct}
                  side="ask"
                  color={colors.foreground}
                />
              );
            })}
          </View>

          {/* Mid price */}
          <View style={[styles.midRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Text style={[styles.midPrice, { color: "#00FFB2", fontFamily: "Inter_700Bold" }]}>
              {fmt(view.mid)}
            </Text>
            <Text style={[styles.midLabel, { color: colors.mutedForeground }]}>MID</Text>
          </View>

          {/* Bids */}
          <View>
            {view.bids.map(([price, size], i) => {
              const cum = view.bids.slice(0, i + 1).reduce((s, [, sz]) => s + sz, 0);
              const pct = (size / view.maxSize) * 100;
              return (
                <Row
                  key={"b" + i}
                  price={price}
                  size={size}
                  total={cum}
                  pct={pct}
                  side="bid"
                  color={colors.foreground}
                />
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

function Row({
  price,
  size,
  total,
  pct,
  side,
  color,
}: {
  price: number;
  size: number;
  total: number;
  pct: number;
  side: "bid" | "ask";
  color: string;
}) {
  const accent = side === "bid" ? "#00FFB2" : "#FF4D6D";
  return (
    <View style={styles.row}>
      <View
        style={[
          styles.depthBar,
          {
            width: `${pct}%`,
            backgroundColor: side === "bid" ? "#00FFB214" : "#FF4D6D14",
            [side === "bid" ? "left" : "right"]: 0,
          } as object,
        ]}
      />
      <Text style={[styles.cell, styles.priceCol, { color: accent, fontFamily: "Inter_600SemiBold" }]}>
        {fmt(price)}
      </Text>
      <Text style={[styles.cell, styles.sizeCol, { color, fontFamily: "Inter_500Medium", textAlign: "right" }]}>
        {fmtSize(size)}
      </Text>
      <Text style={[styles.cell, styles.totCol, { color, fontFamily: "Inter_400Regular", textAlign: "right" }]}>
        {fmtSize(total)}
      </Text>
    </View>
  );
}

function fmt(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}
function fmtSize(s: number): string {
  if (s >= 1000) return `${(s / 1000).toFixed(2)}K`;
  if (s >= 1) return s.toFixed(2);
  return s.toFixed(4);
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
  title: { fontSize: 13 },
  spread: { fontSize: 10, fontFamily: "Inter_500Medium" },
  colHead: { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  colHeadTxt: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  priceCol: { flex: 1.2 },
  sizeCol: { flex: 1 },
  totCol: { flex: 1 },
  row: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 3,
    position: "relative",
    overflow: "hidden",
  },
  cell: { fontSize: 11 },
  depthBar: {
    position: "absolute",
    top: 0,
    bottom: 0,
  },
  midRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  midPrice: { fontSize: 14 },
  midLabel: { fontSize: 9, letterSpacing: 1, fontFamily: "Inter_600SemiBold" },
  loading: { padding: 24, alignItems: "center" },
});
