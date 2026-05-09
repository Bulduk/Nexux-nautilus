import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { apiGet, apiPost } from "@/lib/api";
import AgentChatSheet from "@/components/AgentChatSheet";

const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"];
const TIMEFRAMES = ["15m", "1h", "4h", "1d"];
const CANDLE_LIMITS = [100, 200, 300, 500];

interface Strategy {
  id: string;
  name: string;
  description: string;
  params: Record<string, unknown>;
  builtin?: boolean;
}

interface AgentSignal {
  agent: string;
  role: string;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  reason: string;
  entry: number;
  stopLoss: number;
  takeProfit: number;
}

interface SwarmResult {
  symbol: string;
  price: number;
  agents: AgentSignal[];
  consensus: { direction: string; confidence: number; votes: number; total: number };
}

interface BacktestResult {
  result: {
    strategyName: string;
    symbol: string;
    totalTrades: number;
    winRate: number;
    totalPnlPct: number;
    sharpeRatio: number;
    maxDrawdownPct: number;
    profitFactor: number;
    expectancy: number;
  };
}

const AGENT_META: Record<string, { emoji: string; color: string }> = {
  mirofish:  { emoji: "🐟", color: "#38BDF8" },
  betafish:  { emoji: "⚡", color: "#F59E0B" },
  onyx:      { emoji: "🔮", color: "#A78BFA" },
  openclaw:  { emoji: "🦅", color: "#00FFB2" },
};

function DirectionBadge({ dir }: { dir: string }) {
  const bg =
    dir === "LONG" ? "rgba(0,193,118,0.18)" :
    dir === "SHORT" ? "rgba(240,74,90,0.18)" :
    "rgba(255,255,255,0.08)";
  const col =
    dir === "LONG" ? "#00C176" :
    dir === "SHORT" ? "#F04A5A" :
    "#8A97AD";
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: col }]}>{dir}</Text>
    </View>
  );
}

