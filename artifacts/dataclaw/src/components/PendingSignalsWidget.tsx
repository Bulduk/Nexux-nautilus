import { useState, useEffect, useCallback } from "react";
import { Bell, CheckCircle, XCircle, RefreshCw, Clock, AlertCircle } from "lucide-react";
import { apiGet } from "../lib/api";
import { clsx } from "clsx";

interface PendingSignal {
  id: number;
  signalId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  confidence: string;
  reason: string | null;
  price: string;
  entry: string | null;
  stopLoss: string | null;
  takeProfit: string | null;
  rr: string | null;
  suggestedLeverage: number | null;
  source: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
}

interface PatchResult {
  ok: boolean;
  signal?: PendingSignal;
  action?: string;
}

function timeLeft(expiresAt: string | null): string {
  if (!expiresAt) return "";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "süresi doldu";
  const min = Math.floor(diff / 60000);
  const sec = Math.floor((diff % 60000) / 1000);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default function PendingSignalsWidget() {
  const [pending, setPending] = useState<PendingSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<{ id: string; action: string } | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<{ pending: PendingSignal[] }>("/signals/pending");
      setPending(d.pending ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, [load]);

  // Countdown timer
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const action = async (signalId: string, act: "approve" | "reject") => {
    setActioning(signalId);
    try {
      await fetch(`/api/signals/pending/${encodeURIComponent(signalId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: act }),
      });
      setLastAction({ id: signalId, action: act });
      setPending((prev) => prev.filter((s) => s.signalId !== signalId));
    } catch {
      // ignore
    } finally {
      setActioning(null);
    }
  };

  void tick; // forces re-render for countdown

  if (pending.length === 0 && !loading) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <Bell size={13} className="text-amber-400" />
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
          SEMI — Onay Bekleyen Sinyaller ({pending.length})
        </span>
        {loading && <RefreshCw size={10} className="animate-spin text-gray-500 ml-auto" />}
      </div>
      {pending.map((sig) => {
        const confidence = Number(sig.confidence);
        const rr = sig.rr ? Number(sig.rr).toFixed(2) : "—";
        const price = sig.price ? Number(sig.price).toFixed(2) : "—";
        const sl = sig.stopLoss ? Number(sig.stopLoss).toFixed(2) : "—";
        const tp = sig.takeProfit ? Number(sig.takeProfit).toFixed(2) : "—";
        const tLeft = timeLeft(sig.expiresAt);
        const expired = sig.expiresAt && new Date(sig.expiresAt).getTime() < Date.now();
        return (
          <div
            key={sig.signalId}
            className={clsx(
              "rounded-xl border p-3 flex flex-col gap-2",
              expired ? "opacity-50 border-white/5" : "border-amber-500/30",
            )}
            style={{ background: expired ? "var(--color-surface)" : "rgba(245, 158, 11, 0.05)" }}
          >
            {/* Top row */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-bold font-mono px-2 py-0.5 rounded"
                  style={{
                    background: sig.direction === "LONG" ? "rgba(0,201,167,0.15)" : "rgba(255,77,109,0.15)",
                    color: sig.direction === "LONG" ? "#00C9A7" : "#FF4D6D",
                  }}
                >
                  {sig.direction}
                </span>
                <span className="text-xs font-bold font-mono" style={{ color: "var(--color-text)" }}>
                  {sig.symbol}
                </span>
                <span className="text-[9px] font-mono text-amber-400 font-bold">
                  {confidence}% conf
                </span>
                <span className="text-[9px] font-mono" style={{ color: "var(--color-muted)" }}>
                  RR {rr}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {expired ? (
                  <span className="text-[9px] font-mono text-red-400 flex items-center gap-1">
                    <AlertCircle size={10} /> Süresi doldu
                  </span>
                ) : (
                  <span className="text-[9px] font-mono text-amber-400/70 flex items-center gap-1">
                    <Clock size={10} /> {tLeft}
                  </span>
                )}
              </div>
            </div>

            {/* Price row */}
            <div className="flex gap-3 text-[9px] font-mono" style={{ color: "var(--color-muted)" }}>
              <span>Fiyat <span className="text-white">{price}</span></span>
              <span>SL <span className="text-red-400">{sl}</span></span>
              <span>TP <span className="text-green-400">{tp}</span></span>
              <span>Lev <span className="text-white">{sig.suggestedLeverage ?? 1}x</span></span>
            </div>

            {sig.reason && (
              <p className="text-[9px] font-mono leading-relaxed" style={{ color: "var(--color-muted)" }}>
                {sig.reason}
              </p>
            )}

            {/* Actions */}
            {!expired && (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => action(sig.signalId, "approve")}
                  disabled={actioning === sig.signalId}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-mono text-xs font-bold border transition-all"
                  style={{
                    background: "rgba(0,201,167,0.1)",
                    borderColor: "#00C9A7" + "50",
                    color: "#00C9A7",
                    opacity: actioning === sig.signalId ? 0.5 : 1,
                  }}
                >
                  {actioning === sig.signalId ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                  ONAYLA
                </button>
                <button
                  onClick={() => action(sig.signalId, "reject")}
                  disabled={actioning === sig.signalId}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-mono text-xs font-bold border transition-all"
                  style={{
                    background: "rgba(255,77,109,0.1)",
                    borderColor: "#FF4D6D" + "50",
                    color: "#FF4D6D",
                    opacity: actioning === sig.signalId ? 0.5 : 1,
                  }}
                >
                  <XCircle size={11} />
                  REDDET
                </button>
              </div>
            )}
          </div>
        );
      })}
      {lastAction && (
        <div
          className="text-[9px] font-mono px-2 py-1.5 rounded border"
          style={{
            color: lastAction.action === "approve" ? "#00C9A7" : "#FF4D6D",
            borderColor: lastAction.action === "approve" ? "#00C9A7" + "30" : "#FF4D6D" + "30",
            background: lastAction.action === "approve" ? "rgba(0,201,167,0.05)" : "rgba(255,77,109,0.05)",
          }}
        >
          {lastAction.action === "approve" ? "✓ Onaylandı" : "✗ Reddedildi"} — {lastAction.id}
        </div>
      )}
    </div>
  );
}
