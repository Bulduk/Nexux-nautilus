import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useScreenInsets } from "@/hooks/useTabBarHeight";
import { apiGet, apiPost, type RiskStatus, type OpenPosition, type OhlcvResp } from "@/lib/api";
import AgentChatSheet from "@/components/AgentChatSheet";
import { PortfolioStatSkeleton } from "@/components/SkeletonLoader";
import SparklineChart from "@/components/SparklineChart";

const TRACKED = ["BTC/USDT", "ETH/USDT", "SOL/USDT"];

function usePrice(symbol: string) {
  const { data } = useQuery<OhlcvResp>({
    queryKey: ["ohlcv", symbol],
    queryFn: () => apiGet<OhlcvResp>(`/markets/ohlcv?symbol=${encodeURIComponent(symbol)}&timeframe=1h&limit=1`),
    refetchInterval: 5000,
    staleTime: 3000,
  });
  const candles = data?.candles ?? [];
  return candles[candles.length - 1]?.close ?? 0;
}

function usePriceHistory(symbol: string) {
  const { data } = useQuery<OhlcvResp>({
    queryKey: ["ohlcv-spark", symbol],
    queryFn: () => apiGet<OhlcvResp>(`/markets/ohlcv?symbol=${encodeURIComponent(symbol)}&timeframe=1h&limit=12`),
    refetchInterval: 30000,
    staleTime: 20000,
  });
  return (data?.candles ?? []).map((c) => c.close);
}

