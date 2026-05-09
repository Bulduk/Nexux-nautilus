import { useCallback, useEffect, useRef, useState } from "react";
import { Target, Activity, ChevronDown, ChevronRight, Zap, X, CheckCircle2 } from "lucide-react";
import { clsx } from "clsx";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { apiGet, apiPost, apiSseUrl } from "../lib/api";
import { toast } from "../state/toastStore";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
interface OhlcvResponse {
  symbol: string;
  timeframe: string;
  candles: Candle[];
}
interface OrderbookResp {
  symbol: string;
  bidWall: number;
  askWall: number;
  imbalance: number;
  spreadPct: number;
  topBid: number;
  topAsk: number;
}

interface DecisionTrace {
  why_entry: string;
  why_size: string;
  why_stop: string;
  why_leverage: string;
  factors: {
    rsi14: number | null;
    macdHist: number | null;
    ema20: number | null;
    ema50: number | null;
    atrPct: number | null;
    trendBias: string;
    momentumBias: string;
    volRegime: string;
    orderbookImbalance: number;
    spreadPct: number;
  };
  grade: "A" | "B" | "C" | "D";
  confluence: number;
}
interface SseSignal {
  source: string;
  agent_kind: "core" | "external";
  symbol: string;
  direction: "LONG" | "SHORT";
  confidence: number;
  reason: string;
  price: number;
  entry: number;
  stop_loss: number;
  take_profit: number;
  rr: number;
  suggested_leverage: number;
  trace: DecisionTrace;
  timestamp: string;
}

const TIMEFRAMES = ["5m", "15m", "1h", "4h"];
const FALLBACK_SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"];

const GRADE_COLOR: Record<string, string> = {
  A: "bg-[#00FFB2]/20 text-[#00FFB2] border-[#00FFB2]/30",
  B: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  C: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  D: "bg-red-500/20 text-red-400 border-red-500/30",
};

interface AutoExecPending {
  signal: SseSignal;
  countdown: number;
  submitted: boolean;
}

interface AutoExecLogEntry {
  symbol: string;
  direction: string;
  grade: string;
  at: string;
  status: "submitted" | "cancelled";
}

