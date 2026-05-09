import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useScreenInsets } from "@/hooks/useTabBarHeight";
import { apiGet, type LedgerEntry } from "@/lib/api";

const TYPE_COLORS: Record<string, string> = {
  signal: "#adc9eb",
  intent: "#f59e0b",
  guard: "#a78bfa",
  order_submitted: "#67e8f9",
  order_rejected: "#FF4D6D",
  fill: "#00FFB2",
  close: "#d1d5db",
  kill: "#FF4D6D",
  note: "#6b7280",
};

const ALL_TYPES = Object.keys(TYPE_COLORS);

function EntryRow({ entry }: { entry: LedgerEntry }) {
  const colors = useColors();
  const typeColor = TYPE_COLORS[entry.type] ?? colors.mutedForeground;
  const isLive = entry.mode === "live";

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={styles.rowLeft}>
        <View style={styles.rowTop}>
          <View style={[styles.typeBadge, { backgroundColor: `${typeColor}22` }]}>
            <Text style={[styles.typeText, { color: typeColor, fontFamily: "Inter_600SemiBold" }]}>
              {entry.type.replace("_", " ").toUpperCase()}
            </Text>
          </View>
          {entry.mode && (
            <View style={[styles.modeBadge, { backgroundColor: isLive ? "#FF4D6D18" : "#f59e0b18" }]}>
              <Text style={[styles.modeText, { color: isLive ? "#FF4D6D" : "#f59e0b", fontFamily: "Inter_500Medium" }]}>{entry.mode}</Text>
            </View>
          )}
          {entry.symbol && (
            <Text style={[styles.symbol, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{entry.symbol}</Text>
          )}
        </View>
        <Text style={[styles.detail, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={2}>
          {entry.detail}
        </Text>
        {entry.intentId && (
          <Text style={[styles.intentId, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            #{entry.intentId.slice(0, 14)}
          </Text>
        )}
      </View>
      <Text style={[styles.time, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </Text>
    </View>
  );
}

export default function LedgerScreen() {
  const colors = useColors();
  const insets = useScreenInsets();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { data } = useQuery<{ entries: LedgerEntry[] }>({
    queryKey: ["ledger"],
    queryFn: () => apiGet<{ entries: LedgerEntry[] }>("/ledger?limit=200"),
    refetchInterval: 4000,
  });

  const allEntries = data?.entries ?? [];
  const filtered = filter ? allEntries.filter((e) => e.type === filter) : allEntries;
  const activeTypes = Array.from(new Set(allEntries.map((e) => e.type)));

  const onRefresh = async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ["ledger"] });
    setRefreshing(false);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Ledger</Text>
        <Text style={[styles.count, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{filtered.length} entries</Text>
      </View>

      <View style={[styles.filterContainer, { borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <Pressable
            onPress={() => setFilter(null)}
            style={[styles.filterChip, { backgroundColor: !filter ? "#00FFB218" : "transparent", borderColor: !filter ? "#00FFB266" : colors.border }]}
          >
            <Text style={[styles.filterText, { color: !filter ? "#00FFB2" : colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>ALL</Text>
          </Pressable>
          {activeTypes.map((type) => {
            const active = filter === type;
            const col = TYPE_COLORS[type] ?? colors.mutedForeground;
            return (
              <Pressable
                key={type}
                onPress={() => setFilter(active ? null : type)}
                style={[styles.filterChip, { backgroundColor: active ? `${col}22` : "transparent", borderColor: active ? `${col}66` : colors.border }]}
              >
                <Text style={[styles.filterText, { color: active ? col : colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  {type.replace("_", " ").toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <EntryRow entry={item} />}
        contentContainerStyle={[styles.list, { paddingBottom: insets.contentBottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00FFB2" />}
        scrollEnabled={!!filtered.length}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="file-text" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Kayıt yok</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Sinyal ve emirler burada görünecek
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 22 },
  count: { fontSize: 13 },
  filterContainer: { borderBottomWidth: StyleSheet.hairlineWidth },
  filterRow: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1 },
  filterText: { fontSize: 10, letterSpacing: 0.5 },
  list: { gap: 0 },
  row: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLeft: { flex: 1, gap: 4 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeText: { fontSize: 9, letterSpacing: 0.5 },
  modeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  modeText: { fontSize: 9, letterSpacing: 0.5 },
  symbol: { fontSize: 12 },
  detail: { fontSize: 12, lineHeight: 16 },
  intentId: { fontSize: 10, letterSpacing: 0.5 },
  time: { fontSize: 10, minWidth: 60, textAlign: "right" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 16 },
  emptySub: { fontSize: 13, textAlign: "center" },
});
