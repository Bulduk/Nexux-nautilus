import React, { useEffect, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { onPaywall, type PaywallDetail } from "@/lib/api";

const ACCENT = "#00C9A7";

function buildBillingUrl(): string {
  const domain = (process.env["EXPO_PUBLIC_DOMAIN"] as string | undefined) ?? "";
  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  return `${base}/?tab=billing`;
}

export default function PaywallSheet() {
  const [detail, setDetail] = useState<PaywallDetail | null>(null);

  useEffect(() => {
    const unsub = onPaywall((d) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setDetail(d);
    });
    return unsub;
  }, []);

  if (!detail) return null;

  const close = () => setDetail(null);
  const upgrade = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void Linking.openURL(buildBillingUrl());
    setDetail(null);
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={close}>
      <Pressable style={s.backdrop} onPress={close}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <View style={s.header}>
            <Feather
              name={detail.trialExpired ? "clock" : "lock"}
              size={14}
              color={ACCENT}
            />
            <Text style={s.tag}>
              {detail.trialExpired ? "DENEME BİTTİ" : "PLAN GEREKLİ"}
            </Text>
          </View>

          <Text style={s.title}>
            {detail.trialExpired
              ? "Devam etmek için bir plan seç"
              : `${detail.requiredTier} planı gerekli`}
          </Text>

          <Text style={s.body}>{detail.message}</Text>

          <View style={s.tierRow}>
            <View style={[s.chip, s.chipMuted]}>
              <Text style={s.chipMutedTxt}>Şu an: {detail.currentTier}</Text>
            </View>
            <Text style={s.arrow}>→</Text>
            <View style={[s.chip, s.chipAccent]}>
              <Text style={s.chipAccentTxt}>Hedef: {detail.requiredTier}</Text>
            </View>
          </View>

          <View style={s.actions}>
            <Pressable
              onPress={close}
              style={({ pressed }) => [s.btn, s.btnGhost, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={s.btnGhostTxt}>Vazgeç</Text>
            </Pressable>
            <Pressable
              onPress={upgrade}
              style={({ pressed }) => [s.btn, s.btnPrimary, { opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={s.btnPrimaryTxt}>Planları Gör</Text>
              <Feather name="external-link" size={12} color="#0b1326" />
            </Pressable>
          </View>

          <Text style={s.hint}>
            Aboneliği web tarayıcında güvenle tamamlayabilirsin
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(2,6,12,0.78)",
    justifyContent: "flex-end",
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 32 : 24,
  },
  sheet: {
    backgroundColor: "#0b1326",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: ACCENT,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  tag: { color: ACCENT, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.5 },
  title: { color: "#e6edf3", fontFamily: "Inter_700Bold", fontSize: 18, marginBottom: 8 },
  body: { color: "#8b95a8", fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, marginBottom: 14 },
  tierRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  chipMuted: { borderColor: "#1a2438" },
  chipMutedTxt: { color: "#e6edf3", fontFamily: "Inter_600SemiBold", fontSize: 11 },
  chipAccent: { borderColor: ACCENT },
  chipAccentTxt: { color: ACCENT, fontFamily: "Inter_700Bold", fontSize: 11 },
  arrow: { color: "#8b95a8", fontFamily: "Inter_400Regular", fontSize: 13 },
  actions: { flexDirection: "row", gap: 10 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  btnGhost: { borderWidth: 1, borderColor: "#1a2438" },
  btnGhostTxt: { color: "#8b95a8", fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase" },
  btnPrimary: { backgroundColor: ACCENT },
  btnPrimaryTxt: { color: "#0b1326", fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase" },
  hint: { color: "#566", fontFamily: "Inter_400Regular", fontSize: 10, textAlign: "center", marginTop: 12 },
});
