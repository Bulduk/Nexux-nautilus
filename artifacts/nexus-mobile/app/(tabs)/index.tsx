import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Animated,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useScreenInsets } from "@/hooks/useTabBarHeight";
import {
  apiGet,
  apiPost,
  type RiskStatus,
  type OhlcvResp,
  type ExecutionMode,
  type ModeChangeResult,
} from "@/lib/api";
import SparklineChart from "@/components/SparklineChart";
import { TickerSkeleton } from "@/components/SkeletonLoader";

interface Msg {
  role: "user" | "assistant";
  ts: number;
  content: string;
}

const BOOT_MSG =
  `NEXUS.PRIME > Sistem online. Merhaba.\n\nModeller: OpenClaw · Mirofish · Betafish · Onyx\nVeri: KuCoin (public) + Binance (private)\nCouncil: 4-ajan konsensüs aktif\n\nKomutlar: [SCAN] [ROUTE] [REPORT] [COUNCIL] [RISK]\nTürkçe veya İngilizce konuşabilirsin.`;

const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"];

const EXEC_MODE_CONFIG: Record<ExecutionMode, { label: string; color: string; icon: string; desc: string }> = {
  paper:        { label: "PAPER",     color: "#A78BFA", icon: "file",       desc: "Simülasyon modu" },
  semi:         { label: "SEMI",      color: "#38BDF8", icon: "user-check", desc: "Manuel onay gerekli" },
  auto_confirm: { label: "AUTO",      color: "#F59E0B", icon: "zap",        desc: "Düşük risk otomatik" },
  full_auto:    { label: "FULL AUTO", color: "#FF4D6D", icon: "activity",   desc: "Tam otomatik trading" },
};

function useTicker(symbol: string) {
  return useQuery<OhlcvResp>({
    queryKey: ["ohlcv-spark", symbol],
    queryFn: () =>
      apiGet<OhlcvResp>(`/markets/ohlcv?symbol=${encodeURIComponent(symbol)}&timeframe=15m&limit=24`),
    refetchInterval: 5000,
    staleTime: 4000,
  });
}

function LiveDot() {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.5, duration: 600, useNativeDriver: false }),
        Animated.timing(scale, { toValue: 1, duration: 600, useNativeDriver: false }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [scale]);
  return (
    <Animated.View
      style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#00FFB2", transform: [{ scale }] }}
    />
  );
}

function TickerCard({ symbol }: { symbol: string }) {
  const colors = useColors();
  const { data, isLoading } = useTicker(symbol);
  if (isLoading) return <TickerSkeleton />;
  const candles = data?.candles ?? [];
  const prices = candles.map((c) => c.close);
  const last = candles[candles.length - 1];
  const first = candles[0];
  const price = last?.close ?? 0;
  const change = last && first ? ((last.close - first.open) / first.open) * 100 : 0;
  const isUp = change >= 0;
  const base = symbol.replace("/USDT", "");
  const trendColor = isUp ? "#00FFB2" : "#FF4D6D";
  return (
    <View style={[styles.tickerCard, { backgroundColor: colors.card, borderColor: `${trendColor}33` }]}>
      <View style={styles.tickerTop}>
        <Text style={[styles.tickerSym, { color: colors.mutedForeground }]}>{base}</Text>
        <View style={[styles.changePill, { backgroundColor: `${trendColor}18` }]}>
          <Feather name={isUp ? "trending-up" : "trending-down"} size={9} color={trendColor} />
          <Text style={[styles.tickerChange, { color: trendColor }]}>
            {isUp ? "+" : ""}{change.toFixed(2)}%
          </Text>
        </View>
      </View>
      <Text style={[styles.tickerPrice, { color: colors.foreground }]}>
        {price > 0
          ? `$${price.toLocaleString(undefined, { maximumFractionDigits: price > 100 ? 0 : price > 1 ? 2 : 4 })}`
          : "—"}
      </Text>
      <SparklineChart data={prices} width={70} height={28} color={trendColor} strokeWidth={1.5} />
    </View>
  );
}

