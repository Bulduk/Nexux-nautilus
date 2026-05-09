import { useAuth } from "@/lib/auth";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { usePushSettings, unregisterDeviceForPush } from "@/lib/push";
import {
  apiGet,
  apiPost,
  type RiskStatus,
  type RiskProfile,
  type ExecutionMode,
  type ModeChangeResult,
} from "@/lib/api";
import AgentChatSheet from "@/components/AgentChatSheet";

interface FieldDef {
  key: keyof RiskProfile;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

const FIELDS: FieldDef[] = [
  { key: "maxLeverage", label: "Max Leverage", unit: "x", min: 1, max: 20, step: 1 },
  { key: "maxPositionSizeUsd", label: "Max Position Size", unit: " USD", min: 10, max: 50000, step: 50 },
  { key: "maxGrossExposureUsd", label: "Max Gross Exposure", unit: " USD", min: 50, max: 500000, step: 100 },
  { key: "maxOpenPositions", label: "Max Open Positions", unit: "", min: 1, max: 50, step: 1 },
  { key: "dailyLossLimitUsd", label: "Daily Loss Limit", unit: " USD", min: 5, max: 50000, step: 5 },
  { key: "maxDrawdownPct", label: "Max Drawdown", unit: "%", min: 1, max: 100, step: 0.5 },
  { key: "minConfidenceCore", label: "Min Confidence (core)", unit: "%", min: 50, max: 100, step: 1 },
  { key: "minConfidenceExternal", label: "Min Confidence (ext)", unit: "%", min: 60, max: 100, step: 1 },
  { key: "cooldownSecPerSymbol", label: "Cooldown / symbol", unit: "s", min: 0, max: 3600, step: 5 },
  { key: "maxAtrPct", label: "Max ATR%", unit: "%", min: 0.5, max: 20, step: 0.1 },
];

interface ExecModeDef {
  id: ExecutionMode;
  label: string;
  shortLabel: string;
  desc: string;
  color: string;
  icon: string;
}

const EXEC_MODES: ExecModeDef[] = [
  {
    id: "paper",
    label: "Paper",
    shortLabel: "PAPER",
    desc: "Gerçek emir yok — tam simülasyon",
    color: "#A78BFA",
    icon: "file",
  },
  {
    id: "semi",
    label: "Semi Auto",
    shortLabel: "SEMI",
    desc: "AI sinyal üretir, sen onaylarsın",
    color: "#38BDF8",
    icon: "user-check",
  },
  {
    id: "auto_confirm",
    label: "Auto Confirm",
    shortLabel: "AUTO",
    desc: "Düşük risk otomatik, yüksek risk onay",
    color: "#F59E0B",
    icon: "zap",
  },
  {
    id: "full_auto",
    label: "Full Auto",
    shortLabel: "FULL AUTO",
    desc: "Tüm emirler AI tarafından tam otomatik",
    color: "#FF4D6D",
    icon: "activity",
  },
];

function AccountCard() {
  const colors = useColors();
  const { user, logout } = useAuth();
  const router = useRouter();

  const email = user?.email ?? "—";
  const initial = (email[0] ?? "?").toUpperCase();

  const onSignOut = () => {
    Alert.alert("Çıkış yap", "Hesabından çıkmak istiyor musun?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Çıkış",
        style: "destructive",
        onPress: async () => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          try { await unregisterDeviceForPush(); } catch { /* ignore */ }
          await logout();
        },
      },
    ]);
  };

  return (
    <View style={[ss.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[ss.sectionHeader, { borderBottomColor: colors.border }]}>
        <Feather name="user" size={14} color="#00C9A7" />
        <Text style={[ss.sectionTitle, { color: colors.foreground }]}>Hesap</Text>
      </View>
      <View style={accStyles.row}>
        <View style={accStyles.avatar}>
          <Text style={accStyles.avatarTxt}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[accStyles.email, { color: colors.foreground }]} numberOfLines={1}>
            {email}
          </Text>
          <Text style={[accStyles.hint, { color: colors.mutedForeground }]}>
            Aboneliğini web panelinden yönetebilirsin
          </Text>
        </View>
        <Pressable
          onPress={onSignOut}
          style={({ pressed }) => [
            accStyles.signOut,
            { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Feather name="log-out" size={14} color="#ff6b6b" />
          <Text style={accStyles.signOutTxt}>Çıkış</Text>
        </Pressable>
      </View>
    </View>
  );
}

const accStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#00C9A7",
    alignItems: "center", justifyContent: "center",
  },
  avatarTxt: { color: "#0b1326", fontFamily: "Inter_700Bold", fontSize: 16 },
  email: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  signOut: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
  },
  signOutTxt: { color: "#ff6b6b", fontFamily: "Inter_600SemiBold", fontSize: 12 },
});

