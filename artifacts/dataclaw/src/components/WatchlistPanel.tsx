import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, RefreshCw, CheckCircle, XCircle, Eye, EyeOff, TrendingUp, TrendingDown, Bell, BellOff, X } from "lucide-react";
import { apiGet, apiPost } from "../lib/api";
import { clsx } from "clsx";
import { useAlertsStore, type AlertCondition } from "../state/alertsStore";

interface WatchlistSymbol {
  id: number;
  symbol: string;
  base: string;
  quote: string;
  exchange: string;
  enabled: boolean;
  tags: string[];
  addedBy: string;
  createdAt: string;
}

interface PriceData {
  price: number;
  change: number;
  volume: string;
  high: number;
  low: number;
}

interface AddResult {
  ok: boolean;
  symbol?: WatchlistSymbol;
  verified?: boolean;
  message?: string;
  error?: string;
}

function AlertRow({ symbol, currentPrice }: { symbol: string; currentPrice?: number }) {
  const { alerts, addAlert, removeAlert } = useAlertsStore();
  const [open, setOpen] = useState(false);
  const [condition, setCondition] = useState<AlertCondition>("above");
  const [target, setTarget] = useState(currentPrice ? currentPrice.toFixed(2) : "");

  const symbolAlerts = alerts.filter((a) => a.symbol === symbol);
  const activeAlerts = symbolAlerts.filter((a) => !a.firedAt);
  const firedAlerts = symbolAlerts.filter((a) => a.firedAt);

  const requestNotifPermission = () => {
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  };

  const submit = () => {
    const price = parseFloat(target);
    if (!price || price <= 0) return;
    requestNotifPermission();
    addAlert(symbol, condition, price);
    setTarget(currentPrice ? currentPrice.toFixed(2) : "");
    setOpen(false);
  };

  return (
    <div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className={clsx(
            "p-1.5 rounded-lg transition-colors",
            activeAlerts.length > 0 ? "text-amber-400" : "text-gray-500 hover:text-gray-300"
          )}
          title={activeAlerts.length > 0 ? `${activeAlerts.length} aktif alarm` : "Fiyat alarmı ekle"}
        >
          {activeAlerts.length > 0 ? <Bell size={12} /> : <BellOff size={12} />}
        </button>
        {activeAlerts.length > 0 && (
          <span className="text-[9px] text-amber-400 font-bold font-mono">{activeAlerts.length}</span>
        )}
      </div>

      {open && (
        <div className="absolute right-4 mt-1 z-50 bg-[#0A0C14] border border-white/15 rounded-xl shadow-2xl p-3 w-64">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">{symbol} Alarm</span>
            <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white">
              <X size={12} />
            </button>
          </div>

          {/* Add new alert */}
          <div className="flex gap-1 mb-2">
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as AlertCondition)}
              className="flex-none bg-black/60 border border-white/10 rounded px-2 py-1 text-[10px] text-white"
            >
              <option value="above">≥ üzeri</option>
              <option value="below">≤ altı</option>
            </select>
            <input
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Fiyat"
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="flex-1 bg-black/60 border border-white/10 rounded px-2 py-1 text-[10px] text-white font-mono"
            />
            <button
              onClick={submit}
              disabled={!target}
              className="px-2 py-1 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded text-[10px] font-bold hover:bg-amber-500/25 disabled:opacity-40"
            >
              Ekle
            </button>
          </div>

          {currentPrice && (
            <div className="text-[9px] text-gray-500 mb-2 font-mono">
              Mevcut: ${currentPrice.toFixed(2)}
            </div>
          )}

          {/* Active alerts */}
          {activeAlerts.length > 0 && (
            <div className="flex flex-col gap-1 mb-1">
              {activeAlerts.map((a) => (
                <div key={a.id} className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
                  <span className="text-[10px] font-mono text-amber-400">
                    {a.condition === "above" ? "≥" : "≤"} ${a.targetPrice.toLocaleString()}
                  </span>
                  <button onClick={() => removeAlert(a.id)} className="text-gray-500 hover:text-red-400">
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Fired alerts */}
          {firedAlerts.length > 0 && (
            <div className="flex flex-col gap-1">
              {firedAlerts.map((a) => (
                <div key={a.id} className="flex items-center justify-between bg-white/5 border border-white/10 rounded px-2 py-1">
                  <span className="text-[10px] font-mono text-gray-500 line-through">
                    {a.condition === "above" ? "≥" : "≤"} ${a.targetPrice.toLocaleString()} ✓
                  </span>
                  <button onClick={() => removeAlert(a.id)} className="text-gray-500 hover:text-red-400">
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {symbolAlerts.length === 0 && (
            <div className="text-[9px] text-gray-500 text-center py-1">Henüz alarm yok</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function WatchlistPanel() {
  const [symbols, setSymbols] = useState<WatchlistSymbol[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [loading, setLoading] = useState(true);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [lastResult, setLastResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const checkPrices = useAlertsStore((s) => s.checkPrices);

  const loadSymbols = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ symbols: WatchlistSymbol[] }>("/watchlist");
      setSymbols(data.symbols);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPrices = useCallback(async () => {
    setPricesLoading(true);
    try {
      const data = await apiGet<{ prices: Record<string, PriceData> }>("/watchlist/prices");
      const p = data.prices ?? {};
      setPrices(p);
      const priceMap: Record<string, number> = {};
      for (const [sym, pd] of Object.entries(p)) priceMap[sym] = pd.price;
      checkPrices(priceMap);
    } catch {
      // ignore
    } finally {
      setPricesLoading(false);
    }
  }, [checkPrices]);

  useEffect(() => {
    void loadSymbols();
    void loadPrices();
  }, [loadSymbols, loadPrices]);

  useEffect(() => {
    const i = setInterval(loadPrices, 30_000);
    return () => clearInterval(i);
  }, [loadPrices]);

  const handleAdd = async () => {
    const sym = input.trim();
    if (!sym || adding) return;
    setAdding(true);
    setLastResult(null);
    try {
      const res = await apiPost<AddResult>("/watchlist", { symbol: sym });
      setLastResult({ ok: res.ok, message: res.message ?? (res.error ?? "Eklendi") });
      if (res.ok) {
        setInput("");
        await loadSymbols();
        setTimeout(() => void loadPrices(), 1500);
      }
    } catch (err) {
      setLastResult({ ok: false, message: String(err) });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (symbol: string) => {
    setDeleting(symbol);
    try {
      await fetch(`/api/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE" });
      setSymbols((prev) => prev.filter((s) => s.symbol !== symbol));
      setPrices((prev) => {
        const next = { ...prev };
        delete next[symbol];
        return next;
      });
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  const handleToggle = async (symbol: string, enabled: boolean) => {
    try {
      await fetch(`/api/watchlist/${encodeURIComponent(symbol)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      setSymbols((prev) =>
        prev.map((s) => (s.symbol === symbol ? { ...s, enabled: !enabled } : s)),
      );
    } catch {
      // ignore
    }
  };

  const enabledCount = symbols.filter((s) => s.enabled).length;

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <div
        className="p-4 md:p-6 border-b shrink-0"
        style={{ borderColor: "var(--color-border)", background: "var(--color-sidebar)" }}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base md:text-lg font-bold font-['Syne']" style={{ color: "var(--color-text)" }}>
            Watchlist
          </h2>
          <button
            onClick={() => { void loadSymbols(); void loadPrices(); }}
            disabled={loading || pricesLoading}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--color-muted)" }}
            title="Yenile"
          >
            <RefreshCw size={14} className={(loading || pricesLoading) ? "animate-spin" : ""} />
          </button>
        </div>
        <p className="text-[10px] font-mono" style={{ color: "var(--color-muted)" }}>
          {symbols.length} sembol · {enabledCount} aktif · 30s fiyat güncellemesi · <Bell size={9} className="inline" /> alarm desteği
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4">
        {/* Add coin */}
        <div
          className="rounded-xl p-4 border"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <p className="text-[10px] font-mono uppercase tracking-wider mb-3" style={{ color: "var(--color-muted)" }}>
            Coin Ekle
          </p>
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="BTC, PEPE, AVAX/USDT..."
              disabled={adding}
              className="flex-1 rounded-lg px-3 py-2 text-sm font-mono outline-none border transition-colors"
              style={{
                background: "var(--color-bg)",
                borderColor: "var(--color-border)",
                color: "var(--color-text)",
              }}
            />
            <button
              onClick={handleAdd}
              disabled={adding || !input.trim()}
              className="px-4 py-2 rounded-lg font-mono text-xs font-bold flex items-center gap-2 transition-all border"
              style={{
                background: "var(--color-accent-bg)",
                borderColor: "var(--color-accent)",
                color: "var(--color-accent)",
                opacity: adding || !input.trim() ? 0.5 : 1,
              }}
            >
              {adding ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
              Ekle
            </button>
          </div>
          {lastResult && (
            <div
              className="mt-2 flex items-center gap-2 text-xs font-mono"
              style={{ color: lastResult.ok ? "var(--color-accent)" : "#FF4D6D" }}
            >
              {lastResult.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
              {lastResult.message}
            </div>
          )}
          <p className="text-[9px] font-mono mt-2" style={{ color: "var(--color-muted)" }}>
            Örnekler: PEPE · AVAX · BNB/USDT · ARB · OP
          </p>
        </div>

        {/* Symbols with prices */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: "var(--color-border)" }}
        >
          {/* Table header */}
          <div
            className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 px-4 py-2 border-b"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
          >
            <span className="text-[9px] font-mono uppercase tracking-wider col-span-2" style={{ color: "var(--color-muted)" }}>Sembol</span>
            <span className="text-[9px] font-mono uppercase tracking-wider text-right" style={{ color: "var(--color-muted)" }}>Fiyat</span>
            <span className="text-[9px] font-mono uppercase tracking-wider text-right w-14" style={{ color: "var(--color-muted)" }}>24s %</span>
            <span className="text-[9px] font-mono uppercase tracking-wider text-right" style={{ color: "var(--color-muted)" }}>İşlem</span>
          </div>

          {loading ? (
            <div className="p-8 flex justify-center">
              <RefreshCw size={16} className="animate-spin" style={{ color: "var(--color-muted)" }} />
            </div>
          ) : symbols.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono" style={{ color: "var(--color-muted)" }}>
              Henüz sembol yok — yukarıdan ekle
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {symbols.map((sym) => {
                const p = prices[sym.symbol];
                const isUp = (p?.change ?? 0) >= 0;
                return (
                  <div
                    key={sym.id}
                    className={clsx("grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 px-4 py-3 items-center transition-colors relative", !sym.enabled && "opacity-40")}
                    style={{ background: "var(--color-bg)" }}
                  >
                    {/* Icon */}
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0"
                      style={{ background: "var(--color-accent-bg)", color: "var(--color-accent)" }}
                    >
                      {sym.base.slice(0, 2)}
                    </div>

                    {/* Symbol + exchange */}
                    <div className="min-w-0">
                      <div className="text-xs font-bold font-mono truncate" style={{ color: "var(--color-text)" }}>
                        {sym.symbol}
                      </div>
                      <div className="text-[9px] font-mono" style={{ color: "var(--color-muted)" }}>
                        {sym.exchange}
                      </div>
                    </div>

                    {/* Price */}
                    <div className="text-right">
                      {p ? (
                        <div className="text-xs font-bold font-mono" style={{ color: "var(--color-text)" }}>
                          {p.price < 0.01
                            ? p.price.toFixed(8)
                            : p.price < 1
                              ? p.price.toFixed(5)
                              : p.price < 100
                                ? p.price.toFixed(3)
                                : p.price.toFixed(2)}
                        </div>
                      ) : (
                        <div className="text-xs font-mono" style={{ color: "var(--color-muted)" }}>
                          {pricesLoading ? "…" : "—"}
                        </div>
                      )}
                    </div>

                    {/* 24h Change */}
                    <div className="text-right w-14">
                      {p ? (
                        <div
                          className="flex items-center justify-end gap-0.5 text-xs font-bold font-mono"
                          style={{ color: isUp ? "#00C9A7" : "#FF4D6D" }}
                        >
                          {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {isUp ? "+" : ""}
                          {p.change.toFixed(2)}%
                        </div>
                      ) : (
                        <span className="text-xs font-mono" style={{ color: "var(--color-muted)" }}>—</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5">
                      <AlertRow symbol={sym.symbol} currentPrice={p?.price} />
                      <button
                        onClick={() => handleToggle(sym.symbol, sym.enabled)}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: sym.enabled ? "var(--color-accent)" : "var(--color-muted)" }}
                        title={sym.enabled ? "Deaktif et" : "Aktif et"}
                      >
                        {sym.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                      <button
                        onClick={() => handleDelete(sym.symbol)}
                        disabled={deleting === sym.symbol}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: "#FF4D6D", opacity: deleting === sym.symbol ? 0.5 : 1 }}
                        title="Sil"
                      >
                        {deleting === sym.symbol
                          ? <RefreshCw size={12} className="animate-spin" />
                          : <Trash2 size={12} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary stats */}
        {symbols.length > 0 && Object.keys(prices).length > 0 && (
          <div
            className="rounded-xl p-4 border grid grid-cols-3 gap-3"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
          >
            {[
              {
                label: "Yükselen",
                value: Object.values(prices).filter((p) => p.change >= 0).length,
                color: "#00C9A7",
              },
              {
                label: "Düşen",
                value: Object.values(prices).filter((p) => p.change < 0).length,
                color: "#FF4D6D",
              },
              {
                label: "Ort. Değişim",
                value:
                  Object.values(prices).length > 0
                    ? (
                        Object.values(prices).reduce((s, p) => s + p.change, 0) /
                        Object.values(prices).length
                      ).toFixed(2) + "%"
                    : "—",
                color: "var(--color-text)",
              },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-base font-bold font-mono" style={{ color: stat.color }}>
                  {stat.value}
                </div>
                <div className="text-[9px] font-mono mt-0.5" style={{ color: "var(--color-muted)" }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info */}
        <div
          className="rounded-xl p-4 border text-[10px] font-mono leading-relaxed"
          style={{
            background: "var(--color-surface)",
            borderColor: "var(--color-border)",
            color: "var(--color-muted)",
          }}
        >
          <p className="font-bold mb-1" style={{ color: "var(--color-text)" }}>Nasıl çalışır?</p>
          <p>Eklediğin her sembol signal engine'e (SSE akışına) otomatik dahil edilir.</p>
          <p className="mt-1">• "PEPE" → "PEPE/USDT" otomatik normalize · Binance'da doğrulama</p>
          <p>• Fiyatlar KuCoin'den 30 saniyede bir güncellenir</p>
          <p>• Deaktif (göz ikonu) sinyal üretimini durdurur, listede kalır</p>
          <p>• <Bell size={9} className="inline" /> Alarm ikonu ile fiyat alarmı kur — tetiklenince toast + browser bildirimi</p>
        </div>
      </div>
    </div>
  );
}
