import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useScreenInsets } from "@/hooks/useTabBarHeight";
import { apiGet, type RiskStatus, type OhlcvResp, type ExecutionMode } from "@/lib/api";
import AgentChatSheet from "@/components/AgentChatSheet";
import TradeSheet from "@/components/TradeSheet";

const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"];

const EXEC_MODE_COLOR: Record<ExecutionMode, string> = {
  paper:        "#A78BFA",
  semi:         "#38BDF8",
  auto_confirm: "#F59E0B",
  full_auto:    "#FF4D6D",
};

const EXEC_MODE_LABEL: Record<ExecutionMode, string> = {
  paper:        "PAPER",
  semi:         "SEMI",
  auto_confirm: "AUTO",
  full_auto:    "FULL AUTO",
};

function useTicker(symbol: string) {
  return useQuery<OhlcvResp>({
    queryKey: ["ohlcv", symbol],
    queryFn: () =>
      apiGet<OhlcvResp>(
        `/markets/ohlcv?symbol=${encodeURIComponent(symbol)}&timeframe=1h&limit=2`
      ),
    refetchInterval: 8000,
    staleTime: 3000,
  });
}

function TickerBadge({ symbol }: { symbol: string }) {
  const colors = useColors();
  const { data } = useTicker(symbol);
  const candles = data?.candles ?? [];
  const last = candles[candles.length - 1];
  const first = candles[0];
  const price = last?.close ?? 0;
  const change = last && first ? ((last.close - first.open) / first.open) * 100 : 0;
  const isUp = change >= 0;
  const base = symbol.replace("/USDT", "");
  return (
    <View style={[styles.tickerBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.tickerSym, { color: colors.mutedForeground }]}>{base}</Text>
      <Text style={[styles.tickerPrice, { color: colors.foreground }]}>
        {price > 0
          ? `$${price.toLocaleString(undefined, { maximumFractionDigits: price > 1 ? 2 : 4 })}`
          : "—"}
      </Text>
      <Text style={[styles.tickerChg, { color: isUp ? "#00FFB2" : "#FF4D6D" }]}>
        {price > 0 ? `${isUp ? "+" : ""}${change.toFixed(2)}%` : "—"}
      </Text>
    </View>
  );
}

interface NavCard {
  label: string;
  description: string;
  icon: string;
  route?: string;
  color: string;
  action?: () => void;
}

