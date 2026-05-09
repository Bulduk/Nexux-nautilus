import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useScreenInsets } from "@/hooks/useTabBarHeight";
import { apiGet, apiPost } from "@/lib/api";
import AgentChatSheet from "@/components/AgentChatSheet";

const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT"];
const DIRECTIONS = ["LONG", "SHORT"] as const;

const AGENT_COLORS: Record<string, string> = {
  openclaw: "#00FFB2",
  mirofish: "#60A5FA",
  betafish: "#A78BFA",
  onyx: "#F59E0B",
};
const AGENT_ROLES: Record<string, string> = {
  openclaw: "executor",
  mirofish: "signals",
  betafish: "arbitrage",
  onyx: "research",
};

interface Vote {
  agentId: string;
  vote: "APPROVE" | "REJECT" | "ABSTAIN";
  confidence: string;
  reason: string;
}

interface CouncilSession {
  sessionId: string;
  symbol: string;
  direction: string;
  approve: number;
  reject: number;
  approved: boolean;
  createdAt: string;
  votes: Vote[];
}

interface HistoryResp {
  sessions: CouncilSession[];
}

function VoteCard({ vote }: { vote: Vote }) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const agentColor = AGENT_COLORS[vote.agentId] ?? "#8A97AD";
  const voteColor =
    vote.vote === "APPROVE" ? "#00FFB2" : vote.vote === "REJECT" ? "#FF4D6D" : "#F59E0B";

  return (
    <Pressable
      style={[styles.voteCard, { backgroundColor: colors.card, borderColor: `${agentColor}33` }]}
      onPress={() => setExpanded((e) => !e)}
    >
      <View style={styles.voteTop}>
        <View style={[styles.agentBadge, { backgroundColor: `${agentColor}18`, borderColor: `${agentColor}44` }]}>
          <View style={[styles.agentDot, { backgroundColor: agentColor }]} />
          <Text style={[styles.agentName, { color: agentColor }]}>{vote.agentId.toUpperCase()}</Text>
          <Text style={[styles.agentRole, { color: `${agentColor}99` }]}>
            {AGENT_ROLES[vote.agentId] ?? "agent"}
          </Text>
        </View>
        <View style={styles.voteRight}>
          <View style={[styles.voteBadge, { backgroundColor: `${voteColor}18`, borderColor: `${voteColor}55` }]}>
            <Text style={[styles.voteLabel, { color: voteColor }]}>{vote.vote}</Text>
          </View>
          <Text style={[styles.voteConf, { color: parseFloat(vote.confidence) >= 70 ? "#00FFB2" : "#F59E0B" }]}>
            {parseFloat(vote.confidence).toFixed(0)}%
          </Text>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
        </View>
      </View>
      {expanded && (
        <Text style={[styles.voteReason, { color: colors.mutedForeground }]}>{vote.reason}</Text>
      )}
    </Pressable>
  );
}