export default function StrategyScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<"library" | "swarm" | "backtest">("library");
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [timeframe, setTimeframe] = useState("1h");
  const [limit, setLimit] = useState(200);
  const [selectedStrategy, setSelectedStrategy] = useState("");
  const [swarmResult, setSwarmResult] = useState<SwarmResult | null>(null);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);

  const { data: strategies, isLoading: strLoading, refetch } = useQuery<Strategy[]>({
    queryKey: ["strategies"],
    queryFn: async () => {
      const res = await apiGet<Strategy[] | { strategies: Strategy[] }>("/strategy");
      return Array.isArray(res) ? res : (res as { strategies: Strategy[] }).strategies ?? [];
    },
    staleTime: 60_000,
  });

  const swarmMut = useMutation({
    mutationFn: () => apiGet<SwarmResult>(`/strategy/swarm?symbol=${encodeURIComponent(symbol)}`),
    onSuccess: (d) => { setSwarmResult(d); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
  });

  const backtestMut = useMutation({
    mutationFn: () =>
      apiPost<BacktestResult>("/strategy/backtest", {
        strategyId: selectedStrategy || (strategies?.[0]?.id ?? "ema_cross_12_26"),
        symbol,
        timeframe,
        limit,
      }),
    onSuccess: (d) => { setBacktestResult(d); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
  });

  const TABS = [
    { key: "library",  label: "Library",  icon: "book" },
    { key: "swarm",    label: "Swarm",    icon: "users" },
    { key: "backtest", label: "Backtest", icon: "bar-chart-2" },
  ] as const;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView
      contentContainerStyle={{ paddingBottom: insets.bottom + 180 } /* TODO: migrate to useScreenInsets */}
      refreshControl={<RefreshControl refreshing={strLoading} onRefresh={() => refetch()} />}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>Strategy</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Bot & Backtest</Text>
        </View>
        <View style={[styles.statusDot, { backgroundColor: "#00C176" }]} />
      </View>

      {/* Symbol Selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.symbolBar} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {SYMBOLS.map((s) => (
          <Pressable
            key={s}
            onPress={() => { setSymbol(s); Haptics.selectionAsync(); }}
            style={[styles.symBtn, {
              backgroundColor: symbol === s ? "#00C9A7" : colors.card,
              borderColor: symbol === s ? "#00C9A7" : colors.border,
            }]}
          >
            <Text style={[styles.symBtnText, { color: symbol === s ? "#000" : colors.foreground }]}>
              {s.replace("/USDT", "")}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Tab Pills */}
      <View style={[styles.tabRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => { setActiveTab(t.key); Haptics.selectionAsync(); }}
            style={[styles.tabPill, activeTab === t.key && { backgroundColor: "#00C9A7" }]}
          >
            <Feather name={t.icon} size={13} color={activeTab === t.key ? "#000" : colors.mutedForeground} />
            <Text style={[styles.tabPillText, { color: activeTab === t.key ? "#000" : colors.mutedForeground }]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── LIBRARY TAB ── */}
      {activeTab === "library" && (
        <View style={styles.section}>
          {strLoading ? (
            <ActivityIndicator color="#00C9A7" style={{ marginTop: 40 }} />
          ) : (
            (strategies ?? []).map((s) => (
              <View key={s.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleRow}>
                    <View style={[styles.strategyDot, { backgroundColor: "#00C9A7" }]} />
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>{s.name}</Text>
                    {s.builtin && (
                      <View style={styles.builtinBadge}>
                        <Text style={styles.builtinText}>BUILTIN</Text>
                      </View>
                    )}
                  </View>
                  <Pressable
                    onPress={() => { setSelectedStrategy(s.id); setActiveTab("backtest"); Haptics.selectionAsync(); }}
                    style={styles.backtestBtn}
                  >
                    <Text style={styles.backtestBtnText}>Backtest</Text>
                  </Pressable>
                </View>
                <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>{s.description}</Text>
                {s.params && Object.keys(s.params).length > 0 && (
                  <View style={styles.paramsRow}>
                    {Object.entries(s.params).slice(0, 4).map(([k, v]) => (
                      <View key={k} style={[styles.paramChip, { borderColor: colors.border }]}>
                        <Text style={[styles.paramText, { color: colors.mutedForeground }]}>{k}: </Text>
                        <Text style={[styles.paramText, { color: "#00C9A7" }]}>{String(v)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      )}

      {/* ── SWARM TAB ── */}
      {activeTab === "swarm" && (
        <View style={styles.section}>
          <Pressable
            onPress={() => { swarmMut.mutate(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
            style={[styles.runBtn, { opacity: swarmMut.isPending ? 0.6 : 1 }]}
            disabled={swarmMut.isPending}
          >
            {swarmMut.isPending ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Feather name="users" size={16} color="#000" />
                <Text style={styles.runBtnText}>Swarm Çalıştır — {symbol.replace("/USDT", "")}</Text>
              </>
            )}
          </Pressable>

          {swarmResult && (
            <>
              <View style={[styles.priceRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Fiyat</Text>
                <Text style={[styles.priceVal, { color: colors.foreground }]}>
                  ${swarmResult.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>

              <View style={styles.agentGrid}>
                {swarmResult.agents.map((a) => {
                  const meta = AGENT_META[a.agent.toLowerCase()] ?? { emoji: "🤖", color: "#8A97AD" };
                  return (
                    <View key={a.agent} style={[styles.agentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={styles.agentEmoji}>{meta.emoji}</Text>
                      <Text style={[styles.agentName, { color: meta.color }]}>{a.agent}</Text>
                      <Text style={[styles.agentRole, { color: colors.mutedForeground }]}>{a.role}</Text>
                      <DirectionBadge dir={a.direction} />
                      <View style={styles.confBar}>
                        <View style={[styles.confFill, { width: `${a.confidence}%` as any, backgroundColor: meta.color }]} />
                      </View>
                      <Text style={[styles.confText, { color: colors.mutedForeground }]}>{a.confidence}% conf</Text>
                    </View>
                  );
                })}
              </View>

              {swarmResult.consensus && (
                <View style={[styles.consensusCard, {
                  backgroundColor: swarmResult.consensus.direction === "LONG"
                    ? "rgba(0,193,118,0.12)" : swarmResult.consensus.direction === "SHORT"
                    ? "rgba(240,74,90,0.12)" : "rgba(255,255,255,0.06)",
                  borderColor: swarmResult.consensus.direction === "LONG" ? "#00C176" :
                    swarmResult.consensus.direction === "SHORT" ? "#F04A5A" : colors.border,
                }]}>
                  <Text style={[styles.consensusLabel, { color: colors.mutedForeground }]}>KONSENSUS</Text>
                  <Text style={[styles.consensusDir, {
                    color: swarmResult.consensus.direction === "LONG" ? "#00C176" :
                      swarmResult.consensus.direction === "SHORT" ? "#F04A5A" : "#8A97AD",
                  }]}>
                    {swarmResult.consensus.direction}
                  </Text>
                  <Text style={[styles.consensusConf, { color: colors.mutedForeground }]}>
                    {swarmResult.consensus.votes}/{swarmResult.consensus.total} ajan · %{swarmResult.consensus.confidence} güven
                  </Text>
                </View>
              )}
            </>
          )}

          {swarmMut.isError && (
            <Text style={[styles.errorText, { color: "#F04A5A" }]}>Hata: Swarm çalıştırılamadı</Text>
          )}
        </View>
      )}

      {/* ── BACKTEST TAB ── */}
      {activeTab === "backtest" && (
        <View style={styles.section}>
          {/* Strategy picker */}
          <View style={[styles.fieldRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Strateji</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {(strategies ?? []).map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => { setSelectedStrategy(s.id); Haptics.selectionAsync(); }}
                  style={[styles.pickChip, {
                    backgroundColor: selectedStrategy === s.id ? "#00C9A7" : colors.card,
                    borderColor: selectedStrategy === s.id ? "#00C9A7" : colors.border,
                  }]}
                >
                  <Text style={[styles.pickChipText, { color: selectedStrategy === s.id ? "#000" : colors.mutedForeground }]}>
                    {s.name.length > 14 ? s.name.slice(0, 14) + "…" : s.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Timeframe picker */}
          <View style={[styles.fieldRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Timeframe</Text>
            <View style={styles.chipGroup}>
              {TIMEFRAMES.map((tf) => (
                <Pressable
                  key={tf}
                  onPress={() => { setTimeframe(tf); Haptics.selectionAsync(); }}
                  style={[styles.pickChip, {
                    backgroundColor: timeframe === tf ? "#00C9A7" : colors.card,
                    borderColor: timeframe === tf ? "#00C9A7" : colors.border,
                  }]}
                >
                  <Text style={[styles.pickChipText, { color: timeframe === tf ? "#000" : colors.mutedForeground }]}>{tf}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Candle limit */}
          <View style={[styles.fieldRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Mum Sayısı</Text>
            <View style={styles.chipGroup}>
              {CANDLE_LIMITS.map((l) => (
                <Pressable
                  key={l}
                  onPress={() => { setLimit(l); Haptics.selectionAsync(); }}
                  style={[styles.pickChip, {
                    backgroundColor: limit === l ? "#00C9A7" : colors.card,
                    borderColor: limit === l ? "#00C9A7" : colors.border,
                  }]}
                >
                  <Text style={[styles.pickChipText, { color: limit === l ? "#000" : colors.mutedForeground }]}>{l}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable
            onPress={() => { backtestMut.mutate(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
            style={[styles.runBtn, { opacity: backtestMut.isPending ? 0.6 : 1 }]}
            disabled={backtestMut.isPending}
          >
            {backtestMut.isPending ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Feather name="play" size={16} color="#000" />
                <Text style={styles.runBtnText}>Backtest Çalıştır</Text>
              </>
            )}
          </Pressable>

          {backtestResult?.result && (
            <View>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                {backtestResult.result.strategyName} · {backtestResult.result.symbol}
              </Text>
              <View style={styles.statsGrid}>
                {[
                  { label: "Toplam İşlem", value: String(backtestResult.result.totalTrades) },
                  { label: "Kazanma Oranı", value: `%${(backtestResult.result.winRate * 100).toFixed(1)}` },
                  { label: "Toplam PnL", value: `%${backtestResult.result.totalPnlPct.toFixed(2)}`, positive: backtestResult.result.totalPnlPct > 0 },
                  { label: "Max Drawdown", value: `%${backtestResult.result.maxDrawdownPct.toFixed(2)}`, negative: true },
                  { label: "Sharpe Oranı", value: backtestResult.result.sharpeRatio.toFixed(2), positive: backtestResult.result.sharpeRatio > 1 },
                  { label: "Profit Factor", value: backtestResult.result.profitFactor.toFixed(2), positive: backtestResult.result.profitFactor > 1 },
                ].map((stat) => (
                  <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
                    <Text style={[styles.statValue, {
                      color: stat.positive ? "#00C176" : stat.negative ? "#F04A5A" : colors.foreground,
                    }]}>{stat.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {backtestMut.isError && (
            <Text style={[styles.errorText, { color: "#F04A5A" }]}>Backtest başarısız oldu</Text>
          )}
        </View>
      )}
    </ScrollView>
    <AgentChatSheet
      pageId="strategy"
      pageContext="Strategy sayfası — bot kütüphanesi, çok-ajan swarm analizi, backtest motoru"
    />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: "700", letterSpacing: -0.5 },
  subtitle: { fontSize: 12, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
  symbolBar: { marginBottom: 12 },
  symBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  symBtnText: { fontSize: 12, fontWeight: "600" },
  tabRow: { flexDirection: "row", marginHorizontal: 16, marginBottom: 14, borderRadius: 12, borderWidth: 1, padding: 4 },
  tabPill: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: 8 },
  tabPillText: { fontSize: 12, fontWeight: "600" },
  section: { paddingHorizontal: 16, gap: 10 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  strategyDot: { width: 7, height: 7, borderRadius: 4 },
  cardTitle: { fontSize: 13, fontWeight: "700", flex: 1 },
  builtinBadge: { backgroundColor: "rgba(0,201,167,0.12)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  builtinText: { fontSize: 9, color: "#00C9A7", fontWeight: "700" },
  backtestBtn: { backgroundColor: "rgba(0,201,167,0.12)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  backtestBtnText: { fontSize: 11, color: "#00C9A7", fontWeight: "600" },
  cardDesc: { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  paramsRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  paramChip: { flexDirection: "row", borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  paramText: { fontSize: 10 },
  badge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 4 },
  badgeText: { fontSize: 10, fontWeight: "700" },
  runBtn: { backgroundColor: "#00C9A7", borderRadius: 14, paddingVertical: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  runBtnText: { color: "#000", fontSize: 14, fontWeight: "700" },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 12 },
  priceLabel: { fontSize: 11 },
  priceVal: { fontSize: 20, fontWeight: "700" },
  agentGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  agentCard: { width: "47%", borderRadius: 14, borderWidth: 1, padding: 12, alignItems: "center", gap: 4 },
  agentEmoji: { fontSize: 24, marginBottom: 2 },
  agentName: { fontSize: 12, fontWeight: "700" },
  agentRole: { fontSize: 10, textAlign: "center" },
  confBar: { width: "100%", height: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden", marginTop: 4 },
  confFill: { height: "100%", borderRadius: 2 },
  confText: { fontSize: 10, marginTop: 2 },
  consensusCard: { borderRadius: 14, borderWidth: 1.5, padding: 16, alignItems: "center", gap: 4 },
  consensusLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  consensusDir: { fontSize: 24, fontWeight: "800" },
  consensusConf: { fontSize: 12 },
  errorText: { textAlign: "center", marginTop: 20, fontSize: 13 },
  fieldRow: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  fieldLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  chipGroup: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pickChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  pickChipText: { fontSize: 11, fontWeight: "600" },
  sectionLabel: { fontSize: 11, marginBottom: 8, textAlign: "center" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCard: { width: "47%", borderRadius: 12, borderWidth: 1, padding: 12 },
  statLabel: { fontSize: 10, marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: "700" },
});