function ModeSwitcherModal({
  visible,
  onClose,
  current,
}: {
  visible: boolean;
  onClose: () => void;
  current: ExecutionMode;
}) {
  const colors = useColors();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();

  const modeMutation = useMutation({
    mutationFn: (mode: ExecutionMode) =>
      apiPost<ModeChangeResult>("/risk/mode", { mode }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["risk-status"] });
      onClose();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={ms.overlay}>
        <Pressable style={ms.backdrop} onPress={onClose} />
        <View style={[ms.panel, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
          <View style={[ms.header, { borderBottomColor: colors.border }]}>
            <Feather name="zap" size={14} color="#F59E0B" />
            <Text style={[ms.title, { color: colors.foreground }]}>Execution Mode Seç</Text>
            <Pressable onPress={onClose}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
          {(Object.entries(EXEC_MODE_CONFIG) as [ExecutionMode, typeof EXEC_MODE_CONFIG[ExecutionMode]][]).map(([id, cfg]) => {
            const active = current === id;
            const pending = modeMutation.isPending && modeMutation.variables === id;
            return (
              <Pressable
                key={id}
                onPress={() => {
                  if (active || modeMutation.isPending) return;
                  Haptics.impactAsync(
                    id === "full_auto"
                      ? Haptics.ImpactFeedbackStyle.Heavy
                      : Haptics.ImpactFeedbackStyle.Medium
                  );
                  modeMutation.mutate(id);
                }}
                style={[
                  ms.row,
                  { borderBottomColor: colors.border },
                  active && { backgroundColor: `${cfg.color}0A` },
                  modeMutation.isPending && !pending && { opacity: 0.5 },
                ]}
              >
                <View style={[ms.iconBox, { backgroundColor: `${cfg.color}18` }]}>
                  {pending ? (
                    <ActivityIndicator size="small" color={cfg.color} />
                  ) : (
                    <Feather name={cfg.icon as any} size={16} color={cfg.color} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[ms.rowLabel, { color: active ? cfg.color : colors.foreground, fontFamily: active ? "Inter_700Bold" : "Inter_500Medium" }]}>
                    {cfg.label}
                  </Text>
                  <Text style={[ms.rowDesc, { color: colors.mutedForeground }]}>{cfg.desc}</Text>
                </View>
                {active && <Feather name="check-circle" size={16} color={cfg.color} />}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const ms = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  panel: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 13 },
  rowDesc: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
});

export default function NexusScreen() {
  const colors = useColors();
  const screenInsets = useScreenInsets();
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", ts: Date.now(), content: BOOT_MSG },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const topPad = screenInsets.top;

  const { data: riskStatus } = useQuery<RiskStatus>({
    queryKey: ["risk-status"],
    queryFn: () => apiGet<RiskStatus>("/risk/status"),
    refetchInterval: 8000,
  });

  const profile = riskStatus?.profile;
  const isKilled = profile?.killSwitchEngaged ?? false;
  const executionMode: ExecutionMode = riskStatus?.execution_mode ?? "paper";
  const modeCfg = EXEC_MODE_CONFIG[isKilled ? "full_auto" : executionMode];
  const modeColor = isKilled ? "#FF4D6D" : modeCfg.color;
  const modeLabel = isKilled ? "KILLED" : modeCfg.label;

  const scrollToEnd = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  useEffect(() => { scrollToEnd(); }, [msgs]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    const userMsg: Msg = { role: "user", ts: Date.now(), content: text };
    const newMsgs = [...msgs, userMsg];
    setMsgs(newMsgs);
    setInput("");
    setSending(true);
    Haptics.selectionAsync();
    try {
      const res = await apiPost<{ content: [{ text: string }] }>("/chat", {
        messages: newMsgs.slice(-12).map((m) => ({ role: m.role, content: m.content })),
        agent_id: "nexus_prime",
      });
      const reply = res.content?.[0]?.text ?? "—";
      setMsgs((prev) => [...prev, { role: "assistant", ts: Date.now(), content: reply }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setMsgs((prev) => [
        ...prev,
        { role: "assistant", ts: Date.now(), content: `⚠️ ${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, msgs, sending]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.brand, { color: "#00C9A7" }]}>NEXUS PRIME</Text>
          <Text style={[styles.brandSub, { color: colors.mutedForeground }]}>Supervisor AI · v5</Text>
        </View>
        <View style={styles.topRight}>
          <Pressable
            onPress={() => {
              if (isKilled) return;
              Haptics.selectionAsync();
              setModeOpen(true);
            }}
            style={[styles.modePill, { borderColor: `${modeColor}55`, backgroundColor: `${modeColor}18` }]}
          >
            <LiveDot />
            <Text style={[styles.modeTxt, { color: modeColor }]}>{modeLabel}</Text>
            {!isKilled && <Feather name="chevron-down" size={10} color={modeColor} />}
          </Pressable>
          <Pressable
            style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => { setMsgs([{ role: "assistant", ts: Date.now(), content: BOOT_MSG }]); Haptics.selectionAsync(); }}
          >
            <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tickerRow, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.tickerContent}
      >
        {SYMBOLS.map((s) => <TickerCard key={s} symbol={s} />)}
      </ScrollView>

      <View style={[styles.agentsBar, { borderBottomColor: colors.border }]}>
        {[
          { id: "openclaw", label: "OpenClaw", color: "#00FFB2" },
          { id: "mirofish", label: "Mirofish", color: "#60A5FA" },
          { id: "betafish", label: "Betafish", color: "#A78BFA" },
          { id: "onyx", label: "Onyx", color: "#F59E0B" },
        ].map((a) => (
          <View key={a.id} style={[styles.agentChip, { backgroundColor: `${a.color}14`, borderColor: `${a.color}33` }]}>
            <View style={[styles.agentDot, { backgroundColor: a.color }]} />
            <Text style={[styles.agentLabel, { color: a.color }]}>{a.label}</Text>
          </View>
        ))}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.chatArea}>
        <ScrollView
          ref={scrollRef}
          style={styles.msgList}
          contentContainerStyle={[styles.msgContent, { paddingBottom: 16 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {msgs.map((m, i) => (
            <View key={i} style={[styles.bubble, m.role === "user" ? styles.bubbleUser : styles.bubbleAI]}>
              {m.role === "assistant" && <Text style={styles.bubbleFrom}>NEXUS.PRIME</Text>}
              <Text style={[styles.bubbleTxt, { color: m.role === "user" ? "#00C9A7" : "#CBD5E1" }]}>
                {m.content}
              </Text>
              <Text style={styles.bubbleTs}>
                {new Date(m.ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          ))}
          {sending && (
            <View style={[styles.bubble, styles.bubbleAI]}>
              <Text style={styles.bubbleFrom}>NEXUS.PRIME</Text>
              <View style={styles.typingRow}>
                <ActivityIndicator size="small" color="#00C9A7" />
                <Text style={styles.typingTxt}>işleniyor…</Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={[styles.inputArea, { borderTopColor: colors.border, paddingBottom: screenInsets.bottom + 4 }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
            {["[SCAN] BTC", "[SCAN] ETH", "[REPORT]", "[COUNCIL]", "[RISK]"].map((cmd) => (
              <Pressable
                key={cmd}
                style={[styles.quickBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={() => { setInput(cmd + " "); inputRef.current?.focus(); Haptics.selectionAsync(); }}
              >
                <Text style={[styles.quickBtnTxt, { color: colors.mutedForeground }]}>{cmd}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              value={input}
              onChangeText={setInput}
              placeholder="NEXUS PRIME'a komut ver…"
              placeholderTextColor={colors.mutedForeground}
              onSubmitEditing={send}
              returnKeyType="send"
              blurOnSubmit={false}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              multiline
            />
            <Pressable
              style={[styles.sendBtn, { opacity: !input.trim() || sending ? 0.4 : 1 }]}
              onPress={send}
              disabled={!input.trim() || sending}
            >
              {sending ? <ActivityIndicator size="small" color="#000" /> : <Feather name="send" size={16} color="#000" />}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <ModeSwitcherModal
        visible={modeOpen}
        onClose={() => setModeOpen(false)}
        current={executionMode}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  brand: { fontSize: 17, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  brandSub: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  topRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  modePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  modeTxt: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  iconBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  tickerRow: { borderBottomWidth: StyleSheet.hairlineWidth, maxHeight: 90 },
  tickerContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tickerCard: { width: 96, borderRadius: 12, borderWidth: 1, padding: 10, gap: 4 },
  tickerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tickerSym: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  changePill: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  tickerChange: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  tickerPrice: { fontSize: 12, fontFamily: "Inter_700Bold" },
  agentsBar: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  agentChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  agentDot: { width: 5, height: 5, borderRadius: 3 },
  agentLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },
  chatArea: { flex: 1 },
  msgList: { flex: 1 },
  msgContent: { padding: 14, gap: 12 },
  bubble: { maxWidth: "88%", borderRadius: 14, borderWidth: 1, padding: 12, gap: 4 },
  bubbleAI: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: "rgba(0,201,167,0.1)", borderColor: "rgba(0,201,167,0.2)" },
  bubbleFrom: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#00C9A7", letterSpacing: 1, marginBottom: 2 },
  bubbleTxt: { fontSize: 13, lineHeight: 20, fontFamily: "Inter_400Regular" },
  bubbleTs: { fontSize: 9, color: "#374151", fontFamily: "Inter_400Regular", marginTop: 2 },
  typingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  typingTxt: { fontSize: 12, color: "#6B7280", fontFamily: "Inter_400Regular" },
  inputArea: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, paddingHorizontal: 12, gap: 8 },
  quickRow: { gap: 6 },
  quickBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  quickBtnTxt: { fontSize: 10, fontFamily: "Inter_500Medium" },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  input: { flex: 1, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular", maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#00C9A7", alignItems: "center", justifyContent: "center" },
});