function HistoryRow({ session, colors }: { session: CouncilSession; colors: ReturnType<typeof useColors> }) {
  const [exp, setExp] = useState(false);
  const date = new Date(session.createdAt).toLocaleDateString("tr-TR", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
  const isLong = session.direction === "LONG";

  return (
    <Pressable
      onPress={() => setExp((e) => !e)}
      style={[styles.histRow, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.histTop}>
        <Text style={[styles.histSymbol, { color: colors.foreground }]}>{session.symbol}</Text>
        <View style={[styles.dirBadge, { backgroundColor: isLong ? "#00FFB218" : "#FF4D6D18" }]}>
          <Text style={[styles.dirTxt, { color: isLong ? "#00FFB2" : "#FF4D6D" }]}>{session.direction}</Text>
        </View>
        <View style={[styles.resultBadge, { backgroundColor: session.approved ? "#00FFB218" : "#FF4D6D18", borderColor: session.approved ? "#00FFB255" : "#FF4D6D55" }]}>
          <Text style={[styles.resultTxt, { color: session.approved ? "#00FFB2" : "#FF4D6D" }]}>
            {session.approved ? "ONAYLANDI" : "REDDEDİLDİ"}
          </Text>
        </View>
        <Text style={[styles.histDate, { color: colors.mutedForeground }]}>{date}</Text>
      </View>
      {exp && session.votes?.map((v) => (
        <View key={v.agentId} style={styles.histVoteRow}>
          <Text style={[styles.histAgent, { color: AGENT_COLORS[v.agentId] ?? "#8A97AD" }]}>{v.agentId}</Text>
          <Text style={[styles.histVote, { color: v.vote === "APPROVE" ? "#00FFB2" : v.vote === "REJECT" ? "#FF4D6D" : "#F59E0B" }]}>
            {v.vote}
          </Text>
          <Text style={[styles.histReason, { color: colors.mutedForeground }]} numberOfLines={2}>{v.reason}</Text>
        </View>
      ))}
    </Pressable>
  );
}

export default function CouncilScreen() {
  const colors = useColors();
  const insets = useScreenInsets();
  const qc = useQueryClient();
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [result, setResult] = useState<CouncilSession | null>(null);

  const { data: histData, refetch: refetchHist } = useQuery<HistoryResp>({
    queryKey: ["council-history"],
    queryFn: () => apiGet<HistoryResp>("/council/history?limit=10"),
    staleTime: 5000,
  });

  const voteMut = useMutation({
    mutationFn: () =>
      apiPost<CouncilSession>("/council/vote", {
        symbol,
        direction,
        context: `Mobil council oylama - ${symbol} ${direction}`,
      }),
    onSuccess: (data) => {
      setResult(data);
      refetchHist();
      qc.invalidateQueries({ queryKey: ["council-history"] });
      Haptics.notificationAsync(
        data.approved
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      );
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const sessions = histData?.sessions ?? [];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.chatSheetClearance }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Council</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          4 ajan konsensüs oylama sistemi
        </Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>Sembol</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              {SYMBOLS.map((s) => {
                const active = s === symbol;
                const base = s.replace("/USDT", "");
                return (
                  <Pressable
                    key={s}
                    onPress={() => { setSymbol(s); Haptics.selectionAsync(); }}
                    style={[styles.pill, active && styles.pillActive, !active && { borderColor: "transparent" }]}
                  >
                    <Text style={[styles.pillTxt, { color: active ? "#00FFB2" : colors.mutedForeground, fontFamily: active ? "Inter_700Bold" : "Inter_400Regular" }]}>
                      {base}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Text style={[styles.cardLabel, { color: colors.mutedForeground, marginTop: 14 }]}>Yön</Text>
          <View style={styles.dirRow}>
            {DIRECTIONS.map((d) => {
              const active = d === direction;
              const col = d === "LONG" ? "#00FFB2" : "#FF4D6D";
              return (
                <Pressable
                  key={d}
                  onPress={() => { setDirection(d); Haptics.selectionAsync(); }}
                  style={[styles.dirBtn, { backgroundColor: active ? `${col}18` : "transparent", borderColor: active ? `${col}66` : colors.border }]}
                >
                  <Feather name={d === "LONG" ? "trending-up" : "trending-down"} size={16} color={active ? col : colors.mutedForeground} />
                  <Text style={[styles.dirBtnTxt, { color: active ? col : colors.mutedForeground, fontFamily: active ? "Inter_700Bold" : "Inter_500Medium" }]}>
                    {d}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => { voteMut.mutate(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
            disabled={voteMut.isPending}
            style={[styles.voteBtn, { opacity: voteMut.isPending ? 0.6 : 1 }]}
          >
            {voteMut.isPending ? (
              <>
                <ActivityIndicator color="#000" size="small" />
                <Text style={styles.voteBtnTxt}>Ajanlar oy kullanıyor…</Text>
              </>
            ) : (
              <>
                <Feather name="users" size={16} color="#000" />
                <Text style={styles.voteBtnTxt}>Oylama Başlat</Text>
              </>
            )}
          </Pressable>

          {voteMut.isError && (
            <Text style={[styles.errTxt, { color: "#FF4D6D" }]}>
              ⚠ Hata: {(voteMut.error as Error)?.message ?? "council vote başarısız"}
            </Text>
          )}
        </View>

        {result && (
          <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: result.approved ? "#00FFB255" : "#FF4D6D55" }]}>
            <View style={styles.resultHeader}>
              <Feather name={result.approved ? "check-circle" : "x-circle"} size={20} color={result.approved ? "#00FFB2" : "#FF4D6D"} />
              <Text style={[styles.resultTitle, { color: result.approved ? "#00FFB2" : "#FF4D6D" }]}>
                {result.approved ? "ONAYLANDI" : "REDDEDİLDİ"}
              </Text>
              <Text style={[styles.resultScore, { color: colors.mutedForeground }]}>
                {result.approve} onay · {result.reject} ret · {4 - result.approve - result.reject} çekimser
              </Text>
            </View>
            <View style={styles.resultVotes}>
              {result.votes?.map((v) => <VoteCard key={v.agentId} vote={v} />)}
            </View>
          </View>
        )}

        {sessions.length > 0 && (
          <View style={styles.histSection}>
            <Text style={[styles.histTitle, { color: colors.mutedForeground }]}>GEÇMİŞ OYLAMALAR</Text>
            {sessions.map((s) => (
              <HistoryRow key={s.sessionId} session={s} colors={colors} />
            ))}
          </View>
        )}
      </ScrollView>

      <AgentChatSheet
        pageId="council"
        pageContext="Council sayfası — 4-ajan konsensüs oylama, BTC/ETH/SOL sinyal onay sistemi"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 6 },
  cardLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase" },
  pillRow: { flexDirection: "row", gap: 6, paddingVertical: 6 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  pillActive: { backgroundColor: "#00FFB218", borderColor: "#00FFB255" },
  pillTxt: { fontSize: 12 },
  dirRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  dirBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 12 },
  dirBtnTxt: { fontSize: 14, letterSpacing: 0.5 },
  voteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#00C9A7", borderRadius: 14, paddingVertical: 15, marginTop: 8 },
  voteBtnTxt: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#000" },
  errTxt: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4 },
  resultCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.07)" },
  resultTitle: { fontSize: 15, fontFamily: "Inter_700Bold", flex: 1 },
  resultScore: { fontSize: 11, fontFamily: "Inter_400Regular" },
  resultVotes: { padding: 12, gap: 8 },
  voteCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 6 },
  voteTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  agentBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, flex: 1 },
  agentDot: { width: 6, height: 6, borderRadius: 3 },
  agentName: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  agentRole: { fontSize: 9, fontFamily: "Inter_400Regular" },
  voteRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  voteBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  voteLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  voteConf: { fontSize: 13, fontFamily: "Inter_700Bold" },
  voteReason: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18, marginTop: 4 },
  histSection: { gap: 8, marginTop: 4 },
  histTitle: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5, textTransform: "uppercase" },
  histRow: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 6 },
  histTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  histSymbol: { fontSize: 13, fontFamily: "Inter_700Bold" },
  dirBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  dirTxt: { fontSize: 9, fontFamily: "Inter_700Bold" },
  resultBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  resultTxt: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  histDate: { fontSize: 10, fontFamily: "Inter_400Regular", flex: 1, textAlign: "right" },
  histVoteRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.06)", flexWrap: "wrap" },
  histAgent: { fontSize: 11, fontFamily: "Inter_700Bold", width: 72 },
  histVote: { fontSize: 11, fontFamily: "Inter_600SemiBold", width: 60 },
  histReason: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
});