export default function MoreScreen() {
  const colors = useColors();
  const insets = useScreenInsets();
  const router = useRouter();
  const [tradeOpen, setTradeOpen] = useState(false);

  const { data: riskStatus } = useQuery<RiskStatus>({
    queryKey: ["risk-status"],
    queryFn: () => apiGet<RiskStatus>("/risk/status"),
    refetchInterval: 10000,
  });

  const profile = riskStatus?.profile;
  const stats = riskStatus?.stats;
  const isKilled = profile?.killSwitchEngaged ?? false;
  const executionMode: ExecutionMode = riskStatus?.execution_mode ?? "paper";
  const modeColor = isKilled ? "#FF4D6D" : (EXEC_MODE_COLOR[executionMode] ?? "#A78BFA");
  const modeLabel = isKilled ? "KILLED" : (EXEC_MODE_LABEL[executionMode] ?? "PAPER");
  const pnl = stats?.realizedPnlUsd ?? 0;

  const NAV_CARDS: NavCard[] = [
    {
      label: "Emir Testi",
      description: "Paper & live Binance emir gönder",
      icon: "activity",
      color: "#00FFB2",
      action: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setTradeOpen(true); },
    },
    { label: "Strateji", description: "Bot backtest & swarm analiz", icon: "cpu", route: "/(tabs)/strategy", color: "#A78BFA" },
    { label: "Prediction", description: "Polymarket tahmin piyasaları", icon: "bar-chart-2", route: "/(tabs)/prediction", color: "#60A5FA" },
    { label: "Ledger", description: "Emir & işlem geçmişi", icon: "file-text", route: "/(tabs)/ledger", color: "#F59E0B" },
    { label: "Ayarlar", description: "Risk limitleri & exchange vault", icon: "settings", route: "/(tabs)/settings", color: "#38BDF8" },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.chatSheetClearance }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Daha Fazla</Text>

        <View style={styles.statusStrip}>
          <Pressable
            style={[styles.statusItem, { backgroundColor: colors.card, borderColor: `${modeColor}44` }]}
            onPress={() => router.push("/(tabs)/settings" as any)}
          >
            <View style={[styles.statusDot, { backgroundColor: modeColor }]} />
            <Text style={[styles.statusLabel, { color: colors.mutedForeground }]}>Mod</Text>
            <Text style={[styles.statusVal, { color: modeColor, fontSize: modeLabel.length > 6 ? 9 : 11 }]}>
              {modeLabel}
            </Text>
          </Pressable>
          <View style={[styles.statusItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="trending-up" size={12} color={pnl >= 0 ? "#00FFB2" : "#FF4D6D"} />
            <Text style={[styles.statusLabel, { color: colors.mutedForeground }]}>Bugün PnL</Text>
            <Text style={[styles.statusVal, { color: pnl >= 0 ? "#00FFB2" : "#FF4D6D" }]}>
              {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
            </Text>
          </View>
          <View style={[styles.statusItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="layers" size={12} color={colors.mutedForeground} />
            <Text style={[styles.statusLabel, { color: colors.mutedForeground }]}>Pozisyon</Text>
            <Text style={[styles.statusVal, { color: colors.foreground }]}>
              {riskStatus?.open_positions ?? 0}
            </Text>
          </View>
          <View style={[styles.statusItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="shield" size={12} color={colors.mutedForeground} />
            <Text style={[styles.statusLabel, { color: colors.mutedForeground }]}>Bütçe</Text>
            <Text style={[styles.statusVal, { color: colors.foreground }]}>
              ${(riskStatus?.daily_loss_remaining_usd ?? 0).toFixed(0)}
            </Text>
          </View>
        </View>

        <View style={styles.tickerRow}>
          {SYMBOLS.map((s) => <TickerBadge key={s} symbol={s} />)}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ARAÇLAR & AYARLAR</Text>

        <View style={styles.navGrid}>
          {NAV_CARDS.map((card) => (
            <Pressable
              key={card.label}
              style={({ pressed }) => [
                styles.navCard,
                { backgroundColor: colors.card, borderColor: `${card.color}33`, opacity: pressed ? 0.75 : 1 },
              ]}
              onPress={() => {
                if (card.action) {
                  card.action();
                } else if (card.route) {
                  Haptics.selectionAsync();
                  router.push(card.route as any);
                }
              }}
            >
              <View style={[styles.navIcon, { backgroundColor: `${card.color}18` }]}>
                <Feather name={card.icon as any} size={20} color={card.color} />
              </View>
              <Text style={[styles.navLabel, { color: colors.foreground }]}>{card.label}</Text>
              <Text style={[styles.navDesc, { color: colors.mutedForeground }]}>{card.description}</Text>
              <Feather name="chevron-right" size={14} color={colors.mutedForeground} style={styles.navArrow} />
            </Pressable>
          ))}
        </View>

        <View style={[styles.versionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.versionTitle, { color: colors.mutedForeground }]}>SİSTEM</Text>
          {[
            ["Versiyon", "v5.0.0"],
            ["Backend", "Express 5 + CCXT 4.5"],
            ["AI", "claude-sonnet-4-6"],
            ["PolicyGuard", "11 kontrol aktif"],
          ].map(([k, v]) => (
            <View key={k} style={[styles.versionRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.versionKey, { color: colors.mutedForeground }]}>{k}</Text>
              <Text style={[styles.versionVal, { color: colors.foreground }]}>{v}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <AgentChatSheet
        pageId="more"
        pageContext="More sayfası — emir testi, strateji, prediction, ledger, ayarlar ve sistem durumu"
      />

      <TradeSheet visible={tradeOpen} onClose={() => setTradeOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statusStrip: { flexDirection: "row", gap: 6 },
  statusItem: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 10, gap: 3, alignItems: "center" },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 8, fontFamily: "Inter_500Medium", letterSpacing: 0.5 },
  statusVal: { fontSize: 11, fontFamily: "Inter_700Bold", textAlign: "center" },
  tickerRow: { flexDirection: "row", gap: 8 },
  tickerBadge: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 10, gap: 2, alignItems: "center" },
  tickerSym: { fontSize: 8, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  tickerPrice: { fontSize: 11, fontFamily: "Inter_700Bold" },
  tickerChg: { fontSize: 9, fontFamily: "Inter_500Medium" },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5, marginTop: 4 },
  navGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  navCard: {
    width: "47.5%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 6,
    position: "relative",
  },
  navIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  navLabel: { fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 4 },
  navDesc: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15 },
  navArrow: { position: "absolute", top: 14, right: 14 },
  versionCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  versionTitle: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5, padding: 14 },
  versionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  versionKey: { fontSize: 12, fontFamily: "Inter_400Regular" },
  versionVal: { fontSize: 12, fontFamily: "Inter_500Medium" },
});