function StepRow({ field, value, onChange }: { field: FieldDef; value: number; onChange: (v: number) => void }) {
  const colors = useColors();
  const formatted = Number.isInteger(field.step) ? value.toString() : value.toFixed(1);

  const step = (dir: 1 | -1) => {
    Haptics.selectionAsync();
    const next = Math.min(field.max, Math.max(field.min, parseFloat((value + dir * field.step).toFixed(4))));
    onChange(next);
  };

  return (
    <View style={[ss.stepRow, { borderBottomColor: colors.border }]}>
      <Text style={[ss.stepLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
      <View style={ss.stepper}>
        <Pressable onPress={() => step(-1)} style={({ pressed }) => [ss.stepBtn, { backgroundColor: colors.secondary, opacity: pressed ? 0.6 : 1 }]}>
          <Feather name="minus" size={14} color={colors.foreground} />
        </Pressable>
        <Text style={[ss.stepVal, { color: "#00FFB2", minWidth: 70, textAlign: "center" }]}>
          {formatted}{field.unit}
        </Text>
        <Pressable onPress={() => step(1)} style={({ pressed }) => [ss.stepBtn, { backgroundColor: colors.secondary, opacity: pressed ? 0.6 : 1 }]}>
          <Feather name="plus" size={14} color={colors.foreground} />
        </Pressable>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useScreenInsets();
  const qc = useQueryClient();
  const push = usePushSettings();
  const [local, setLocal] = useState<Partial<RiskProfile>>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const { data: riskStatus } = useQuery<RiskStatus>({
    queryKey: ["risk-status"],
    queryFn: () => apiGet<RiskStatus>("/risk/status"),
    refetchInterval: 10000,
  });

  const profile = riskStatus?.profile;
  const currentExecMode: ExecutionMode = riskStatus?.execution_mode ?? "paper";

  useEffect(() => {
    if (profile && Object.keys(local).length === 0) {
      setLocal({});
    }
  }, [profile]);

  const merged: Partial<RiskProfile> = { ...profile, ...local };

  const saveMutation = useMutation({
    mutationFn: (updates: Partial<RiskProfile>) => apiPost<RiskProfile>("/risk/profile", updates),
    onSuccess: () => {
      setSavedAt(Date.now());
      setLocal({});
      qc.invalidateQueries({ queryKey: ["risk-status"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const modeMutation = useMutation({
    mutationFn: (mode: ExecutionMode) =>
      apiPost<ModeChangeResult>("/risk/mode", { mode }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["risk-status"] });
      Haptics.notificationAsync(
        res.mode === "full_auto"
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success
      );
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const isDirty = Object.keys(local).length > 0;

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[ss.content, { paddingTop: insets.top + 12, paddingBottom: insets.chatSheetClearance }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[ss.title, { color: colors.foreground }]}>Settings</Text>

        <AccountCard />

        {/* ── EXECUTION MODE ─────────────────────────────────────── */}
        <View style={[ss.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[ss.sectionHeader, { borderBottomColor: colors.border }]}>
            <Feather name="zap" size={14} color="#F59E0B" />
            <Text style={[ss.sectionTitle, { color: colors.foreground }]}>Execution Mode</Text>
            {modeMutation.isPending && <ActivityIndicator size="small" color="#F59E0B" />}
          </View>
          <Text style={[ss.desc, { color: colors.mutedForeground }]}>
            Sistemin emir gönderme yetkisi. Paper'dan Full Auto'ya artıkça otomasyon artar.
          </Text>

          <View style={ss.modeGrid}>
            {EXEC_MODES.map((m) => {
              const active = currentExecMode === m.id;
              const pending = modeMutation.isPending && modeMutation.variables === m.id;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    if (active || modeMutation.isPending) return;
                    Haptics.impactAsync(
                      m.id === "full_auto"
                        ? Haptics.ImpactFeedbackStyle.Heavy
                        : Haptics.ImpactFeedbackStyle.Medium
                    );
                    modeMutation.mutate(m.id);
                  }}
                  style={[
                    ss.modeBtn,
                    {
                      borderColor: active ? `${m.color}88` : colors.border,
                      backgroundColor: active ? `${m.color}14` : colors.background,
                      opacity: modeMutation.isPending && !pending ? 0.5 : 1,
                    },
                  ]}
                >
                  {pending ? (
                    <ActivityIndicator size="small" color={m.color} />
                  ) : (
                    <Feather
                      name={m.icon as any}
                      size={16}
                      color={active ? m.color : colors.mutedForeground}
                    />
                  )}
                  <Text
                    style={[
                      ss.modeBtnLabel,
                      {
                        color: active ? m.color : colors.foreground,
                        fontFamily: active ? "Inter_700Bold" : "Inter_500Medium",
                      },
                    ]}
                  >
                    {m.shortLabel}
                  </Text>
                  {active && (
                    <View style={[ss.activeDot, { backgroundColor: m.color }]} />
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={[ss.modeDesc, { borderTopColor: colors.border }]}>
            {(() => {
              const m = EXEC_MODES.find((x) => x.id === currentExecMode);
              return m ? (
                <>
                  <Feather name={m.icon as any} size={12} color={m.color} />
                  <Text style={[ss.modeDescTxt, { color: m.color }]}>
                    <Text style={{ fontFamily: "Inter_700Bold" }}>{m.label}: </Text>
                    {m.desc}
                  </Text>
                </>
              ) : null;
            })()}
          </View>

          {modeMutation.isError && (
            <View style={[ss.modeError, { borderColor: "#FF4D6D44", backgroundColor: "#FF4D6D0A" }]}>
              <Feather name="alert-triangle" size={12} color="#FF4D6D" />
              <Text style={[ss.modeErrorTxt, { color: "#FF4D6D" }]}>
                {(modeMutation.error as Error)?.message ?? "Mod değiştirilemedi"}
              </Text>
            </View>
          )}
        </View>

        {/* ── RISK LIMİTLERİ ────────────────────────────────────── */}
        <View style={[ss.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[ss.sectionHeader, { borderBottomColor: colors.border }]}>
            <Feather name="shield" size={14} color="#00FFB2" />
            <Text style={[ss.sectionTitle, { color: colors.foreground }]}>Risk Limitleri</Text>
            {savedAt && !isDirty && (
              <Text style={[ss.savedText, { color: "#00FFB2" }]}>✓ kaydedildi</Text>
            )}
          </View>
          <Text style={[ss.desc, { color: colors.mutedForeground }]}>
            Bu limitler sunucu tarafında zorunlu kılınır. AI ajan bu sınırları aşamaz.
          </Text>

          {FIELDS.map((f) => (
            <StepRow
              key={String(f.key)}
              field={f}
              value={Number(merged[f.key] ?? f.min)}
              onChange={(v) => setLocal((l) => ({ ...l, [f.key]: v }))}
            />
          ))}

          {isDirty && (
            <Pressable
              style={({ pressed }) => [
                ss.saveBtn,
                { backgroundColor: "#00FFB2", opacity: pressed || saveMutation.isPending ? 0.7 : 1 },
              ]}
              onPress={() => saveMutation.mutate({ ...merged })}
              disabled={saveMutation.isPending}
            >
              <Text style={[ss.saveBtnText, { color: "#0b1326" }]}>
                {saveMutation.isPending ? "Kaydediliyor…" : "Sunucuya Kaydet"}
              </Text>
            </Pressable>
          )}
        </View>

        {/* ── PUSH BİLDİRİMLERİ ──────────────────────────────────── */}
        <View style={[ss.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[ss.sectionHeader, { borderBottomColor: colors.border }]}>
            <Feather name="bell" size={14} color="#A78BFA" />
            <Text style={[ss.sectionTitle, { color: colors.foreground }]}>Push Bildirimleri</Text>
            {push.token && (
              <View style={[ss.lockBadge, { borderColor: "#00FFB244", backgroundColor: "#00FFB214" }]}>
                <Feather name="check" size={10} color="#00FFB2" />
                <Text style={[ss.lockText, { color: "#00FFB2" }]}>BAĞLI</Text>
              </View>
            )}
          </View>

          {push.isWeb ? (
            <Text style={[ss.desc, { color: colors.mutedForeground }]}>
              Push bildirimleri sadece iOS/Android cihazlarda çalışır. Mobil uygulamayı indir.
            </Text>
          ) : !push.token ? (
            <View style={{ padding: 14, gap: 10 }}>
              <Text style={[ss.desc, { color: colors.mutedForeground, padding: 0 }]}>
                Sinyaller, fill'ler ve council kararları için anlık bildirim al.
              </Text>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); push.enable(); }}
                disabled={push.busy}
                style={[ss.saveBtn, { backgroundColor: "#A78BFA", margin: 0, opacity: push.busy ? 0.6 : 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 }]}
              >
                {push.busy
                  ? <ActivityIndicator size="small" color="#000" />
                  : <Feather name="bell" size={14} color="#000" />}
                <Text style={[ss.saveBtnText, { color: "#000" }]}>
                  {push.permission === "denied" ? "İzin Reddedildi — Tekrar Dene" : "Bildirimleri Etkinleştir"}
                </Text>
              </Pressable>
              {push.permission === "denied" && (
                <Text style={[ss.desc, { color: "#FF4D6D", padding: 0, fontSize: 11 }]}>
                  ⚠ Sistem ayarlarından bildirim iznini açman gerekebilir.
                </Text>
              )}
            </View>
          ) : (
            <>
              {([
                ["notifySignals", "Sinyaller", "Yeni A/A+ sinyaller", "radio"],
                ["notifyFills", "Emir Fill'leri", "Live emir gerçekleşince", "check-square"],
                ["notifyCouncil", "Council Kararları", "4-ajan onay/red", "users"],
              ] as const).map(([key, label, desc, icon]) => {
                const value = push.prefs[key];
                return (
                  <Pressable
                    key={key}
                    onPress={() => { Haptics.selectionAsync(); push.updatePref(key, !value); }}
                    style={[ss.stepRow, { borderBottomColor: colors.border }]}
                  >
                    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Feather name={icon as any} size={14} color={value ? "#00FFB2" : colors.mutedForeground} />
                      <View style={{ flex: 1 }}>
                        <Text style={[ss.stepLabel, { color: colors.foreground, flex: 0 }]}>{label}</Text>
                        <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 1 }}>{desc}</Text>
                      </View>
                    </View>
                    <View style={[styles_toggle.track, { backgroundColor: value ? "#00FFB244" : colors.border }]}>
                      <View style={[styles_toggle.thumb, { backgroundColor: value ? "#00FFB2" : colors.mutedForeground, transform: [{ translateX: value ? 18 : 0 }] }]} />
                    </View>
                  </Pressable>
                );
              })}
              <View style={[ss.stepRow, { borderBottomColor: colors.border }]}>
                <Text style={[ss.stepLabel, { color: colors.mutedForeground }]}>Sinyal Seviyesi</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {(["high_grade_only", "all"] as const).map((lv) => {
                    const active = push.prefs.signalLevel === lv;
                    return (
                      <Pressable
                        key={lv}
                        onPress={() => { Haptics.selectionAsync(); push.updatePref("signalLevel", lv); }}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: active ? "#A78BFA77" : colors.border,
                          backgroundColor: active ? "#A78BFA14" : "transparent",
                        }}
                      >
                        <Text style={{ fontSize: 10, color: active ? "#A78BFA" : colors.mutedForeground, fontFamily: active ? "Inter_700Bold" : "Inter_500Medium", letterSpacing: 0.5 }}>
                          {lv === "high_grade_only" ? "A/A+ ONLY" : "ALL"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); push.test(); }}
                disabled={push.busy}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, opacity: push.busy ? 0.6 : 1 }}
              >
                <Feather name="send" size={12} color="#A78BFA" />
                <Text style={{ color: "#A78BFA", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Test Bildirimi Gönder</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* ── EXCHANGE VAULT ────────────────────────────────────── */}
        <View style={[ss.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[ss.sectionHeader, { borderBottomColor: colors.border }]}>
            <Feather name="key" size={14} color="#00FFB2" />
            <Text style={[ss.sectionTitle, { color: colors.foreground }]}>Exchange Vault</Text>
          </View>
          {[
            ["Binance", "BINANCE_API_KEY"],
            ["Bybit", "BYBIT_API_KEY"],
            ["OKX", "OKX_API_KEY"],
            ["KuCoin", "KUCOIN_API_KEY"],
            ["Kraken", "KRAKEN_API_KEY"],
          ].map(([name]) => (
            <View key={name} style={[ss.exchangeRow, { borderBottomColor: colors.border }]}>
              <Text style={[ss.exName, { color: colors.foreground }]}>{name}</Text>
              <View style={[ss.lockBadge, { borderColor: colors.border }]}>
                <Feather name="lock" size={11} color={colors.mutedForeground} />
                <Text style={[ss.lockText, { color: colors.mutedForeground }]}>Replit Secrets</Text>
              </View>
            </View>
          ))}
          <Text style={[ss.vaultNote, { color: colors.mutedForeground }]}>
            Replit → Secrets bölümüne {"{EXCHANGE}_API_KEY"} formatında ekle.
          </Text>
        </View>

        {/* ── SİSTEM BİLGİSİ ────────────────────────────────────── */}
        <View style={[ss.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[ss.sectionHeader, { borderBottomColor: colors.border }]}>
            <Feather name="info" size={14} color={colors.mutedForeground} />
            <Text style={[ss.sectionTitle, { color: colors.foreground }]}>Sistem Bilgisi</Text>
          </View>
          {[
            ["Versiyon", "v5.0.0"],
            ["Backend", "Express 5 + CCXT 4.5"],
            ["AI Modeli", "claude-sonnet-4-6"],
            ["Veri Kaynağı", "KuCoin (genel)"],
            ["PolicyGuard", "11 kontrol aktif"],
            ["Ledger", "JSONL kalıcı append-only"],
          ].map(([label, val]) => (
            <View key={label} style={[ss.infoRow, { borderBottomColor: colors.border }]}>
              <Text style={[ss.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
              <Text style={[ss.infoVal, { color: colors.foreground }]}>{val}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <AgentChatSheet
        pageId="settings"
        pageContext="Settings sayfası — execution mode, risk limitleri, exchange vault"
      />
    </View>
  );
}

const ss = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  section: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  savedText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  desc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18, paddingHorizontal: 14, paddingVertical: 10 },
  modeGrid: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  modeBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
    gap: 6,
  },
  modeBtnLabel: { fontSize: 10, letterSpacing: 0.5 },
  activeDot: { width: 4, height: 4, borderRadius: 2 },
  modeDesc: { flexDirection: "row", gap: 8, alignItems: "flex-start", padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  modeDescTxt: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 15 },
  modeError: { flexDirection: "row", gap: 8, padding: 12, borderWidth: 1, margin: 12, borderRadius: 10 },
  modeErrorTxt: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  stepRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  stepLabel: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  stepVal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  saveBtn: { margin: 14, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  saveBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  exchangeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  exName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  lockBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  lockText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  vaultNote: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16, padding: 14 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoVal: { fontSize: 13, fontFamily: "Inter_500Medium" },
});

const styles_toggle = StyleSheet.create({
  track: { width: 38, height: 20, borderRadius: 10, padding: 1, justifyContent: "center" },
  thumb: { width: 18, height: 18, borderRadius: 9 },
});
