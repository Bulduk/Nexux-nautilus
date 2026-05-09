import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, ViewStyle } from "react-native";
import { useColors } from "@/hooks/useColors";

interface SkeletonBoxProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonBox({ width = "100%", height = 16, borderRadius = 8, style }: SkeletonBoxProps) {
  const colors = useColors();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: false }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: colors.border },
        { opacity },
        style,
      ]}
    />
  );
}

export function SignalCardSkeleton() {
  const colors = useColors();
  return (
    <View style={[skStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={skStyles.top}>
        <View style={skStyles.left}>
          <View style={skStyles.badges}>
            <SkeletonBox width={52} height={20} borderRadius={6} />
            <SkeletonBox width={44} height={20} borderRadius={6} />
          </View>
          <SkeletonBox width={120} height={18} borderRadius={4} />
          <SkeletonBox width="80%" height={12} borderRadius={4} />
        </View>
        <View style={skStyles.right}>
          <SkeletonBox width={44} height={22} borderRadius={4} />
          <SkeletonBox width={24} height={14} borderRadius={4} />
        </View>
      </View>
      <View style={skStyles.priceRow}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={skStyles.priceItem}>
            <SkeletonBox width={28} height={8} borderRadius={3} />
            <SkeletonBox width={52} height={14} borderRadius={4} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function PortfolioStatSkeleton() {
  const colors = useColors();
  return (
    <View style={[skStyles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <SkeletonBox width={40} height={8} borderRadius={3} />
      <SkeletonBox width={60} height={20} borderRadius={4} />
    </View>
  );
}

export function TickerSkeleton() {
  const colors = useColors();
  return (
    <View style={[skStyles.tickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <SkeletonBox width={24} height={8} borderRadius={3} />
      <SkeletonBox width={52} height={14} borderRadius={4} />
      <SkeletonBox width={36} height={10} borderRadius={3} />
    </View>
  );
}

export function CouncilVoteSkeleton() {
  const colors = useColors();
  return (
    <View style={[skStyles.voteCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={skStyles.voteTop}>
        <SkeletonBox width={100} height={24} borderRadius={8} />
        <View style={{ marginLeft: "auto", flexDirection: "row", gap: 8 }}>
          <SkeletonBox width={56} height={22} borderRadius={6} />
          <SkeletonBox width={36} height={22} borderRadius={6} />
        </View>
      </View>
      <SkeletonBox width="90%" height={12} borderRadius={4} />
      <SkeletonBox width="70%" height={12} borderRadius={4} />
    </View>
  );
}

const skStyles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden", padding: 14, gap: 10 },
  top: { flexDirection: "row", gap: 8 },
  left: { flex: 1, gap: 8 },
  right: { alignItems: "flex-end", gap: 6 },
  badges: { flexDirection: "row", gap: 6 },
  priceRow: { flexDirection: "row", gap: 12 },
  priceItem: { flex: 1, gap: 4 },
  statCard: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 10, gap: 6 },
  tickerCard: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 10, gap: 4 },
  voteCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  voteTop: { flexDirection: "row", alignItems: "center" },
});
