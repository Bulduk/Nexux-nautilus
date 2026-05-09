import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isLiquidGlassAvailable } from "expo-glass-effect";

/**
 * Tutarlı tab bar yüksekliği. NativeTabs (iOS liquid glass), ClassicTabs
 * (iOS blur / Android / web) ve safe-area inset'lerini birleştirir.
 *
 * `bottom`: ScrollView/FlatList contentContainerStyle.paddingBottom için
 *           kullan — tab bar içeriği örtmesin diye.
 * `top`:    Header padding'i için (status bar + notch).
 * `chatSheetClearance`: Eğer ekranda alt sticky element (AgentChatSheet
 *           floating button gibi) varsa, ek alan bırakmak için.
 */
export function useScreenInsets() {
  const safe = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";

  // Tab bar görünür yüksekliği:
  //  - Web (ClassicTabs height: 84)
  //  - iOS NativeTabs (~49) veya ClassicTabs (~49 + safe.bottom)
  //  - Android ClassicTabs (~58)
  const usingNativeTabs = isIOS && isLiquidGlassAvailable();
  const tabBarHeight = isWeb
    ? 84
    : usingNativeTabs
      ? 49 + safe.bottom
      : isIOS
        ? 49 + safe.bottom
        : 58 + Math.max(safe.bottom - 8, 0);

  return {
    top: isWeb ? 0 : safe.top,
    bottom: tabBarHeight,
    /** AgentChatSheet floating button + tab bar ek boşluk */
    chatSheetClearance: tabBarHeight + 80,
    /** Genel kullanım: scroll içeriklerin alt padding'i */
    contentBottom: tabBarHeight + 16,
    safe,
  };
}
