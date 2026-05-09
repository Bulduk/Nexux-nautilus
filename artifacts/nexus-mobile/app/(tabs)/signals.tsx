import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { FlashList } = require("@shopify/flash-list") as { FlashList: React.ComponentType<any> };
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useScreenInsets } from "@/hooks/useTabBarHeight";
import { apiGet, type Signal } from "@/lib/api";
import AgentChatSheet from "@/components/AgentChatSheet";
import CandlestickChart from "@/components/CandlestickChart";
import { SignalCardSkeleton } from "@/components/SkeletonLoader";

const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"];

const GRADE_COLORS: Record<string, string> = {
  A: "#00FFB2",
  B: "#adc9eb",
  C: "#f59e0b",
  D: "#FF4D6D",
};

function SignalCard({ signal, expanded, onToggle }: { signal: Signal; expanded: boolean; onToggle: () => void }) {
  const colors = useColors();
  const gradeColor = GRADE_COLORS[signal.trace.grade] ?? "#8e9192";
  const isLong = signal.direction === "LONG";

  return (
    <Pressable
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onToggle}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <View style={styles.badges}>
            <View style={[styles.gradeBadge, { backgroundColor: `${gradeColor}22`, borderColor: `${gradeColor}55` }]}>
              <Text style={[styles.gradeText, { color: gradeColor, fontFamily: "Inter_700Bold" }]}>
                {signal.trace.grade} · {signal.trace.confluence}/5
              </Text>
            </View>
            <View style={[styles.dirBadge, { backgroundColor: isLong ? "#00FFB222" : "#FF4D6D22" }]}>
              <Text style={[styles.dirText, { color: isLong ? "#00FFB2" : "#FF4D6D", fontFamily: "Inter_700Bold" }]}>
                {signal.direction}
              </Text>
            </View>
          </View>
          <View style={styles.symbolRow}>
            <Text style={[styles.symbolText, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{signal.symbol}</Text>
            <Text style={[styles.sourceText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}> · {signal.source}</Text>
          </View>
          <Text style={[styles.reasonText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={1}>
            {signal.reason}
          </Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={[styles.confText, { color: signal.confidence > 80 ? "#00FFB2" : colors.warning, fontFamily: "Inter_700Bold" }]}>
            {signal.confidence}%
          </Text>
          <Text style={[styles.lev, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{signal.suggested_leverage}x</Text>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
        </View>
      </View>

      <View style={styles.priceRow}>
        <View style={styles.priceItem}>
          <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Entry</Text>
          <Text style={[styles.priceVal, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>${signal.entry.toFixed(2)}</Text>
        </View>
        <View style={styles.priceItem}>
          <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>SL</Text>
          <Text style={[styles.priceVal, { color: "#FF4D6D", fontFamily: "Inter_600SemiBold" }]}>${signal.stop_loss.toFixed(2)}</Text>
        </View>
        <View style={styles.priceItem}>
          <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>TP</Text>
          <Text style={[styles.priceVal, { color: "#00FFB2", fontFamily: "Inter_600SemiBold" }]}>${signal.take_profit.toFixed(2)}</Text>
        </View>
        <View style={styles.priceItem}>
          <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>RR</Text>
          <Text style={[styles.priceVal, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{signal.rr}</Text>
        </View>
      </View>

      {expanded && (
        <View style={[styles.traceBox, { backgroundColor: colors.muted, borderTopColor: colors.border }]}>
          {[
            ["WHY ENTRY", signal.trace.why_entry],
            ["WHY SIZE", signal.trace.why_size],
            ["WHY STOP", signal.trace.why_stop],
            ["WHY LEVERAGE", signal.trace.why_leverage],
          ].map(([label, txt]) => (
            <View key={label} style={styles.traceItem}>
              <Text style={[styles.traceLabel, { color: "#00FFB2", fontFamily: "Inter_600SemiBold" }]}>{label}</Text>
              <Text style={[styles.traceTxt, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{txt}</Text>
            </View>
          ))}
          <View style={styles.factorsGrid}>
            {Object.entries(signal.trace.factors).slice(0, 8).map(([k, v]) => (
              <View key={k} style={[styles.factorChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.factorKey, { color: colors.mutedForeground }]}>{k}</Text>
                <Text style={[styles.factorVal, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                  {typeof v === "number" ? v.toFixed(2) : String(v)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </Pressable>
  );
}

export default function SignalsScreen() {
  const colors = useColors();
  const insets = useScreenInsets();
  const qc = useQueryClient();
  const [selectedSymbol, setSelectedSymbol] = useState("BTC/USDT");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [chartExpanded, setChartExpanded] = useState(true);

  const { data: signal, isLoading } = useQuery<Signal>({
    queryKey: ["signal", selectedSymbol],
    queryFn: () => apiGet<Signal>(`/signals/snapshot?symbol=${encodeURIComponent(selectedSymbol)}`),
    refetchInterval: 8000,
    staleTime: 5000,
    retry: 1,
  });

  const signals = signal?.type === "signal" ? [signal] : [];

  const onRefresh = async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ["signal", selectedSymbol] });
    setRefreshing(false);
  };

  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Signal Engine</Text>
        <View style={styles.liveRow}>
          <Pressable onPress={() => setChartExpanded((v) => !v)} hitSlop={8} style={styles.chartToggle}>
            <Feather name={chartExpanded ? "bar-chart-2" : "bar-chart"} size={14} color={chartExpanded ? "#00FFB2" : colors.mutedForeground} />
          </Pressable>
          <View style={styles.liveDot} />
          <Text style={[styles.liveText, { color: "#00FFB2", fontFamily: "Inter_500Medium" }]}>LIVE</Text>
        </View>
      </View>

      <View style={[styles.symbolBar, { borderBottomColor: colors.border }]}>
        {SYMBOLS.map((sym) => {
          const active = sym === selectedSymbol;
          const base = sym.replace("/USDT", "");
          return (
            <Pressable
              key={sym}
              onPress={() => setSelectedSymbol(sym)}
              style={[styles.symBtn, active && { backgroundColor: "#00FFB218", borderColor: "#00FFB255" }, !active && { borderColor: "transparent" }]}
            >
              <Text style={[styles.symText, { color: active ? "#00FFB2" : colors.mutedForeground, fontFamily: active ? "Inter_700Bold" : "Inter_400Regular" }]}>
                {base}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {chartExpanded && (
        <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
          <CandlestickChart symbol={selectedSymbol} height={220} defaultTimeframe="1h" limit={80} />
        </View>
      )}

      {isLoading ? (
        <View style={[styles.list, { gap: 10 }]}>
          <SignalCardSkeleton />
          <SignalCardSkeleton />
        </View>
      ) : (
        <FlashList
          data={signals}
          keyExtractor={(item: Signal) => item.timestamp + item.symbol}
          estimatedItemSize={160}
          renderItem={({ item }: { item: Signal }) => (
            <SignalCard
              signal={item}
              expanded={!!expanded[item.timestamp + item.symbol]}
              onToggle={() => toggle(item.timestamp + item.symbol)}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: insets.chatSheetClearance } as any}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          onRefresh={onRefresh}
          refreshing={refreshing}
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <Feather name="radio" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                Sinyal bulunamadı
              </Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Yeniden denemek için aşağı çek
              </Text>
            </View>
          )}
        />
      )}

      <AgentChatSheet
        pageId="signals"
        pageContext="Signals sayfası — BTC/ETH/SOL/BNB sinyal taraması, RSI/EMA/MACD analizi"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 22 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  chartToggle: { padding: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#00FFB2" },
  liveText: { fontSize: 11, letterSpacing: 1 },
  symbolBar: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  symBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  symText: { fontSize: 12, letterSpacing: 0.5 },
  list: { padding: 12 },
  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  cardTop: { flexDirection: "row", padding: 14, gap: 8 },
  cardLeft: { flex: 1, gap: 6 },
  badges: { flexDirection: "row", gap: 6 },
  gradeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  gradeText: { fontSize: 10, letterSpacing: 0.5 },
  dirBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  dirText: { fontSize: 10, letterSpacing: 0.5 },
  symbolRow: { flexDirection: "row", alignItems: "baseline" },
  symbolText: { fontSize: 16 },
  sourceText: { fontSize: 12 },
  reasonText: { fontSize: 12 },
  cardRight: { alignItems: "flex-end", gap: 4 },
  confText: { fontSize: 18 },
  lev: { fontSize: 11 },
  priceRow: { flexDirection: "row", paddingHorizontal: 14, paddingBottom: 12, gap: 12 },
  priceItem: { flex: 1 },
  priceLabel: { fontSize: 9, letterSpacing: 0.5, fontFamily: "Inter_500Medium" },
  priceVal: { fontSize: 12, marginTop: 2 },
  traceBox: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  traceItem: { gap: 2 },
  traceLabel: { fontSize: 9, letterSpacing: 1 },
  traceTxt: { fontSize: 12, lineHeight: 18 },
  factorsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  factorChip: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  factorKey: { fontSize: 8, fontFamily: "Inter_400Regular" },
  factorVal: { fontSize: 11, marginTop: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 16 },
  emptySub: { fontSize: 13, textAlign: "center" },
});
