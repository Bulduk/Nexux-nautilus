import React from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
  type ViewStyle,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { useScreenInsets } from "@/hooks/useTabBarHeight";

interface ScreenProps {
  /** Sayfa başlığı (header solunda görünür). Boş geçilirse header gizlenir. */
  title?: string;
  /** Header'ın sağına eklenecek ek içerik (canlı dot, butonlar vs) */
  headerRight?: React.ReactNode;
  /** Scroll içeriği. Eğer FlatList/FlashList kullanıyorsan `scroll={false}` ver, contentBottom'u kendin uygula. */
  children: React.ReactNode;
  /** Scroll'u kapat (FlatList vb. kendi scroll yönetiyor). */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** İçerik padding override */
  contentStyle?: ViewStyle;
  /** AgentChatSheet veya benzer alt overlay var mı? Padding bu boşluğu hesaba katar. */
  hasFloatingChat?: boolean;
  scrollProps?: Omit<ScrollViewProps, "contentContainerStyle" | "refreshControl">;
}

export function Screen({
  title,
  headerRight,
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
  contentStyle,
  hasFloatingChat = false,
  scrollProps,
}: ScreenProps) {
  const colors = useColors();
  const insets = useScreenInsets();
  const bottomPad = hasFloatingChat ? insets.chatSheetClearance : insets.contentBottom;

  const header = title ? (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + 12, borderBottomColor: colors.border },
      ]}
    >
      <Text
        style={[
          styles.title,
          { color: colors.foreground, fontFamily: "Inter_700Bold" },
        ]}
      >
        {title}
      </Text>
      {headerRight}
    </View>
  ) : null;

  if (!scroll) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {header}
        <View style={[styles.flex, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {header}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomPad },
          contentStyle,
        ]}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00FFB2" />
          ) : undefined
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        {...scrollProps}
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** FlatList/FlashList kullanan ekranlar için — Screen wrapper'ın header'ını + bottom padding'ini sağlar. */
export function ScreenList({
  title,
  headerRight,
  hasFloatingChat = true,
  children,
}: Pick<ScreenProps, "title" | "headerRight" | "hasFloatingChat" | "children">) {
  const colors = useColors();
  const insets = useScreenInsets();
  const bottomPad = hasFloatingChat ? insets.chatSheetClearance : insets.contentBottom;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {title ? (
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + 12, borderBottomColor: colors.border },
          ]}
        >
          <Text
            style={[
              styles.title,
              { color: colors.foreground, fontFamily: "Inter_700Bold" },
            ]}
          >
            {title}
          </Text>
          {headerRight}
        </View>
      ) : null}
      <View style={styles.flex}>
        {/* children'a bottomPad'i prop olarak geçer */}
        {React.isValidElement(children)
          ? React.cloneElement(children as React.ReactElement<{ bottomPad?: number }>, { bottomPad })
          : children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 22 },
  content: { paddingHorizontal: 16, paddingTop: 12, gap: 14 },
});
