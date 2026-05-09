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
import { useQuery, useMutation } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useScreenInsets } from "@/hooks/useTabBarHeight";
import { apiGet, apiPost } from "@/lib/api";
import AgentChatSheet from "@/components/AgentChatSheet";

interface PredictionMarket {
  id: string;
  question: string;
  description: string;
  endDate: string | null;
  outcomes: string[];
  outcomePrices: number[];
  volumeUsd: number;
  slug: string;
  active: boolean;
}

interface MarketsResponse {
  markets: PredictionMarket[];
  count: number;
  fetchedAt: number;
  stale?: boolean;
}

interface InterpretResponse {
  interpretation: string;
  model: string;
  analyzedCount: number;
}

function OddsBar({ yesProb, color }: { yesProb: number; color: string }) {
  const noProb = 1 - yesProb;
  return (
    <View>
      <View style={styles.oddsRow}>
        <Text style={[styles.oddsLabel, { color: "#00C176" }]}>EVET</Text>
        <Text style={[styles.oddsLabel, { color: "#F04A5A" }]}>HAYIR</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${yesProb * 100}%` as any, backgroundColor: color }]} />
      </View>
      <View style={styles.oddsRow}>
        <Text style={[styles.oddsValue, { color: "#00C176" }]}>{(yesProb * 100).toFixed(1)}%</Text>
        <Text style={[styles.oddsValue, { color: "#F04A5A" }]}>{(noProb * 100).toFixed(1)}%</Text>
      </View>
    </View>
  );
}

function VolumeBadge({ vol }: { vol: number }) {
  const formatted = vol >= 1_000_000
    ? `$${(vol / 1_000_000).toFixed(1)}M`
    : vol >= 1_000
    ? `$${(vol / 1_000).toFixed(0)}K`
    : `$${vol.toFixed(0)}`;
  return (
    <View style={styles.volBadge}>
      <Feather name="trending-up" size={10} color="#8A97AD" />
      <Text style={styles.volText}>{formatted}</Text>
    </View>
  );
}

export default function PredictionScreen() {
  const insets = useScreenInsets();
  const colors = useColors();
  const [showInterp, setShowInterp] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery<MarketsResponse>({
    queryKey: ["prediction-markets"],
    queryFn: () => apiGet<MarketsResponse>("/prediction/markets"),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const interpretMut = useMutation({
    mutationFn: () =>
      apiPost<InterpretResponse>("/prediction/interpret", {
        markets: data?.markets?.slice(0, 10) ?? [],
      }),
    onSuccess: () => {
      setShowInterp(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const markets = data?.markets ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView
      contentContainerStyle={{ paddingBottom: insets.chatSheetClearance }}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => refetch()}
          tintColor="#00C9A7"
        />
      }
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>Prediction</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Polymarket · Kripto Tahminleri</Text>
        </View>
        <Pressable
          onPress={() => { refetch(); Haptics.selectionAsync(); }}
          style={[styles.refreshBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="refresh-cw" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Claude interpret button */}
      <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
        <Pressable
          onPress={() => {
            interpretMut.mutate();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }}
          disabled={interpretMut.isPending || markets.length === 0}
          style={[styles.interpBtn, { opacity: (interpretMut.isPending || markets.length === 0) ? 0.5 : 1 }]}
        >
          {interpretMut.isPending ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <>
              <Feather name="cpu" size={15} color="#000" />
              <Text style={styles.interpBtnText}>AI ile Yorumla (Claude)</Text>
            </>
          )}
        </Pressable>

        {showInterp && interpretMut.data && (
          <View style={[styles.interpCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.interpHeader}>
              <Feather name="cpu" size={12} color="#00C9A7" />
              <Text style={[styles.interpTitle, { color: "#00C9A7" }]}>Claude Yorumu</Text>
              <Pressable onPress={() => setShowInterp(false)}>
                <Feather name="x" size={14} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <Text style={[styles.interpText, { color: colors.foreground }]}>
              {interpretMut.data.interpretation}
            </Text>
          </View>
        )}
      </View>

      {/* Market list */}
      <View style={styles.section}>
        {isLoading ? (
          <ActivityIndicator color="#00C9A7" style={{ marginTop: 40 }} />
        ) : markets.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Piyasa verisi yüklenemedi. Aşağı çekerek yenile.
          </Text>
        ) : (
          markets.map((m) => {
            const yesProb = m.outcomePrices[0] ?? 0;
            const barColor = yesProb >= 0.6 ? "#00C176" : yesProb <= 0.4 ? "#F04A5A" : "#F59E0B";
            const endDate = m.endDate ? new Date(m.endDate).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) : null;

            return (
              <View key={m.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardTop}>
                  <Text style={[styles.question, { color: colors.foreground }]}>{m.question}</Text>
                  <View style={styles.cardMeta}>
                    <VolumeBadge vol={m.volumeUsd} />
                    {endDate && (
                      <View style={styles.dateBadge}>
                        <Feather name="calendar" size={9} color="#8A97AD" />
                        <Text style={styles.dateText}>{endDate}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <OddsBar yesProb={yesProb} color={barColor} />
                <View style={styles.signalRow}>
                  <View style={[styles.signalDot, {
                    backgroundColor: yesProb >= 0.6 ? "#00C176" : yesProb <= 0.4 ? "#F04A5A" : "#F59E0B",
                  }]} />
                  <Text style={[styles.signalText, { color: colors.mutedForeground }]}>
                    {yesProb >= 0.7 ? "Güçlü boğa beklentisi" :
                     yesProb >= 0.55 ? "Ilımlı boğa beklentisi" :
                     yesProb <= 0.3 ? "Güçlü ayı beklentisi" :
                     yesProb <= 0.45 ? "Ilımlı ayı beklentisi" :
                     "Kararsız piyasa"}
                  </Text>
                </View>
              </View>
            );
          })
        )}

        {data?.stale && (
          <Text style={[styles.staleText, { color: colors.mutedForeground }]}>
            ⚠ Eski veri gösteriliyor — API geçici olarak ulaşılamıyor
          </Text>
        )}
      </View>
    </ScrollView>
    <AgentChatSheet
      pageId="prediction"
      pageContext="Prediction sayfası — Polymarket tahmin piyasaları, kripto tahminleri"
    />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  title: { fontSize: 22, fontWeight: "700", letterSpacing: -0.5 },
  subtitle: { fontSize: 12, marginTop: 2 },
  refreshBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  interpBtn: {
    backgroundColor: "#00C9A7",
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
  },
  interpBtnText: { color: "#000", fontSize: 14, fontWeight: "700" },
  interpCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  interpHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  interpTitle: { flex: 1, fontSize: 12, fontWeight: "700" },
  interpText: { fontSize: 13, lineHeight: 20 },
  section: { paddingHorizontal: 16, gap: 10, paddingBottom: 20 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  cardTop: { gap: 6 },
  question: { fontSize: 13, fontWeight: "600", lineHeight: 19 },
  cardMeta: { flexDirection: "row", gap: 8, alignItems: "center" },
  volBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  volText: { fontSize: 10, color: "#8A97AD" },
  dateBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  dateText: { fontSize: 10, color: "#8A97AD" },
  oddsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  oddsLabel: { fontSize: 10, fontWeight: "700" },
  oddsValue: { fontSize: 12, fontWeight: "700" },
  barTrack: { height: 6, backgroundColor: "rgba(240,74,90,0.3)", borderRadius: 3, overflow: "hidden", marginVertical: 2 },
  barFill: { height: "100%", borderRadius: 3 },
  signalRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  signalDot: { width: 6, height: 6, borderRadius: 3 },
  signalText: { fontSize: 11 },
  emptyText: { textAlign: "center", marginTop: 40, fontSize: 14 },
  staleText: { textAlign: "center", fontSize: 11, marginTop: 8 },
});
