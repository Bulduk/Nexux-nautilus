import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import {
  apiGet,
  apiPost,
  type OhlcvResp,
  type TradeStatus,
  type IntentEval,
  type IntentSubmitResult,
  type GuardCheck,
  type RiskStatus,
} from "@/lib/api";
import OrderBook from "@/components/OrderBook";

const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT"];

interface Props {
  visible: boolean;
  onClose: () => void;
}

function CheckItem({ check }: { check: GuardCheck }) {
  return (
    <View style={ck.row}>
      <Feather name={check.passed ? "check" : "x"} size={10} color={check.passed ? "#00FFB2" : "#FF4D6D"} />
      <Text style={[ck.label, { color: check.passed ? "#00FFB2" : "#FF4D6D" }]} numberOfLines={1}>
        {check.name.replace(/_/g, " ")}
      </Text>
    </View>
  );
}

const ck = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4, width: "48%" },
  label: { fontSize: 9, fontFamily: "Inter_500Medium", flex: 1 },
});

export default function TradeSheet({ visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [symbol, setSymbol] = useState("BTC/USDT");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [notionalStr, setNotionalStr] = useState("100");
  const [limitPriceStr, setLimitPriceStr] = useState("");
  const [evalResult, setEvalResult] = useState<IntentEval | null>(null);
  const [tradeResult, setTradeResult] = useState<IntentSubmitResult | null>(null);
  const [liveConfirmOpen, setLiveConfirmOpen] = useState(false);
  const [showBook, setShowBook] = useState(false);

  const { data: riskStatus } = useQuery<RiskStatus>({
    queryKey: ["risk-status"],
    queryFn: () => apiGet<RiskStatus>("/risk/status"),
    enabled: visible,
    staleTime: 8000,
  });
  // Equity proxy: capacity_remaining + gross_exposure ≈ effective trading equity
  const equity = riskStatus
    ? Math.max(100, (riskStatus.capacity_remaining_usd ?? 0) + (riskStatus.gross_exposure_usd ?? 0))
    : 10000;

  const { data: ohlcv } = useQuery<OhlcvResp>({
    queryKey: ["ohlcv-trade", symbol],
    queryFn: () => apiGet<OhlcvResp>(`/markets/ohlcv?symbol=${encodeURIComponent(symbol)}&timeframe=1m&limit=1`),
    refetchInterval: 4000,
    enabled: visible,
  });

  const { data: tradeStatus } = useQuery<TradeStatus>({
    queryKey: ["trade-status"],
    queryFn: () => apiGet<TradeStatus>("/trade/status"),
    staleTime: 30000,
    enabled: visible,
  });

  const candles = ohlcv?.candles ?? [];
  const marketPrice = candles[candles.length - 1]?.close ?? 0;
  const limitPrice = Number(limitPriceStr) || 0;
  const price = orderType === "limit" && limitPrice > 0 ? limitPrice : marketPrice;
  const notional = Math.max(1, Number(notionalStr) || 0);
  const qty = price > 0 ? notional / price : 0;
  const isBinance = tradeStatus?.live_trading_configured ?? false;

  // % size buttons (equity'nin %'si)
  const pickPct = useCallback((pct: number) => {
    const usd = (equity * pct) / 100;
    setNotionalStr(usd.toFixed(0));
    setEvalResult(null);
    Haptics.selectionAsync();
  }, [equity]);

  const useMidPrice = useCallback(() => {
    if (marketPrice > 0) {
      setLimitPriceStr(marketPrice.toFixed(marketPrice >= 1 ? 2 : 4));
      Haptics.selectionAsync();
    }
  }, [marketPrice]);

  const evalMutation = useMutation({
    mutationFn: () =>
      apiPost<IntentEval>("/intent/evaluate", {
        symbol,
        direction: side === "BUY" ? "LONG" : "SHORT",
        confidence_pct: 75,
        price: price > 0 ? price : 1,
        notional_usd: notional,
        equity_usd: equity,
        leverage: 1,
      }),
    onSuccess: (res) => {
      setEvalResult(res);
      setTradeResult(null);
      Haptics.notificationAsync(
        res.guard.ok
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      );
    },
  });

  const tradeMutation = useMutation({
    mutationFn: (mode: "paper" | "live") =>
      apiPost<IntentSubmitResult>("/intent/submit", {
        symbol,
        direction: side === "BUY" ? "LONG" : "SHORT",
        confidence_pct: 75,
        price: price > 0 ? price : 1,
        notional_usd: notional,
        equity_usd: equity,
        leverage: 1,
        mode,
        agent_source: "patron_mobile",
        order_type: orderType,
        limit_price: orderType === "limit" ? limitPrice : undefined,
      }),
    onSuccess: (res) => {
      setTradeResult(res);
      setLiveConfirmOpen(false);
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ["positions"] });
        qc.invalidateQueries({ queryKey: ["risk-status"] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    onError: () => {
      setLiveConfirmOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const handleClose = useCallback(() => {
    setEvalResult(null);
    setTradeResult(null);
    setLiveConfirmOpen(false);
    onClose();
  }, [onClose]);

  const priceFmt = (p: number) =>
    p > 0
      ? `$${p.toLocaleString(undefined, { maximumFractionDigits: p > 100 ? 0 : p > 1 ? 2 : 4 })}`
      : "…";

  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom + 8;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: bottomPad }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <Feather name="activity" size={16} color="#00FFB2" />
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>Emir Yöneticisi</Text>
              <View style={[styles.binanceBadge, { backgroundColor: isBinance ? "#00FFB218" : "#FF4D6D18", borderColor: isBinance ? "#00FFB244" : "#FF4D6D44" }]}>
                <View style={[styles.binanceDot, { backgroundColor: isBinance ? "#00FFB2" : "#FF4D6D" }]} />
                <Text style={[styles.binanceTxt, { color: isBinance ? "#00FFB2" : "#FF4D6D" }]}>
                  {isBinance ? `Binance: ${tradeStatus?.default_exchange?.toUpperCase() ?? "OK"}` : "Binance: KEY YOK"}
                </Text>
              </View>
              <Pressable onPress={handleClose} style={[styles.closeBtn, { borderColor: colors.border }]}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={[styles.apiNote, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="info" size={12} color={colors.mutedForeground} />
              <Text style={[styles.apiNoteTxt, { color: colors.mutedForeground }]}>
                {tradeStatus?.note ?? "API durumu kontrol ediliyor…"}
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SEMBOL</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {SYMBOLS.map((s) => {
                  const active = s === symbol;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => { setSymbol(s); setEvalResult(null); setTradeResult(null); Haptics.selectionAsync(); }}
                      style={[styles.symBtn, active && { backgroundColor: "#00FFB218", borderColor: "#00FFB255" }, !active && { borderColor: colors.border }]}
                    >
                      <Text style={[styles.symTxt, { color: active ? "#00FFB2" : colors.mutedForeground, fontFamily: active ? "Inter_700Bold" : "Inter_400Regular" }]}>
                        {s.replace("/USDT", "")}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.sidePriceRow}>
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>YÖN</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["BUY", "SELL"] as const).map((s) => {
                    const active = s === side;
                    const col = s === "BUY" ? "#00FFB2" : "#FF4D6D";
                    return (
                      <Pressable
                        key={s}
                        onPress={() => { setSide(s); setEvalResult(null); Haptics.selectionAsync(); }}
                        style={[styles.sideBtn, { borderColor: active ? `${col}66` : colors.border, backgroundColor: active ? `${col}14` : "transparent" }]}
                      >
                        <Feather name={s === "BUY" ? "trending-up" : "trending-down"} size={14} color={active ? col : colors.mutedForeground} />
                        <Text style={[styles.sideTxt, { color: active ? col : colors.mutedForeground, fontFamily: active ? "Inter_700Bold" : "Inter_500Medium" }]}>{s}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={styles.priceBox}>
                <Pressable onPress={() => setShowBook((v) => !v)} hitSlop={8}>
                  <Text style={[styles.sectionLabel, { color: showBook ? "#00FFB2" : colors.mutedForeground }]}>
                    {orderType === "limit" ? "MID FİYAT" : "GÜNCEL FİYAT"} {showBook ? "▲" : "▼"}
                  </Text>
                </Pressable>
                <Text style={[styles.priceTxt, { color: colors.foreground }]}>{priceFmt(marketPrice)}</Text>
                {qty > 0 && price > 0 && (
                  <Text style={[styles.qtyTxt, { color: colors.mutedForeground }]}>
                    ≈ {qty.toFixed(6)} {symbol.split("/")[0]}
                  </Text>
                )}
              </View>
            </View>

            {/* Order type toggle */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>EMİR TİPİ</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["market", "limit"] as const).map((t) => {
                  const active = t === orderType;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => { setOrderType(t); setEvalResult(null); Haptics.selectionAsync(); if (t === "limit" && !limitPriceStr && marketPrice > 0) setLimitPriceStr(marketPrice.toFixed(marketPrice >= 1 ? 2 : 4)); }}
                      style={[styles.sideBtn, { borderColor: active ? "#00FFB266" : colors.border, backgroundColor: active ? "#00FFB214" : "transparent" }]}
                    >
                      <Feather name={t === "market" ? "zap" : "target"} size={13} color={active ? "#00FFB2" : colors.mutedForeground} />
                      <Text style={[styles.sideTxt, { color: active ? "#00FFB2" : colors.mutedForeground, fontFamily: active ? "Inter_700Bold" : "Inter_500Medium" }]}>
                        {t === "market" ? "MARKET" : "LIMIT"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {orderType === "limit" && (
              <View style={styles.section}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>LIMIT FİYAT</Text>
                  <Pressable onPress={useMidPrice} hitSlop={8}>
                    <Text style={{ fontSize: 10, color: "#00FFB2", fontFamily: "Inter_600SemiBold" }}>MID FİYATI KULLAN</Text>
                  </Pressable>
                </View>
                <View style={[styles.amtRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Text style={[styles.dollarSign, { color: colors.mutedForeground }]}>$</Text>
                  <TextInput
                    value={limitPriceStr}
                    onChangeText={(v) => { setLimitPriceStr(v.replace(/[^0-9.]/g, "")); setEvalResult(null); }}
                    keyboardType="decimal-pad"
                    style={[styles.amtInput, { color: colors.foreground }]}
                    placeholder={marketPrice > 0 ? marketPrice.toFixed(2) : "0.00"}
                    placeholderTextColor={colors.mutedForeground}
                  />
                  <Text style={[styles.usdLabel, { color: colors.mutedForeground }]}>USDT</Text>
                </View>
              </View>
            )}

            {showBook && (
              <View style={styles.section}>
                <OrderBook symbol={symbol} depth={8} />
              </View>
            )}

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TUTAR (USD)</Text>
              <View style={[styles.amtRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.dollarSign, { color: colors.mutedForeground }]}>$</Text>
                <TextInput
                  value={notionalStr}
                  onChangeText={(v) => { setNotionalStr(v.replace(/[^0-9.]/g, "")); setEvalResult(null); }}
                  keyboardType="decimal-pad"
                  style={[styles.amtInput, { color: colors.foreground }]}
                  placeholderTextColor={colors.mutedForeground}
                  placeholder="100"
                />
                <Text style={[styles.usdLabel, { color: colors.mutedForeground }]}>USDT</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                {[10, 50, 100, 250, 500].map((v) => (
                  <Pressable
                    key={v}
                    onPress={() => { setNotionalStr(String(v)); setEvalResult(null); Haptics.selectionAsync(); }}
                    style={[styles.presetBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                  >
                    <Text style={[styles.presetTxt, { color: colors.mutedForeground }]}>${v}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                {[25, 50, 75, 100].map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => pickPct(p)}
                    style={[styles.presetBtn, { borderColor: "#A78BFA44", backgroundColor: "#A78BFA0F", flex: 1, alignItems: "center" }]}
                  >
                    <Text style={[styles.presetTxt, { color: "#A78BFA", fontFamily: "Inter_700Bold" }]}>{p}%</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={{ fontSize: 9, color: colors.mutedForeground, marginTop: 4, fontFamily: "Inter_400Regular" }}>
                % butonları equity'nin yüzdesini kullanır (~${equity.toFixed(0)})
              </Text>
            </View>

            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); evalMutation.mutate(); }}
              disabled={evalMutation.isPending || price === 0}
              style={[styles.evalBtn, { opacity: evalMutation.isPending || price === 0 ? 0.5 : 1, borderColor: "#38BDF855", backgroundColor: "#38BDF814" }]}
            >
              {evalMutation.isPending
                ? <><ActivityIndicator size="small" color="#38BDF8" /><Text style={[styles.evalBtnTxt, { color: "#38BDF8" }]}>PolicyGuard kontrol ediliyor…</Text></>
                : <><Feather name="shield" size={14} color="#38BDF8" /><Text style={[styles.evalBtnTxt, { color: "#38BDF8" }]}>PolicyGuard Değerlendir</Text></>
              }
            </Pressable>

            {evalMutation.isError && (
              <View style={[styles.errorBox, { borderColor: "#FF4D6D44", backgroundColor: "#FF4D6D14" }]}>
                <Feather name="alert-triangle" size={12} color="#FF4D6D" />
                <Text style={[styles.errorTxt, { color: "#FF4D6D" }]}>{(evalMutation.error as Error)?.message}</Text>
              </View>
            )}

            {evalResult && (
              <View style={[styles.guardCard, { backgroundColor: colors.card, borderColor: evalResult.guard.ok ? "#00FFB244" : "#FF4D6D44" }]}>
                <View style={styles.guardHeader}>
                  <Feather name={evalResult.guard.ok ? "check-circle" : "x-circle"} size={16} color={evalResult.guard.ok ? "#00FFB2" : "#FF4D6D"} />
                  <Text style={[styles.guardTitle, { color: evalResult.guard.ok ? "#00FFB2" : "#FF4D6D" }]}>
                    PolicyGuard: {evalResult.guard.ok ? "GEÇTİ" : `REDDEDİLDİ — ${evalResult.guard.rejectedBy ?? ""}`}
                  </Text>
                </View>
                <View style={styles.checksGrid}>
                  {evalResult.guard.checks.map((c) => (
                    <CheckItem key={c.name} check={c} />
                  ))}
                </View>
                <View style={[styles.sizingBox, { borderTopColor: colors.border }]}>
                  <View style={styles.sizingRow}>
                    <Text style={[styles.sizingLabel, { color: colors.mutedForeground }]}>Notional</Text>
                    <Text style={[styles.sizingVal, { color: colors.foreground }]}>${evalResult.sizing.notionalUsd.toFixed(2)}</Text>
                  </View>
                  <View style={styles.sizingRow}>
                    <Text style={[styles.sizingLabel, { color: colors.mutedForeground }]}>Qty</Text>
                    <Text style={[styles.sizingVal, { color: colors.foreground }]}>{evalResult.sizing.qty.toFixed(6)}</Text>
                  </View>
                  <View style={styles.sizingRow}>
                    <Text style={[styles.sizingLabel, { color: colors.mutedForeground }]}>Kelly</Text>
                    <Text style={[styles.sizingVal, { color: "#F59E0B" }]}>{(evalResult.sizing.kellyFraction * 100).toFixed(2)}%</Text>
                  </View>
                </View>
              </View>
            )}

            {tradeResult && (
              <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: tradeResult.ok ? "#00FFB244" : "#FF4D6D44" }]}>
                <View style={styles.guardHeader}>
                  <Feather name={tradeResult.ok ? "check-circle" : "alert-circle"} size={16} color={tradeResult.ok ? "#00FFB2" : "#FF4D6D"} />
                  <Text style={[styles.guardTitle, { color: tradeResult.ok ? "#00FFB2" : "#FF4D6D" }]}>
                    {tradeResult.ok
                      ? `${tradeResult.mode === "live" ? "LIVE" : "PAPER"} EMİR BAŞARILI`
                      : `HATA: ${tradeResult.error ?? tradeResult.detail ?? "Bilinmeyen hata"}`}
                  </Text>
                </View>
                {tradeResult.order && (
                  <View style={styles.checksGrid}>
                    <View style={styles.sizingRow}>
                      <Text style={[styles.sizingLabel, { color: colors.mutedForeground }]}>Order ID</Text>
                      <Text style={[styles.sizingVal, { color: colors.foreground }]} numberOfLines={1}>{tradeResult.order.id ?? "—"}</Text>
                    </View>
                    <View style={styles.sizingRow}>
                      <Text style={[styles.sizingLabel, { color: colors.mutedForeground }]}>Fill Price</Text>
                      <Text style={[styles.sizingVal, { color: "#00FFB2" }]}>{priceFmt(tradeResult.order.price)}</Text>
                    </View>
                    <View style={styles.sizingRow}>
                      <Text style={[styles.sizingLabel, { color: colors.mutedForeground }]}>Filled</Text>
                      <Text style={[styles.sizingVal, { color: colors.foreground }]}>{tradeResult.order.filled?.toFixed(6)}</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            <View style={styles.actionRow}>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); tradeMutation.mutate("paper"); }}
                disabled={tradeMutation.isPending || !evalResult?.guard.ok}
                style={[styles.paperBtn, { opacity: tradeMutation.isPending || !evalResult?.guard.ok ? 0.4 : 1 }]}
              >
                {tradeMutation.isPending && tradeMutation.variables === "paper"
                  ? <ActivityIndicator size="small" color="#000" />
                  : <Feather name="file" size={14} color="#000" />}
                <Text style={[styles.paperBtnTxt]}>Paper Trade</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (!isBinance) return;
                  if (!evalResult?.guard.ok) return;
                  setLiveConfirmOpen(true);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                }}
                disabled={!isBinance || !evalResult?.guard.ok || tradeMutation.isPending}
                style={[styles.liveBtn, { opacity: !isBinance || !evalResult?.guard.ok || tradeMutation.isPending ? 0.35 : 1 }]}
              >
                <Feather name="zap" size={14} color="#FF4D6D" />
                <Text style={styles.liveBtnTxt}>
                  {isBinance ? "LIVE → Binance" : "API KEY YOK"}
                </Text>
              </Pressable>
            </View>

            {!evalResult && (
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                ↑ Önce PolicyGuard değerlendirmesi yap, sonra emir gönder.
              </Text>
            )}
            {evalResult && !evalResult.guard.ok && (
              <Text style={[styles.hint, { color: "#FF4D6D" }]}>
                PolicyGuard reddetti — emir gönderilemez. Risk limitlerini Settings'ten ayarla.
              </Text>
            )}
          </ScrollView>
        </View>
      </View>

      <Modal visible={liveConfirmOpen} animationType="fade" transparent>
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmBox, { backgroundColor: colors.card, borderColor: "#FF4D6D44" }]}>
            <Feather name="alert-octagon" size={28} color="#FF4D6D" />
            <Text style={[styles.confirmTitle, { color: "#FF4D6D" }]}>GERÇEK EMİR ONAYI</Text>
            <Text style={[styles.confirmBody, { color: colors.mutedForeground }]}>
              Binance hesabına {side} emri gönderiliyor:{"\n\n"}
              <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold" }}>
                {symbol}  ·  ${notional.toFixed(2)}  ·  {qty.toFixed(6)} {symbol.split("/")[0]}
              </Text>
              {"\n\n"}Bu işlem GERİ ALINAMAZ. Devam etmek istiyor musun?
            </Text>
            <View style={styles.confirmBtns}>
              <Pressable
                style={[styles.confirmCancel, { borderColor: colors.border }]}
                onPress={() => setLiveConfirmOpen(false)}
              >
                <Text style={[styles.confirmCancelTxt, { color: colors.mutedForeground }]}>İptal</Text>
              </Pressable>
              <Pressable
                style={styles.confirmGo}
                onPress={() => { tradeMutation.mutate("live"); }}
                disabled={tradeMutation.isPending}
              >
                {tradeMutation.isPending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.confirmGoTxt}>EVET, GÖNDER</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%", overflow: "hidden" },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginTop: 10 },
  header: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 15, fontFamily: "Inter_700Bold", flex: 1 },
  binanceBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  binanceDot: { width: 5, height: 5, borderRadius: 3 },
  binanceTxt: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  closeBtn: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 16 },
  apiNote: { flexDirection: "row", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, alignItems: "flex-start" },
  apiNoteTxt: { fontSize: 10, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 15 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  symBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  symTxt: { fontSize: 12 },
  sidePriceRow: { flexDirection: "row", gap: 12 },
  sideBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, borderWidth: 1, paddingVertical: 10 },
  sideTxt: { fontSize: 13 },
  priceBox: { alignItems: "flex-end", gap: 2 },
  priceTxt: { fontSize: 18, fontFamily: "Inter_700Bold" },
  qtyTxt: { fontSize: 10, fontFamily: "Inter_400Regular" },
  amtRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, overflow: "hidden", height: 48 },
  dollarSign: { paddingHorizontal: 14, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  amtInput: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", paddingVertical: 12 },
  usdLabel: { paddingHorizontal: 14, fontSize: 12, fontFamily: "Inter_500Medium" },
  presetBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  presetTxt: { fontSize: 10, fontFamily: "Inter_500Medium" },
  evalBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 13 },
  evalBtnTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  errorBox: { flexDirection: "row", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  errorTxt: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  guardCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden", padding: 14, gap: 12 },
  guardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  guardTitle: { fontSize: 12, fontFamily: "Inter_700Bold", flex: 1 },
  checksGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sizingBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 6 },
  sizingRow: { flexDirection: "row", justifyContent: "space-between" },
  sizingLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  sizingVal: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  resultCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden", padding: 14, gap: 12 },
  actionRow: { flexDirection: "row", gap: 10 },
  paperBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#00C9A7", borderRadius: 14, paddingVertical: 14 },
  paperBtnTxt: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#000" },
  liveBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#FF4D6D18", borderWidth: 1, borderColor: "#FF4D6D55", borderRadius: 14, paddingVertical: 14 },
  liveBtnTxt: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#FF4D6D" },
  hint: { textAlign: "center", fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  confirmOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.8)", padding: 24 },
  confirmBox: { borderRadius: 20, borderWidth: 1, padding: 24, gap: 16, alignItems: "center", width: "100%" },
  confirmTitle: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  confirmBody: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  confirmBtns: { flexDirection: "row", gap: 12, width: "100%" },
  confirmCancel: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 13, alignItems: "center" },
  confirmCancelTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  confirmGo: { flex: 1, borderRadius: 12, backgroundColor: "#FF4D6D", paddingVertical: 13, alignItems: "center" },
  confirmGoTxt: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },
});
