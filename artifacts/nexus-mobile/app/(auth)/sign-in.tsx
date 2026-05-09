import { useAuth } from "@/lib/auth";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function SignInScreen() {
  const { login, isLoading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    void Haptics.selectionAsync();
    setBusy(true);
    try {
      await login();
      router.replace("/(tabs)");
    } catch (e: any) {
      console.error("Login error:", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <View style={styles.logoBadge}>
            <Feather name="zap" size={28} color="#0b1326" />
          </View>
          <Text style={styles.title}>Nexus</Text>
          <Text style={styles.subtitle}>Multi-agent kripto trading</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hesabına giriş yap</Text>
          <Text style={styles.hint}>
            Replit hesabınla giriş yap. Güvenli OIDC/PKCE kimlik doğrulama.
          </Text>

          <Pressable
            onPress={handleLogin}
            disabled={busy || isLoading}
            style={({ pressed }) => [
              styles.cta,
              (busy || isLoading) && styles.ctaDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            {busy || isLoading ? (
              <ActivityIndicator color="#0b1326" />
            ) : (
              <>
                <Feather name="log-in" size={16} color="#0b1326" />
                <Text style={styles.ctaText}>Replit ile Giriş Yap</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#0b1326" },
  scroll: { padding: 24, paddingBottom: 48 },
  brand: { alignItems: "center", marginBottom: 32 },
  logoBadge: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: "#00C9A7",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  title: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  subtitle: { color: "#8e9192", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  card: {
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", gap: 16,
  },
  cardTitle: { color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold" },
  hint: { color: "#9aa3b2", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  cta: {
    backgroundColor: "#00C9A7", borderRadius: 12, paddingVertical: 14,
    alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: "#0b1326", fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
});