export default function SignalEngine() {
  const [symbol, setSymbol] = useState<string>("BTC/USDT");
  const [timeframe, setTimeframe] = useState<string>("15m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [book, setBook] = useState<OrderbookResp | null>(null);
  const [signals, setSignals] = useState<SseSignal[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(FALLBACK_SYMBOLS);

  // ── Exec mode (auto_confirm / full_auto triggers) ────────────────────────
  const execModeRef = useRef<string>("paper");
  const [execMode, setExecMode] = useState<string>("paper");
  const [pendingAutoExec, setPendingAutoExec] = useState<AutoExecPending | null>(null);
  const [autoExecLog, setAutoExecLog] = useState<AutoExecLogEntry[]>([]);

  // ── Exec mode polling ───────────────────────────────────────────────────
  useEffect(() => {
    const poll = () =>
      apiGet<{ execution_mode: string }>("/risk/status")
        .then((d) => {
          if (d.execution_mode) {
            execModeRef.current = d.execution_mode;
            setExecMode(d.execution_mode);
          }
        })
        .catch(() => {});
    void poll();
    const i = setInterval(poll, 20_000);
    return () => clearInterval(i);
  }, []);

  // ── Auto-exec intent submit ──────────────────────────────────────────────
  const submitSignalAsIntent = useCallback(async (sig: SseSignal) => {
    try {
      await apiPost("/intent/submit", {
        symbol: sig.symbol,
        direction: sig.direction,
        confidence_pct: sig.confidence,
        price: sig.price,
        leverage: sig.suggested_leverage,
        atr_pct: sig.trace.factors.atrPct,
        agent_source: sig.source,
        mode: "paper",
        decision_trace: [sig.trace.why_entry, sig.trace.why_stop],
      });
      setAutoExecLog((prev) => [
        { symbol: sig.symbol, direction: sig.direction, grade: sig.trace.grade, at: new Date().toLocaleTimeString(), status: "submitted" as const },
        ...prev,
      ].slice(0, 5));
      toast({
        kind: "autoexec",
        title: `AUTO EXEC — ${sig.direction} ${sig.symbol}`,
        body: `${sig.trace.grade}-grade · conf ${sig.confidence}% · entry $${sig.entry.toFixed(2)} · paper ledger`,
        durationMs: 6000,
      });
    } catch {
      setAutoExecLog((prev) => [
        { symbol: sig.symbol, direction: sig.direction, grade: sig.trace.grade, at: new Date().toLocaleTimeString(), status: "cancelled" as const },
        ...prev,
      ].slice(0, 5));
      toast({
        kind: "error",
        title: `Auto-exec başarısız — ${sig.symbol}`,
        body: "Intent gönderimi sırasında hata oluştu",
        durationMs: 5000,
      });
    }
  }, []);

  // ── Auto-confirm countdown ticker ───────────────────────────────────────
  useEffect(() => {
    if (!pendingAutoExec || pendingAutoExec.submitted) return;
    if (pendingAutoExec.countdown <= 0) {
      const sig = pendingAutoExec.signal;
      setPendingAutoExec((p) => (p ? { ...p, submitted: true } : null));
      void submitSignalAsIntent(sig).then(() => setTimeout(() => setPendingAutoExec(null), 2500));
      return;
    }
    const t = setTimeout(() => {
      setPendingAutoExec((p) => (p ? { ...p, countdown: p.countdown - 1 } : null));
    }, 1000);
    return () => clearTimeout(t);
  }, [pendingAutoExec, submitSignalAsIntent]);

  // Watchlist'ten sembol listesini çek
  useEffect(() => {
    apiGet<{ symbols: string[] }>("/watchlist/symbols")
      .then((d) => {
        if (d.symbols && d.symbols.length > 0) setWatchlistSymbols(d.symbols);
      })
      .catch(() => {});
  }, []);

  // OHLCV polling
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await apiGet<OhlcvResponse>(
          `/markets/ohlcv?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=60`,
        );
        if (!cancelled) {
          setCandles(res.candles);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchData();
    const i = setInterval(fetchData, 15_000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [symbol, timeframe]);

  // Orderbook polling
  useEffect(() => {
    let cancelled = false;
    const fetchBook = async () => {
      try {
        const res = await apiGet<OrderbookResp>(
          `/markets/orderbook?symbol=${encodeURIComponent(symbol)}&depth=25`,
        );
        if (!cancelled) setBook(res);
      } catch {
        // best-effort
      }
    };
    void fetchBook();
    const i = setInterval(fetchBook, 6_000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [symbol]);

  // Signal SSE
  useEffect(() => {
    const sse = new EventSource(apiSseUrl("/signals/stream"));
    sse.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as
          | (SseSignal & { type: "signal" })
          | { type: "handshake" };
        if (payload.type !== "signal") return;
        setSignals((prev) => [payload, ...prev].slice(0, 12));

        // ── Auto-exec trigger for grade A/B signals ──────────────────────
        const grade = payload.trace.grade;
        if (grade === "A" || grade === "B") {
          const mode = execModeRef.current;
          if (mode === "full_auto") {
            void (async () => {
              await submitSignalAsIntent(payload);
            })();
          } else if (mode === "auto_confirm") {
            setPendingAutoExec((prev) => {
              if (!prev || prev.submitted) {
                return { signal: payload, countdown: 10, submitted: false };
              }
              return prev;
            });
          }
        }
      } catch {
        // ignore
      }
    };
    sse.onerror = () => {};
    return () => sse.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chartData = candles.map((c) => ({
    time: new Date(c.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    price: c.close,
  }));
  const last = candles[candles.length - 1];
  const first = candles[0];
  const change = last && first ? ((last.close - first.open) / first.open) * 100 : 0;

  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const execModeLabel: Record<string, { label: string; color: string }> = {
    paper:        { label: "PAPER",     color: "#A78BFA" },
    semi:         { label: "SEMI",      color: "#38BDF8" },
    auto_confirm: { label: "AUTO CONF", color: "#F59E0B" },
    full_auto:    { label: "FULL AUTO", color: "#FF4D6D" },
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050505] relative z-10 overflow-hidden">

      {/* ── Auto-Confirm Countdown Overlay ─────────────────────────────────── */}
      {pendingAutoExec && (
        <div
          className="absolute top-4 right-4 z-50 rounded-2xl border p-4 flex flex-col gap-3 shadow-2xl w-72"
          style={{
            background: "rgba(10,12,22,0.97)",
            borderColor: pendingAutoExec.submitted ? "rgba(0,201,167,0.4)" : "rgba(245,158,11,0.4)",
            boxShadow: pendingAutoExec.submitted
              ? "0 0 30px rgba(0,201,167,0.2)"
              : "0 0 30px rgba(245,158,11,0.2)",
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={13} style={{ color: pendingAutoExec.submitted ? "#00C9A7" : "#F59E0B" }} />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider"
                style={{ color: pendingAutoExec.submitted ? "#00C9A7" : "#F59E0B" }}>
                {pendingAutoExec.submitted ? "Emir Gönderildi" : "AUTO CONFIRM"}
              </span>
            </div>
            {!pendingAutoExec.submitted && (
              <button
                onClick={() => {
                  setAutoExecLog((prev) => [{
                    symbol: pendingAutoExec.signal.symbol,
                    direction: pendingAutoExec.signal.direction,
                    grade: pendingAutoExec.signal.trace.grade,
                    at: new Date().toLocaleTimeString(),
                    status: "cancelled" as const,
                  }, ...prev].slice(0, 5));
                  setPendingAutoExec(null);
                }}
                className="w-6 h-6 flex items-center justify-center rounded-lg border border-white/10 hover:border-white/30 transition-colors"
                style={{ color: "var(--color-muted)" }}
              >
                <X size={11} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span
              className="text-xs font-bold font-mono px-2 py-0.5 rounded"
              style={{
                background: pendingAutoExec.signal.direction === "LONG" ? "rgba(0,201,167,0.15)" : "rgba(255,77,109,0.15)",
                color: pendingAutoExec.signal.direction === "LONG" ? "#00C9A7" : "#FF4D6D",
              }}
            >
              {pendingAutoExec.signal.direction}
            </span>
            <span className="text-xs font-bold text-white">{pendingAutoExec.signal.symbol}</span>
            <span
              className={clsx("text-[9px] px-1.5 py-0.5 rounded font-bold border",
                GRADE_COLOR[pendingAutoExec.signal.trace.grade])}
            >
              {pendingAutoExec.signal.trace.grade}·{pendingAutoExec.signal.trace.confluence}/5
            </span>
          </div>

          <div className="flex gap-3 text-[9px] font-mono" style={{ color: "var(--color-muted)" }}>
            <span>Güven <span className="text-white">{pendingAutoExec.signal.confidence}%</span></span>
            <span>Giriş <span className="text-white">{pendingAutoExec.signal.entry.toFixed(2)}</span></span>
            <span>RR <span className="text-white">{pendingAutoExec.signal.rr}</span></span>
          </div>

          {!pendingAutoExec.submitted ? (
            <div className="flex items-center gap-3">
              <div
                className="relative flex-1 h-1.5 rounded-full overflow-hidden"
                style={{ background: "rgba(245,158,11,0.15)" }}
              >
                <div
                  className="absolute left-0 top-0 h-full rounded-full transition-all"
                  style={{
                    width: `${(pendingAutoExec.countdown / 10) * 100}%`,
                    background: pendingAutoExec.countdown <= 3 ? "#FF4D6D" : "#F59E0B",
                  }}
                />
              </div>
              <span
                className="text-sm font-bold font-mono shrink-0 w-5 text-right"
                style={{ color: pendingAutoExec.countdown <= 3 ? "#FF4D6D" : "#F59E0B" }}
              >
                {pendingAutoExec.countdown}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[10px] font-mono" style={{ color: "#00C9A7" }}>
              <CheckCircle2 size={12} />
              Paper ledger'a kaydedildi
            </div>
          )}
        </div>
      )}

      {/* ── Auto-Exec Log (last 5 entries) ──────────────────────────────────── */}
      {autoExecLog.length > 0 && (
        <div className="absolute bottom-4 right-4 z-40 flex flex-col gap-1">
          {autoExecLog.slice(0, 3).map((entry, i) => (
            <div
              key={i}
              className="px-3 py-1.5 rounded-lg border text-[9px] font-mono flex items-center gap-2"
              style={{
                background: entry.status === "submitted" ? "rgba(0,201,167,0.08)" : "rgba(255,77,109,0.08)",
                borderColor: entry.status === "submitted" ? "rgba(0,201,167,0.2)" : "rgba(255,77,109,0.2)",
                color: entry.status === "submitted" ? "#00C9A7" : "#FF4D6D",
                opacity: i === 0 ? 1 : 0.6 - i * 0.1,
              }}
            >
              {entry.status === "submitted" ? "✓" : "✗"}
              <span className="text-white">{entry.symbol}</span>
              <span>{entry.direction}</span>
              <span style={{ color: "var(--color-muted)" }}>{entry.at}</span>
            </div>
          ))}
        </div>
      )}

      <div className="p-3 md:p-6 border-b border-white/5 shrink-0 bg-black/40 backdrop-blur-md flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2 font-['Syne']">
              <Activity size={16} className="text-[#00FFB2] shrink-0" />
              Signal Engine
            </h2>
            <span
              className="text-[9px] font-mono font-bold px-2 py-0.5 rounded border"
              style={{
                color: execModeLabel[execMode]?.color ?? "#A78BFA",
                borderColor: (execModeLabel[execMode]?.color ?? "#A78BFA") + "40",
                background: (execModeLabel[execMode]?.color ?? "#A78BFA") + "15",
              }}
            >
              {execModeLabel[execMode]?.label ?? execMode.toUpperCase()}
            </span>
          </div>
          <p className="text-[10px] md:text-xs text-gray-500 font-mono mt-0.5 md:mt-1 truncate">
            Multi-factor (RSI · EMA · MACD · ATR · Orderflow) · DecisionTrace per signal
          </p>
        </div>
        <div className="flex gap-2 items-center overflow-x-auto no-scrollbar -mx-3 px-3 md:mx-0 md:px-0">
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="bg-black/40 border border-white/10 rounded px-2.5 md:px-3 py-1.5 text-[11px] md:text-xs font-mono text-white shrink-0"
          >
            {watchlistSymbols.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="flex gap-1 shrink-0">
            {TIMEFRAMES.map((t) => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                className={clsx(
                  "px-2 py-1 rounded text-[10px] font-mono",
                  t === timeframe
                    ? "bg-[#00FFB2]/15 text-[#00FFB2] border border-[#00FFB2]/30"
                    : "bg-white/5 text-gray-400 border border-white/10",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-6 font-mono">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="lg:col-span-2 flex flex-col gap-4 md:gap-6">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 md:p-5 flex flex-col h-[280px] md:h-[400px]">
              <div className="flex justify-between items-center mb-4 md:mb-6 gap-2 flex-wrap">
                <div className="flex items-center gap-2 md:gap-3 min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">{symbol}</h3>
                  <span className="text-[10px] bg-[#00FFB2]/20 text-[#00FFB2] px-2 py-0.5 rounded">
                    KuCoin
                  </span>
                  <span className="text-[10px] bg-white/10 text-gray-300 px-2 py-0.5 rounded">
                    {timeframe}
                  </span>
                </div>
                <div className="flex gap-3">
                  <span className={clsx("text-xs font-bold", change >= 0 ? "text-[#00FFB2]" : "text-[#FF4D6D]")}>
                    {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                  </span>
                  <span className="text-xs text-gray-400">
                    Last: {last ? last.close.toFixed(2) : "—"}
                  </span>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                {error && <div className="text-[#FF4D6D] text-xs">{error}</div>}
                {!error && (loading || chartData.length === 0) && (
                  <div className="text-gray-500 text-xs">Veri çekiliyor…</div>
                )}
                {!error && chartData.length > 0 && (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis dataKey="time" stroke="#333" fontSize={10} tickMargin={10} />
                      <YAxis
                        stroke="#333"
                        fontSize={10}
                        domain={["auto", "auto"]}
                        tickFormatter={(v) => `${Number(v).toFixed(0)}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#111",
                          borderColor: "#333",
                          fontSize: "10px",
                        }}
                      />
                      <Line type="monotone" dataKey="price" stroke="#00FFB2" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3 md:p-5">
              <h3 className="text-xs font-bold text-gray-400 uppercase mb-3 md:mb-4 tracking-wider">
                Orderbook & Flow ({symbol})
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                <div className="bg-black/30 border border-white/5 rounded-lg p-3">
                  <div className="text-[9px] text-gray-500 mb-1">Imbalance</div>
                  <div className={clsx("text-sm font-bold", (book?.imbalance ?? 0) >= 0 ? "text-[#00FFB2]" : "text-[#FF4D6D]")}>
                    {book ? `${book.imbalance.toFixed(2)}%` : "…"}
                  </div>
                </div>
                <div className="bg-black/30 border border-white/5 rounded-lg p-3">
                  <div className="text-[9px] text-gray-500 mb-1">Spread</div>
                  <div className="text-sm text-white font-bold">
                    {book ? `${book.spreadPct.toFixed(4)}%` : "…"}
                  </div>
                </div>
                <div className="bg-black/30 border border-white/5 rounded-lg p-3">
                  <div className="text-[9px] text-gray-500 mb-1">Bid Wall</div>
                  <div className="text-sm text-[#00FFB2] font-bold">
                    {book ? book.bidWall.toFixed(2) : "…"}
                  </div>
                </div>
                <div className="bg-black/30 border border-white/5 rounded-lg p-3">
                  <div className="text-[9px] text-gray-500 mb-1">Ask Wall</div>
                  <div className="text-sm text-[#FF4D6D] font-bold">
                    {book ? book.askWall.toFixed(2) : "…"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 md:gap-6">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 md:p-5 flex-1 flex flex-col min-h-[400px] md:min-h-0">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <Target size={14} />
                  Signal Stream + DecisionTrace
                </h3>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00FFB2] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00FFB2]"></span>
                </span>
              </div>

              <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-2">
                {signals.length === 0 && (
                  <div className="text-gray-500 text-[11px] italic">
                    Sinyal akışı bekleniyor… (ilk olay ~8s içinde)
                  </div>
                )}
                {signals.map((s) => {
                  const id = s.timestamp + s.symbol;
                  const open = expanded[id];
                  return (
                    <div key={id} className="bg-black/40 border border-white/5 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggle(id)}
                        className="w-full p-3 hover:bg-white/5 transition-colors text-left"
                      >
                        <div className="flex justify-between items-start gap-2 mb-1.5">
                          <div className="flex gap-1.5 items-center flex-wrap">
                            <span className={clsx("text-[9px] px-1.5 py-0.5 rounded font-bold border", GRADE_COLOR[s.trace.grade])}>
                              {s.trace.grade}·{s.trace.confluence}/5
                            </span>
                            <span className={clsx(
                              "text-[9px] px-1.5 py-0.5 rounded font-bold",
                              s.direction === "LONG" ? "bg-[#00FFB2]/20 text-[#00FFB2]" : "bg-[#FF4D6D]/20 text-[#FF4D6D]"
                            )}>
                              {s.direction}
                            </span>
                            <span className="text-xs text-white font-bold">{s.symbol}</span>
                            <span className="text-[9px] text-gray-500 uppercase">{s.source}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className={clsx("text-xs font-bold", s.confidence > 80 ? "text-[#00FFB2]" : "text-amber-400")}>
                              {s.confidence}%
                            </span>
                            {open ? <ChevronDown size={12} className="text-gray-500" /> : <ChevronRight size={12} className="text-gray-500" />}
                          </div>
                        </div>
                        <div className="flex gap-3 text-[10px] text-gray-400 flex-wrap">
                          <span>entry <span className="text-white font-mono">{s.entry.toFixed(2)}</span></span>
                          <span>SL <span className="text-[#FF4D6D] font-mono">{s.stop_loss.toFixed(2)}</span></span>
                          <span>TP <span className="text-[#00FFB2] font-mono">{s.take_profit.toFixed(2)}</span></span>
                          <span>RR <span className="text-white">{s.rr}</span></span>
                          <span>Lev <span className="text-white">{s.suggested_leverage}x</span></span>
                        </div>
                      </button>
                      {open && (
                        <div className="px-3 pb-3 pt-1 border-t border-white/5 bg-black/30">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 text-[9px] mt-2 mb-2.5">
                            {Object.entries(s.trace.factors).map(([k, v]) => (
                              <div key={k} className="bg-white/5 border border-white/5 rounded px-1.5 py-1">
                                <div className="text-gray-500 truncate">{k}</div>
                                <div className="text-white font-mono">
                                  {typeof v === "number" ? v.toFixed(v < 1 && v > 0 ? 4 : 2) : String(v)}
                                </div>
                              </div>
                            ))}
                          </div>
                          {[
                            ["Why entry", s.trace.why_entry],
                            ["Why size", s.trace.why_size],
                            ["Why stop", s.trace.why_stop],
                            ["Why leverage", s.trace.why_leverage],
                          ].map(([label, txt]) => (
                            <div key={label} className="mb-1.5">
                              <div className="text-[9px] text-[#00FFB2] uppercase tracking-wider">{label}</div>
                              <div className="text-[10px] text-gray-300 leading-relaxed">{txt}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
