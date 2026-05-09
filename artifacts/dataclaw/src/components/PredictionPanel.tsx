import { useState, useEffect } from "react";
import { RefreshCw, TrendingUp, TrendingDown, Minus, Brain, AlertCircle, Loader2 } from "lucide-react";
import { clsx } from "clsx";

interface PredictionMarket {
  id: string;
  question: string;
  description: string;
  endDate: string | null;
  outcomes: string[];
  outcomePrices: number[];
  volumeUsd: number;
  slug: string;
}

interface MarketsResponse {
  markets: PredictionMarket[];
  count: number;
  fetchedAt: number;
  stale?: boolean;
}

interface InterpretResponse {
  interpretation: string;
  model: string;
  analyzedCount: number;
}

function ProbBar({ yes, no }: { yes: number; no: number }) {
  const yPct = (yes * 100).toFixed(1);
  const nPct = (no * 100).toFixed(1);
  const barColor =
    yes >= 0.65 ? "#00C176" :
    yes <= 0.35 ? "#F04A5A" :
    "#F59E0B";

  return (
    <div>
      <div className="flex justify-between text-[9px] mb-1">
        <span style={{ color: "#00C176" }} className="font-bold">EVET {yPct}%</span>
        <span style={{ color: "#F04A5A" }} className="font-bold">HAYIR {nPct}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(240,74,90,0.25)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${yes * 100}%`, background: `linear-gradient(90deg, ${barColor}, ${barColor}CC)` }}
        />
      </div>
    </div>
  );
}

function SignalIcon({ yes }: { yes: number }) {
  if (yes >= 0.65) return <TrendingUp size={14} className="text-[#00C176]" />;
  if (yes <= 0.35) return <TrendingDown size={14} className="text-[#F04A5A]" />;
  return <Minus size={14} className="text-[var(--color-muted)]" />;
}

function formatVol(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

export default function PredictionPanel() {
  const [markets, setMarkets] = useState<PredictionMarket[]>([]);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [interpreting, setInterpreting] = useState(false);
  const [interpError, setInterpError] = useState<string | null>(null);

  async function loadMarkets() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/prediction/markets");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: MarketsResponse = await r.json();
      setMarkets(d.markets);
      setFetchedAt(d.fetchedAt);
      setStale(!!d.stale);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function interpret() {
    if (!markets.length) return;
    setInterpreting(true);
    setInterpError(null);
    try {
      const r = await fetch("/api/prediction/interpret", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markets: markets.slice(0, 10) }),
      });
      if (r.status === 402) {
        const d = await r.json().catch(() => ({}));
        if (d?.requiresUpgrade) window.dispatchEvent(new CustomEvent("nexus:paywall", { detail: d }));
        setInterpError(d?.message || "Plan upgrade required");
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: InterpretResponse = await r.json();
      setInterpretation(d.interpretation);
    } catch (e: any) {
      setInterpError("Claude yorumu alınamadı: " + e.message);
    } finally {
      setInterpreting(false);
    }
  }

  useEffect(() => {
    loadMarkets();
    const t = setInterval(loadMarkets, 120_000);
    return () => clearInterval(t);
  }, []);

  const timeAgo = fetchedAt
    ? Math.floor((Date.now() - fetchedAt) / 1000) < 60
      ? "Az önce"
      : `${Math.floor((Date.now() - fetchedAt) / 60000)} dk önce`
    : null;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]" style={{ fontFamily: "'Syne', sans-serif" }}>
            Prediction Markets
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Polymarket · Kripto Tahmin Piyasaları
            {timeAgo && <span className="ml-2 opacity-60">{timeAgo}</span>}
            {stale && <span className="ml-2 text-[var(--color-warning)]">⚠ eski veri</span>}
          </p>
        </div>
        <button
          onClick={loadMarkets}
          disabled={loading}
          className="p-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-accent)] transition-colors"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Claude Interpret Button */}
      <div className="mb-5">
        <button
          onClick={interpret}
          disabled={interpreting || markets.length === 0}
          className={clsx(
            "flex items-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm w-full justify-center transition-all border",
            interpreting || markets.length === 0
              ? "opacity-50 cursor-not-allowed bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)]"
              : "bg-[var(--color-accent)] border-[var(--color-accent)] text-[var(--color-text-inv)] hover:opacity-90"
          )}
        >
          {interpreting ? (
            <><Loader2 size={15} className="animate-spin" /> Claude ile Yorumlanıyor…</>
          ) : (
            <><Brain size={15} /> AI ile Yorumla (Claude Sonnet)</>
          )}
        </button>

        {interpretation && (
          <div className="mt-3 p-4 rounded-xl border border-[var(--color-accent)] bg-[var(--color-accent-dim)] animate-fade-in">
            <div className="flex items-center gap-2 mb-2">
              <Brain size={13} style={{ color: "var(--color-accent)" }} />
              <span className="text-xs font-bold text-[var(--color-accent)]">Claude Yorumu</span>
            </div>
            <p className="text-sm text-[var(--color-text)] leading-relaxed">{interpretation}</p>
          </div>
        )}

        {interpError && (
          <div className="mt-2 p-3 rounded-xl border border-[var(--color-danger)] bg-[rgba(240,74,90,0.08)] text-[var(--color-danger)] text-xs flex items-center gap-2">
            <AlertCircle size={13} /> {interpError}
          </div>
        )}
      </div>

      {/* Market Cards */}
      {loading && markets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 size={28} className="animate-spin text-[var(--color-accent)]" />
          <span className="text-sm text-[var(--color-muted)]">Polymarket piyasaları yükleniyor…</span>
        </div>
      ) : error && markets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <AlertCircle size={28} className="text-[var(--color-danger)]" />
          <span className="text-sm text-[var(--color-muted)]">Piyasa verisi alınamadı: {error}</span>
          <button onClick={loadMarkets} className="text-xs text-[var(--color-accent)] underline">Tekrar dene</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {markets.map((m) => {
            const yes = m.outcomePrices[0] ?? 0;
            const no = m.outcomePrices[1] ?? 1 - yes;
            return (
              <div
                key={m.id}
                className="p-4 rounded-xl border bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-accent)] transition-all duration-200 hover:shadow-md"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                {/* Question */}
                <div className="flex items-start gap-2 mb-3">
                  <SignalIcon yes={yes} />
                  <p className="text-sm font-semibold text-[var(--color-text)] leading-snug flex-1">{m.question}</p>
                </div>

                {/* Probability bar */}
                <ProbBar yes={yes} no={no} />

                {/* Metadata */}
                <div className="flex items-center gap-3 mt-3 text-[10px] text-[var(--color-muted)]">
                  <span className="flex items-center gap-1">
                    <TrendingUp size={9} />
                    {formatVol(m.volumeUsd)}
                  </span>
                  {m.endDate && (
                    <span>Bitiş: {formatDate(m.endDate)}</span>
                  )}
                  <span className={clsx(
                    "ml-auto px-2 py-0.5 rounded-full text-[9px] font-bold",
                    yes >= 0.65 ? "bg-[rgba(0,193,118,0.12)] text-[#00C176]" :
                    yes <= 0.35 ? "bg-[rgba(240,74,90,0.12)] text-[#F04A5A]" :
                    "bg-[rgba(245,158,11,0.12)] text-[#F59E0B]"
                  )}>
                    {yes >= 0.65 ? "BOĞA" : yes <= 0.35 ? "AYI" : "NÖTR"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {markets.length > 0 && (
        <div className="mt-6 text-center text-[10px] text-[var(--color-muted)]">
          {markets.length} piyasa · Polymarket · Her 2 dakikada otomatik güncellenir
        </div>
      )}
    </div>
  );
}
