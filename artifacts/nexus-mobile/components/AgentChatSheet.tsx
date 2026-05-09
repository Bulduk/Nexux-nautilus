import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import React, { useCallback, useRef, useState } from "react";
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
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { apiPost } from "@/lib/api";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const CRITICAL_KW = ["arm", "kill", "emir gönder", "live fill", "gerçek para", "sil", "delete", "reset", "flatten", "disarm"];

function isCritical(text: string) {
  const low = text.toLowerCase();
  return CRITICAL_KW.some((k) => low.includes(k));
}

interface Props {
  pageId: string;
  pageContext: string;
}

export default function AgentChatSheet({ pageId, pageContext }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const open = () => {
    if (msgs.length === 0) {
      setMsgs([
        {
          role: "assistant",
          content: `NEXUS.PRIME > Bağlandı · ${pageId.toUpperCase()}\n\nSayfa: ${pageContext}\n\nNe yapmamı istersin?`,
        },
      ]);
    }
    setVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const scrollToEnd = () =>
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: Msg = { role: "user", content: text };
    const updated = [...msgs, userMsg];
    setMsgs(updated);
    setInput("");
    setSending(true);
    scrollToEnd();

    try {
      const apiMsgs = updated.map((m, i) => ({
        role: m.role,
        content:
          i === 0 && m.role === "user"
            ? `[SAYFA: ${pageContext}] ${m.content}`
            : m.role === "user" && i === updated.length - 1
            ? `[SAYFA: ${pageContext}] ${m.content}`
            : m.content,
      }));

      const res = await apiPost<{ content: [{ text: string }] }>("/chat", {
        messages: apiMsgs
          .filter((m) => !m.content.startsWith("NEXUS.PRIME > Bağlandı"))
          .slice(-10),
        agent_id: "nexus_prime",
      });

      const reply = res.content?.[0]?.text ?? "—";
      setMsgs((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setMsgs((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ Bağlantı hatası: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setSending(false);
      scrollToEnd();
    }
  }, [input, msgs, pageContext, sending]);

  const fabBottom = insets.bottom + 72;

  return (
    <>
      <View style={[styles.fabWrap, { bottom: fabBottom }]} pointerEvents="box-none">
        <Pressable style={styles.fab} onPress={open}>
          <Feather name="zap" size={18} color="#000" />
        </Pressable>
      </View>

      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : "overFullScreen"}
        onRequestClose={() => setVisible(false)}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          {Platform.OS === "ios" ? (
            <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "#070B14" }]} />
          )}

          <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.handle} />

            <View style={styles.header}>
              <View style={styles.pageTag}>
                <Feather name="zap" size={9} color="#00C9A7" />
                <Text style={styles.pageTagTxt}>{pageId}</Text>
              </View>
              <Text style={styles.title}>NEXUS PRIME</Text>
              <Pressable
                onPress={() => setVisible(false)}
                style={styles.closeBtn}
                hitSlop={12}
              >
                <Feather name="x" size={16} color="#6B7280" />
              </Pressable>
            </View>

            <ScrollView
              ref={scrollRef}
              style={styles.msgList}
              contentContainerStyle={styles.msgContent}
              onLayout={scrollToEnd}
              keyboardShouldPersistTaps="handled"
            >
              {msgs.map((m, i) => {
                const critical = m.role === "assistant" && isCritical(m.content);
                return (
                  <View
                    key={i}
                    style={[
                      styles.bubble,
                      m.role === "user" ? styles.bubbleUser : styles.bubbleAI,
                      critical && styles.bubbleCritical,
                    ]}
                  >
                    {critical && (
                      <View style={styles.criticalRow}>
                        <Feather name="alert-triangle" size={10} color="#F59E0B" />
                        <Text style={styles.criticalTxt}>Kritik işlem — manuel onayla</Text>
                      </View>
                    )}
                    <Text
                      style={[
                        styles.bubbleTxt,
                        { color: m.role === "user" ? "#00C9A7" : "#E2E8F0" },
                      ]}
                    >
                      {m.content}
                    </Text>
                  </View>
                );
              })}
              {sending && (
                <View style={[styles.bubble, styles.bubbleAI]}>
                  <ActivityIndicator size="small" color="#00C9A7" />
                </View>
              )}
            </ScrollView>

            <View style={styles.inputRow}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={`${pageContext} hakkında sor…`}
                placeholderTextColor="#374151"
                onSubmitEditing={send}
                returnKeyType="send"
                style={styles.input}
                multiline={false}
              />
              <Pressable
                style={[styles.sendBtn, { opacity: !input.trim() || sending ? 0.4 : 1 }]}
                onPress={send}
                disabled={!input.trim() || sending}
              >
                <Feather name="send" size={15} color="#000" />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fabWrap: {
    position: "absolute",
    right: 16,
    zIndex: 99,
    pointerEvents: "box-none",
  } as any,
  fab: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#00C9A7",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#00C9A7",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  sheet: {
    flex: 1,
    paddingTop: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
    gap: 8,
  },
  pageTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,201,167,0.12)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(0,201,167,0.2)",
  },
  pageTagTxt: {
    fontSize: 9,
    color: "#00C9A7",
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#E2E8F0",
    letterSpacing: 0.5,
  },
  closeBtn: { padding: 4 },
  msgList: { flex: 1 },
  msgContent: { padding: 14, gap: 10 },
  bubble: {
    maxWidth: "86%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(0,201,167,0.1)",
    borderColor: "rgba(0,201,167,0.25)",
  },
  bubbleAI: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.09)",
  },
  bubbleCritical: {
    borderColor: "rgba(245,158,11,0.35)",
    backgroundColor: "rgba(245,158,11,0.07)",
  },
  criticalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 7,
  },
  criticalTxt: {
    fontSize: 9,
    color: "#F59E0B",
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  bubbleTxt: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
  },
  inputRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  input: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#E2E8F0",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#00C9A7",
    alignItems: "center",
    justifyContent: "center",
  },
});