function PositionRow({ pos, onClose }: { pos: OpenPosition; onClose: () => void }) {
  const colors = useColors();
  const mark = usePrice(pos.symbol);
  const history = usePriceHistory(pos.symbol);
  const sideMul = pos.side === "BUY" ? 1 : -1;
  const pnl = mark > 0 ? (mark - pos.entryPrice) * pos.qty * sideMul : 0;
  const pnlPct = mark > 0 ? ((mark - pos.entryPrice) / pos.entryPrice) * 100 * sideMul : 0;
  const isLive = pos.mode === "live";
  const pnlColor = pnl >= 0 ? "#00FFB2" : "#FF4D6D";

  return (
    <View style={[styles.posRow, { borderBottomColor: colors.border }]}>
      <View style={styles.posLeft}>
        <View style={styles.posTopRow}>
          <View style={[styles.modeBadge, { backgroundColor: isLive ? "#FF4D6D22" : "#f59e0b22", borderColor: isLive ? "#FF4D6D66" : "#f59e0b66" }]}>
            <Text style={[styles.modeText, { color: isLive ? "#FF4D6D" : "#f59e0b", fontFamily: "Inter_600SemiBold" }]}>{pos.mode.toUpperCase()}</Text>
          </View>
          <Text style={[styles.posSymbol, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{pos.symbol}</Text>
          <Text style={[styles.posSide, { color: pos.side === "BUY" ? "#00FFB2" : "#FF4D6D", fontFamily: "Inter_600SemiBold" }]}>{pos.side}</Text>
        </View>
        <Text style={[styles.posDetail, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {pos.qty.toFixed(6)} @ ${pos.entryPrice.toFixed(2)} → ${mark > 0 ? mark.toFixed(2) : "…"}
        </Text>
        {history.length > 2 && (
          <SparklineChart data={history} width={80} height={20} color={pnlColor} strokeWidth={1} />
        )}
      </View>
      <View style={styles.posRight}>
        <Text style={[styles.posPnl, { color: pnlColor, fontFamily: "Inter_700Bold" }]}>
          {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
        </Text>
        <Text style={[styles.posPnlPct, { color: pnlColor }]}>
          {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
        </Text>
        <Pressable onPress={onClose} style={[styles.closeBtn, { borderColor: colors.border }]}>
          <Feather name="x" size={14} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

export default function PortfolioScreen() {
  const colors = useColors();
  const insets = useScreenInsets();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: riskStatus, isLoading: riskLoading } = useQuery<RiskStatus>({
    queryKey: ["risk-status"],
    queryFn: () => apiGet<RiskStatus>("/risk/status"),
    refetchInterval: 5000,
  });

  const { data: posData } = useQuery<{ positions: OpenPosition[] }>({
    queryKey: ["positions"],
    queryFn: () => apiGet<{ positions: OpenPosition[] }>("/ledger/positions"),
    refetchInterval: 5000,
  });

  const positions = posData?.positions ?? [];
  const profile = riskStatus?.profile;
  const stats = riskStatus?.stats;
  const isKilled = profile?.killSwitchEngaged ?? false;
  const isArmed = profile?.liveTradingArmed ?? false;

  const armMutation = useMutation({
    mutationFn: (armed: boolean) => apiPost<RiskStatus>("/risk/arm", { armed }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["risk-status"] }),
  });

  const killMutation = useMutation({
    mutationFn: (engaged: boolean) => apiPost<RiskStatus>("/risk/kill", { engaged }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["risk-status"] }),
  });

  const closeMutation = useMutation({
    mutationFn: ({ intentId, exitPrice }: { intentId: string; exitPrice: number }) =>
      apiPost("/intent/close", { intent_id: intentId, exit_price: exitPrice }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["positions"] }),
  });

  const flattenMutation = useMutation({
    mutationFn: () => apiPost("/intent/flatten-all", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["positions"] }),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await qc.invalidateQueries();
    setRefreshing(false);
  };

  const pnl = stats?.realizedPnlUsd ?? 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.chatSheetClearance }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00FFB2" />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Portfolio</Text>

        <View style={styles.armRow}>
          <Pressable
            style={({ pressed }) => [styles.armBtn, { backgroundColor: isArmed ? "#f59e0b18" : "#00FFB218", borderColor: isArmed ? "#f59e0b66" : "#00FFB266", opacity: pressed || isKilled ? 0.6 : 1 }]}
            disabled={isKilled || armMutation.isPending}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); armMutation.mutate(!isArmed); }}
          >
            {armMutation.isPending
              ? <ActivityIndicator color="#00FFB2" size="small" />
              : <Feather name="shield" size={18} color={isArmed ? "#f59e0b" : "#00FFB2"} />}
            <Text style={[styles.armText, { color: isArmed ? "#f59e0b" : "#00FFB2", fontFamily: "Inter_700Bold" }]}>
              {isArmed ? "DISARM LIVE" : "ARM LIVE"}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.killBtn, { backgroundColor: isKilled ? "#FF4D6D18" : "#ffffff08", borderColor: isKilled ? "#FF4D6D66" : colors.border, opacity: pressed ? 0.7 : 1 }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); killMutation.mutate(!isKilled); }}
          >
            {killMutation.isPending
              ? <ActivityIndicator color="#FF4D6D" size="small" />
              : <Feather name="alert-octagon" size={18} color={isKilled ? "#FF4D6D" : colors.mutedForeground} />}
            <Text style={[styles.killText, { color: isKilled ? "#FF4D6D" : colors.mutedForeground, fontFamily: "Inter_700Bold" }]}>
              {isKilled ? "RELEASE" : "KILL"}
            </Text>
          </Pressable>
        </View>

        {isKilled && (
          <View style={[styles.alertBanner, { backgroundColor: "#FF4D6D18", borderColor: "#FF4D6D55" }]}>
            <Feather name="alert-octagon" size={14} color="#FF4D6D" />
            <Text style={[styles.alertText, { color: "#FF4D6D", fontFamily: "Inter_500Medium" }]}>
              Kill switch aktif — tüm canlı emirler engellendi
            </Text>
          </View>
        )}

        <View style={styles.statsRow}>
          {riskLoading ? (
            <>
              <PortfolioStatSkeleton />
              <PortfolioStatSkeleton />
              <PortfolioStatSkeleton />
              <PortfolioStatSkeleton />
            </>
          ) : (
            [
              { label: "Today PnL", val: `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`, color: pnl >= 0 ? "#00FFB2" : "#FF4D6D" },
              { label: "Open Pos.", val: `${riskStatus?.open_positions ?? 0}`, color: colors.blue },
              { label: "Gross Exp.", val: `$${(riskStatus?.gross_exposure_usd ?? 0).toFixed(0)}`, color: colors.foreground },
              { label: "Loss Budget", val: `$${(riskStatus?.daily_loss_remaining_usd ?? 0).toFixed(0)}`, color: (riskStatus?.daily_loss_remaining_usd ?? 100) < 20 ? "#f59e0b" : colors.foreground },
            ].map((s) => (
              <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>{s.label}</Text>
                <Text style={[styles.statVal, { color: s.color, fontFamily: "Inter_700Bold" }]}>{s.val}</Text>
              </View>
            ))
          )}
        </View>

        <View style={[styles.posSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.posHeader}>
            <Text style={[styles.posSectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              Open Positions ({positions.length})
            </Text>
            {positions.length > 0 && (
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); flattenMutation.mutate(); }}
                style={[styles.flattenBtn, { borderColor: "#FF4D6D66" }]}
              >
                <Text style={[styles.flattenText, { color: "#FF4D6D", fontFamily: "Inter_600SemiBold" }]}>FLATTEN ALL</Text>
              </Pressable>
            )}
          </View>

          {positions.length === 0 ? (
            <View style={styles.emptyPos}>
              <Feather name="layers" size={24} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Açık pozisyon yok</Text>
            </View>
          ) : (
            positions.map((p) => (
              <PositionRow
                key={p.intentId}
                pos={p}
                onClose={() => closeMutation.mutate({ intentId: p.intentId, exitPrice: 0 })}
              />
            ))
          )}
        </View>

        <View style={[styles.riskCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.riskTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Risk Limits (sunucu taraflı)</Text>
          {profile && [
            ["Max Leverage", `${profile.maxLeverage}x`],
            ["Max Position", `$${profile.maxPositionSizeUsd}`],
            ["Max Gross Exp.", `$${profile.maxGrossExposureUsd}`],
            ["Daily Loss Limit", `$${profile.dailyLossLimitUsd}`],
            ["Max Drawdown", `${profile.maxDrawdownPct}%`],
            ["Min Confidence", `${profile.minConfidenceCore}% (core)`],
            ["Cooldown/Symbol", `${profile.cooldownSecPerSymbol}s`],
          ].map(([label, val]) => (
            <View key={label as string} style={[styles.riskRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.riskLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{label}</Text>
              <Text style={[styles.riskVal, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{val}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <AgentChatSheet
        pageId="portfolio"
        pageContext="Portfolio sayfası — açık pozisyonlar, ARM/KILL switch, günlük PnL, risk limitleri"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
  title: { fontSize: 22 },
  armRow: { flexDirection: "row", gap: 10 },
  armBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 14 },
  armText: { fontSize: 13 },
  killBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 14 },
  killText: { fontSize: 13 },
  alertBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  alertText: { fontSize: 13, flex: 1 },
  statsRow: { flexDirection: "row", gap: 8 },
  statCard: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 10, gap: 4 },
  statLabel: { fontSize: 9, letterSpacing: 0.5 },
  statVal: { fontSize: 16 },
  posSection: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  posHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  posSectionTitle: { fontSize: 14 },
  flattenBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  flattenText: { fontSize: 11 },
  posRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  posLeft: { flex: 1, gap: 4 },
  posTopRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  modeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  modeText: { fontSize: 9, letterSpacing: 0.5 },
  posSymbol: { fontSize: 14 },
  posSide: { fontSize: 12 },
  posDetail: { fontSize: 12 },
  posRight: { alignItems: "flex-end", gap: 4 },
  posPnl: { fontSize: 16 },
  posPnlPct: { fontSize: 10, fontFamily: "Inter_500Medium" },
  closeBtn: { padding: 6, borderRadius: 6, borderWidth: 1, marginTop: 2 },
  emptyPos: { alignItems: "center", padding: 24, gap: 8 },
  emptyText: { fontSize: 14 },
  riskCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  riskTitle: { fontSize: 14, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.07)" },
  riskRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  riskLabel: { fontSize: 13 },
  riskVal: { fontSize: 13 },
});
