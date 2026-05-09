import { useEffect, useState, useCallback } from "react";
import { useSimEngine } from "../state/simEngine";
import { BarChart2, Shield, ScrollText, Beaker, Wallet, RefreshCw, TrendingUp } from "lucide-react";
import { clsx } from "clsx";
import { useTickers } from "../hooks/useTickers";
import { usePersistentStore } from "../state/persistentStore";
import { apiGet, apiPost } from "../lib/api";
import PendingSignalsWidget from "./PendingSignalsWidget";
import { toast } from "../state/toastStore";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";

const TRACKED = ["BTC/USDT", "ETH/USDT", "SOL/USDT"];

type InnerTab = "live" | "paper" | "ledger";

type RiskProfile = import("../state/persistentStore").RiskProfileLocal & { updatedAt?: number };

interface RiskStatus {
  profile: RiskProfile;
  stats: { isoDate: string; realizedPnlUsd: number; tradeCount: number; drawdownPct: number };
  open_positions: number;
  gross_exposure_usd: number;
  daily_loss_remaining_usd: number;
  capacity_remaining_usd: number;
}

interface LedgerEntry {
  id: string;
  ts: number;
  type: string;
  intentId?: string;
  symbol?: string;
  side?: string;
  notionalUsd?: number;
  qty?: number;
  price?: number;
  exchange?: string;
  mode?: string;
  agent?: string;
  detail: string;
}

interface OpenPos {
  intentId: string;
  symbol: string;
  side: string;
  qty: number;
  entryPrice: number;
  notionalUsd: number;
  exchange: string;
  mode: string;
  openedAt: number;
}

export default function PortfolioPanel() {
  const [innerTab, setInnerTab] = useState<InnerTab>("live");
  const { mode } = usePersistentStore();

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050505] relative z-10 overflow-hidden text-white font-mono">
      <div className="p-3 md:p-6 border-b border-white/5 shrink-0 bg-black/40 backdrop-blur-md flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2 font-['Syne']">
            <BarChart2 size={16} className="text-[#00FFB2] shrink-0" />
            Execution Engine
          </h2>
          <p className="text-[10px] md:text-xs text-gray-500 font-mono mt-0.5 md:mt-1 truncate">
            RiskGuard · Intent → PolicyGuard → Ledger
            {mode === "live" && <span className="ml-1 text-[#FF4D6D]">· LIVE</span>}
          </p>
        </div>
        <div className="flex gap-1 bg-black/40 border border-white/10 rounded-lg p-1">
          {([
            ["live", "Live", Shield],
            ["paper", "Paper", Beaker],
            ["ledger", "Ledger", ScrollText],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setInnerTab(id)}
              className={clsx(
                "px-3 py-1.5 rounded-md text-[10px] md:text-xs font-bold flex items-center gap-1.5 transition-colors",
                innerTab === id
                  ? "bg-[#00FFB2]/15 text-[#00FFB2] border border-[#00FFB2]/30"
                  : "text-gray-500 hover:text-gray-300 border border-transparent",
              )}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {innerTab === "live" && <LiveTradingTab />}
        {innerTab === "paper" && <PaperTab />}
        {innerTab === "ledger" && <LedgerTab />}
      </div>
    </div>
  );
}

// ───────── BINANCE BALANCE WIDGET ─────────
interface BalanceData {
  live: boolean;
  exchange?: string;
  balances?: Record<string, number>;
  message?: string;
  error?: string;
}

function BinanceBalanceWidget() {
  const [bal, setBal] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<BalanceData>("/account/balance");
      setBal(d);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const i = setInterval(load, 30_000);
    return () => clearInterval(i);
  }, [load]);

  if (!bal) return null;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <Wallet size={14} className="text-[#00FFB2]" />
          Borsa Bakiyesi
          {bal.exchange && (
            <span className="text-[9px] bg-[#00FFB2]/10 text-[#00FFB2] px-1.5 py-0.5 rounded font-normal capitalize">
              {bal.exchange}
            </span>
          )}
        </h3>
        <button
          onClick={load}
          disabled={loading}
          className="p-1 rounded transition-colors text-gray-500 hover:text-gray-300"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {!bal.live ? (
        <div className="text-xs text-amber-400 font-mono bg-amber-500/10 border border-amber-500/20 rounded p-2">
          {bal.message ?? "API anahtarları yapılandırılmamış — Config → Exchanges'e git"}
        </div>
      ) : bal.error ? (
        <div className="text-xs text-red-400 font-mono bg-red-500/10 border border-red-500/20 rounded p-2">
          {bal.error}
        </div>
      ) : bal.balances ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5">
          {Object.entries(bal.balances)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 15)
            .map(([asset, amount]) => (
              <div key={asset} className="bg-black/30 border border-white/5 rounded p-2">
                <div className="text-[9px] text-gray-500 mb-0.5">{asset}</div>
                <div className="text-xs font-bold font-mono text-white">
                  {amount < 0.001 ? amount.toExponential(2) : amount.toFixed(4)}
                </div>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}

// ───────── LIVE TRADING TAB (Risk profile + Intent submitter + Open positions) ─────────
function LiveTradingTab() {
  const { riskProfile, setRiskProfile } = usePersistentStore();
  const [status, setStatus] = useState<RiskStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Sync once
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const s = await apiGet<RiskStatus>("/risk/status");
        if (cancelled) return;
        setStatus(s);
        setRiskProfile(s.profile);
      } catch {
        // ignore
      }
    };
    void load();
    const i = setInterval(load, 6000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [setRiskProfile]);

  const persist = async (next: Partial<RiskProfile>) => {
    setRiskProfile(next);
    setBusy(true);
    try {
      const updated = await apiPost<RiskProfile>("/risk/profile", next);
      setRiskProfile(updated);
      setSavedAt(Date.now());
    } finally {
      setBusy(false);
    }
  };

  const armToggle = async () => {
    setBusy(true);
    try {
      const updated = await apiPost<RiskProfile>("/risk/arm", { armed: !riskProfile.liveTradingArmed });
      setRiskProfile(updated);
    } finally {
      setBusy(false);
    }
  };

  const killToggle = async () => {
    setBusy(true);
    try {
      const updated = await apiPost<RiskProfile>("/risk/kill", { engaged: !riskProfile.killSwitchEngaged });
      setRiskProfile(updated);
    } finally {
      setBusy(false);
    }
  };

  type NumKey = "maxLeverage" | "maxPositionSizeUsd" | "maxGrossExposureUsd" | "maxOpenPositions" | "dailyLossLimitUsd" | "maxDrawdownPct" | "minConfidenceCore" | "minConfidenceExternal" | "cooldownSecPerSymbol" | "maxAtrPct";
  const fields: Array<[NumKey, string, string, number, number, number]> = [
    ["maxLeverage", "Max Leverage", "x", 1, 20, 1],
    ["maxPositionSizeUsd", "Max Position Size", "USD", 10, 50000, 10],
    ["maxGrossExposureUsd", "Max Gross Exposure", "USD", 50, 500000, 50],
    ["maxOpenPositions", "Max Open Positions", "", 1, 50, 1],
    ["dailyLossLimitUsd", "Daily Loss Limit", "USD", 5, 50000, 5],
    ["maxDrawdownPct", "Max Drawdown", "%", 1, 100, 0.5],
    ["minConfidenceCore", "Min Confidence (core)", "%", 50, 100, 1],
    ["minConfidenceExternal", "Min Confidence (external)", "%", 60, 100, 1],
    ["cooldownSecPerSymbol", "Cooldown / symbol", "sec", 0, 3600, 5],
    ["maxAtrPct", "Max ATR%", "%", 0.5, 20, 0.1],
  ];

  return (
    <div className="p-3 md:p-6 flex flex-col gap-4 md:gap-6">
      {/* Status banner */}
      <div className={clsx(
        "rounded-xl border p-3 md:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3",
        riskProfile.killSwitchEngaged
          ? "bg-red-500/10 border-red-500/30"
          : riskProfile.liveTradingArmed
          ? "bg-[#00FFB2]/5 border-[#00FFB2]/30"
          : "bg-amber-500/5 border-amber-500/30"
      )}>
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-400">System Status</div>
          <div className="text-sm md:text-base font-bold mt-1">
            {riskProfile.killSwitchEngaged
              ? "KILL SWITCH ENGAGED — all live orders blocked"
              : riskProfile.liveTradingArmed
              ? "LIVE TRADING ARMED — real orders will be sent"
              : "LIVE TRADING DISARMED — only paper / dry-runs allowed"}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={armToggle}
            disabled={busy || riskProfile.killSwitchEngaged}
            className={clsx(
              "px-3 py-2 rounded-md text-[10px] md:text-xs font-bold border transition-colors",
              riskProfile.liveTradingArmed
                ? "bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25"
                : "bg-[#00FFB2]/10 text-[#00FFB2] border-[#00FFB2]/30 hover:bg-[#00FFB2]/20",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            )}
          >
            {riskProfile.liveTradingArmed ? "DISARM LIVE" : "ARM LIVE"}
          </button>
          <button
            onClick={killToggle}
            disabled={busy}
            className={clsx(
              "px-3 py-2 rounded-md text-[10px] md:text-xs font-bold border transition-colors",
              riskProfile.killSwitchEngaged
                ? "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"
                : "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20",
            )}
          >
            {riskProfile.killSwitchEngaged ? "RELEASE KILL" : "ENGAGE KILL"}
          </button>
        </div>
      </div>

      {/* Live exposure stats */}
      {status && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ["Open Positions", `${status.open_positions} / ${status.profile.maxOpenPositions}`, "text-blue-400"],
            ["Gross Exposure", `$${status.gross_exposure_usd.toFixed(0)} / $${status.profile.maxGrossExposureUsd}`, "text-white"],
            ["Daily PnL", `${status.stats.realizedPnlUsd >= 0 ? "+" : ""}$${status.stats.realizedPnlUsd.toFixed(2)}`, status.stats.realizedPnlUsd >= 0 ? "text-[#00FFB2]" : "text-[#FF4D6D]"],
            ["Loss Budget Left", `$${status.daily_loss_remaining_usd.toFixed(2)}`, status.daily_loss_remaining_usd < 20 ? "text-amber-400" : "text-gray-300"],
          ].map(([label, val, cls]) => (
            <div key={label as string} className="bg-white/5 border border-white/10 rounded-xl p-3">
              <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">{label}</div>
              <div className={clsx("text-base md:text-lg font-bold font-sans", cls)}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Risk profile editor */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-3 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <Shield size={14} className="text-[#00FFB2]" />
            Hard Risk Limits (server-enforced)
          </h3>
          {savedAt && (
            <span className="text-[9px] text-[#00FFB2]">
              ✓ saved {Math.max(0, Math.round((Date.now() - savedAt) / 1000))}s ago
            </span>
          )}
        </div>
        <p className="text-[10px] text-gray-500 mb-4 leading-relaxed">
          Bu limitler tüm işlemlerde sunucu tarafında zorlanır. AI ajan bu sınırları geçemez.
          Her intent <code className="text-[#00FFB2]">PolicyGuard</code>'in 11 kontrolünden geçer.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fields.map(([key, label, unit, min, max, step]) => (
            <label key={String(key)} className="flex flex-col gap-1.5 bg-black/30 border border-white/5 rounded-lg p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400 uppercase">{label}</span>
                <span className="text-[10px] text-[#00FFB2] font-bold font-sans">
                  {Number(riskProfile[key])}{unit && ` ${unit}`}
                </span>
              </div>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={Number(riskProfile[key])}
                onChange={(e) => setRiskProfile({ [key]: Number(e.target.value) } as Partial<RiskProfile>)}
                onMouseUp={(e) => persist({ [key]: Number((e.target as HTMLInputElement).value) } as Partial<RiskProfile>)}
                onTouchEnd={(e) => persist({ [key]: Number((e.target as HTMLInputElement).value) } as Partial<RiskProfile>)}
                className="w-full accent-[#00FFB2]"
              />
            </label>
          ))}
        </div>
      </div>

      <BinanceBalanceWidget />
      <PendingSignalsWidget />
      <IntentSubmitter />
      <OpenPositionsTable />
    </div>
  );
}

function IntentSubmitter() {
  const { riskProfile } = usePersistentStore();
  const { data: tickers } = useTickers(TRACKED, 4000);
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [confidence, setConfidence] = useState(78);
  const [equity, setEquity] = useState(1000);
  const [leverage, setLeverage] = useState(1);
  const [evaluation, setEvaluation] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const price = tickers[symbol]?.price ?? 0;

  const evaluate = async () => {
    if (!price) return;
    setBusy(true);
    setSubmitMsg(null);
    try {
      const res = await apiPost<unknown>("/intent/evaluate", {
        symbol,
        direction,
        confidence_pct: confidence,
        price,
        leverage,
        equity_usd: equity,
        agent_kind: "core",
      });
      setEvaluation(res);
    } catch (err) {
      setSubmitMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (mode: "paper" | "live") => {
    if (!price) return;
    if (mode === "live" && !riskProfile.liveTradingArmed) {
      setSubmitMsg("LIVE arm gerekli — yukarıdan ARM LIVE'a bas.");
      return;
    }
    if (mode === "live" && !confirm("Gerçek para ile emir gönderiliyor. Devam edilsin mi?")) return;
    setBusy(true);
    setSubmitMsg(null);
    try {
      const res = await apiPost<{ ok: boolean; intent: { intentId: string }; guard?: { rejectedBy?: string } }>(
        "/intent/submit",
        {
          symbol,
          direction,
          confidence_pct: confidence,
          price,
          leverage,
          equity_usd: equity,
          agent_kind: "core",
          mode,
        },
      );
      if (res.ok) {
        setSubmitMsg(`✓ ${mode.toUpperCase()} fill — ${res.intent.intentId}`);
        toast({
          kind: mode === "live" ? "error" : "autoexec",
          title: `${mode.toUpperCase()} Intent — ${direction} ${symbol}`,
          body: `$${price.toFixed(2)} · conf ${confidence}% · ${res.intent.intentId.slice(0, 10)}`,
          durationMs: 5000,
        });
      } else {
        setSubmitMsg(`✗ rejected: ${res.guard?.rejectedBy ?? "unknown"}`);
        toast({ kind: "warning", title: "Intent reddedildi", body: res.guard?.rejectedBy ?? "PolicyGuard check failed", durationMs: 5000 });
      }
    } catch (err) {
      setSubmitMsg(`✗ ${err instanceof Error ? err.message : String(err)}`);
      toast({ kind: "error", title: "Intent gönderilemedi", body: err instanceof Error ? err.message : String(err), durationMs: 5000 });
    } finally {
      setBusy(false);
    }
  };

  type EvalGuardCheck = { name: string; passed: boolean; detail: string };
  type EvalShape = {
    sizing: { notionalUsd: number; reason: string };
    guard: { ok: boolean; checks: EvalGuardCheck[] };
  };
  const ev = evaluation as EvalShape | null;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3 md:p-5">
      <h3 className="text-xs font-bold text-gray-300 uppercase mb-3 tracking-wider flex items-center gap-2">
        <Shield size={14} className="text-[#00FFB2]" />
        Intent Submitter — PolicyGuard preview
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-3">
        <div>
          <div className="text-[9px] text-gray-500 mb-1">Symbol</div>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs">
            {TRACKED.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <div className="text-[9px] text-gray-500 mb-1">Direction</div>
          <div className="flex gap-1">
            {(["LONG", "SHORT"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDirection(d)}
                className={clsx(
                  "flex-1 py-1.5 rounded text-[10px] font-bold border",
                  direction === d
                    ? d === "LONG" ? "bg-[#00FFB2]/20 text-[#00FFB2] border-[#00FFB2]/30" : "bg-[#FF4D6D]/20 text-[#FF4D6D] border-[#FF4D6D]/30"
                    : "bg-black/30 text-gray-400 border-white/10"
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-gray-500 mb-1">Confidence %</div>
          <input
            type="number"
            min={0} max={100}
            value={confidence}
            onChange={(e) => setConfidence(Number(e.target.value))}
            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
          />
        </div>
        <div>
          <div className="text-[9px] text-gray-500 mb-1">Equity USD</div>
          <input
            type="number"
            min={1}
            value={equity}
            onChange={(e) => setEquity(Number(e.target.value))}
            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
          />
        </div>
        <div>
          <div className="text-[9px] text-gray-500 mb-1">Leverage</div>
          <input
            type="number"
            min={1} max={20}
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
          />
        </div>
      </div>

      <div className="text-[10px] text-gray-500 mb-3">
        Live price: <span className="text-white font-mono">${price ? price.toFixed(2) : "…"}</span>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        <button
          onClick={evaluate}
          disabled={busy || !price}
          className="px-3 py-2 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-400 rounded text-[11px] font-bold disabled:opacity-40"
        >
          DRY-RUN (PolicyGuard preview)
        </button>
        <button
          onClick={() => submit("paper")}
          disabled={busy || !price}
          className="px-3 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 rounded text-[11px] font-bold disabled:opacity-40"
        >
          PAPER FILL
        </button>
        <button
          onClick={() => submit("live")}
          disabled={busy || !price}
          className="px-3 py-2 bg-[#FF4D6D]/15 hover:bg-[#FF4D6D]/25 border border-[#FF4D6D]/30 text-[#FF4D6D] rounded text-[11px] font-bold disabled:opacity-40"
        >
          LIVE FILL (real money)
        </button>
      </div>

      {submitMsg && (
        <div className={clsx(
          "text-[11px] p-2 rounded border mb-3",
          submitMsg.startsWith("✓")
            ? "bg-[#00FFB2]/10 border-[#00FFB2]/20 text-[#00FFB2]"
            : "bg-[#FF4D6D]/10 border-[#FF4D6D]/20 text-[#FF4D6D]"
        )}>
          {submitMsg}
        </div>
      )}

      {ev && (
        <div className="bg-black/40 border border-white/5 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-400 uppercase">PolicyGuard checks</span>
            <span className={clsx("text-xs font-bold", ev.guard.ok ? "text-[#00FFB2]" : "text-[#FF4D6D]")}>
              {ev.guard.ok ? "PASS" : "REJECT"}
            </span>
          </div>
          <div className="text-[10px] text-gray-400 mb-2">
            sized: <span className="text-white font-mono">${ev.sizing.notionalUsd.toFixed(2)}</span> · {ev.sizing.reason}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
            {ev.guard.checks.map((c) => (
              <div key={c.name} className="flex items-start gap-2 text-[10px]">
                <span className={clsx("font-bold", c.passed ? "text-[#00FFB2]" : "text-[#FF4D6D]")}>
                  {c.passed ? "✓" : "✗"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-gray-300">{c.name}</div>
                  <div className="text-gray-500 truncate">{c.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OpenPositionsTable() {
  const [positions, setPositions] = useState<OpenPos[]>([]);
  const { data: tickers } = useTickers(TRACKED, 4000);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await apiGet<{ positions: OpenPos[] }>("/ledger/positions");
        if (!cancelled) setPositions(r.positions);
      } catch {
        // ignore
      }
    };
    void load();
    const i = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(i); };
  }, []);

  const close = async (p: OpenPos) => {
    const exitPrice = tickers[p.symbol]?.price ?? p.entryPrice;
    await apiPost("/intent/close", { intent_id: p.intentId, exit_price: exitPrice });
    setPositions((prev) => prev.filter((x) => x.intentId !== p.intentId));
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl">
      <div className="p-3 md:p-4 border-b border-white/10 flex justify-between items-center bg-black/40">
        <h3 className="text-sm font-bold text-gray-300">Server-side Open Positions ({positions.length})</h3>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-xs text-left min-w-[640px]">
          <thead className="bg-[#0A0C14] border-b border-white/5">
            <tr>
              <th className="p-3 font-normal text-gray-500 uppercase">Mode</th>
              <th className="p-3 font-normal text-gray-500 uppercase">Symbol</th>
              <th className="p-3 font-normal text-gray-500 uppercase">Side</th>
              <th className="p-3 font-normal text-gray-500 uppercase">Qty</th>
              <th className="p-3 font-normal text-gray-500 uppercase">Entry</th>
              <th className="p-3 font-normal text-gray-500 uppercase">Mark</th>
              <th className="p-3 font-normal text-gray-500 uppercase">PnL</th>
              <th className="p-3 font-normal text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {positions.map((p) => {
              const mark = tickers[p.symbol]?.price ?? p.entryPrice;
              const sideMul = p.side === "BUY" ? 1 : -1;
              const pnl = (mark - p.entryPrice) * p.qty * sideMul;
              return (
                <tr key={p.intentId}>
                  <td className="p-3">
                    <span className={clsx(
                      "px-1.5 py-0.5 rounded text-[9px] font-bold",
                      p.mode === "live" ? "bg-[#FF4D6D]/20 text-[#FF4D6D]" : "bg-amber-500/20 text-amber-400"
                    )}>{p.mode}</span>
                  </td>
                  <td className="p-3 font-bold">{p.symbol}</td>
                  <td className="p-3">{p.side}</td>
                  <td className="p-3 font-mono">{p.qty.toFixed(6)}</td>
                  <td className="p-3 font-mono">${p.entryPrice.toFixed(2)}</td>
                  <td className="p-3 font-mono">${mark.toFixed(2)}</td>
                  <td className={clsx("p-3 font-bold", pnl >= 0 ? "text-[#00FFB2]" : "text-[#FF4D6D]")}>
                    {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => close(p)}
                      className="px-2 py-1 bg-white/5 hover:bg-[#FF4D6D]/10 border border-white/10 hover:border-[#FF4D6D]/30 text-gray-400 hover:text-[#FF4D6D] rounded text-[10px]"
                    >
                      CLOSE
                    </button>
                  </td>
                </tr>
              );
            })}
            {positions.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-500 italic">
                  Açık server-side pozisyon yok. Yukarıdaki Intent Submitter ile bir tane oluşturabilirsin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────── EQUITY CURVE CHART ─────────
function EquityCurveChart() {
  const { equityCurve, balance, history } = useSimEngine();

  const totalPnl = history.reduce((acc, p) => acc + p.pnl, 0);
  const wins = history.filter((p) => p.pnl > 0).length;
  const winRate = history.length > 0 ? (wins / history.length) * 100 : null;
  const startVal = equityCurve[0]?.v ?? 100_000;
  const endVal = equityCurve[equityCurve.length - 1]?.v ?? balance;
  const totalPct = ((endVal - startVal) / startVal) * 100;

  const chartData = equityCurve.map((p) => ({
    t: new Date(p.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    v: parseFloat(p.v.toFixed(2)),
  }));

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <TrendingUp size={14} className="text-[#00FFB2]" />
          Equity Curve (Sim)
        </h3>
        <div className="flex gap-3">
          <span className={clsx("text-[10px] font-bold font-mono", totalPnl >= 0 ? "text-[#00FFB2]" : "text-[#FF4D6D]")}>
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} ({totalPct >= 0 ? "+" : ""}{totalPct.toFixed(2)}%)
          </span>
          {winRate !== null && (
            <span className="text-[10px] text-gray-400 font-mono">
              W/L {wins}/{history.length - wins} · {winRate.toFixed(0)}%
            </span>
          )}
        </div>
      </div>
      {equityCurve.length < 2 ? (
        <div className="h-28 flex items-center justify-center text-xs text-gray-500 italic">
          İlk işlemi kapat — grafik güncellenecek
        </div>
      ) : (
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={totalPnl >= 0 ? "#00FFB2" : "#FF4D6D"} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={totalPnl >= 0 ? "#00FFB2" : "#FF4D6D"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" hide />
              <YAxis domain={["auto", "auto"]} hide />
              <RechartsTooltip
                contentStyle={{ background: "#0A0C14", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "10px", fontFamily: "monospace" }}
                formatter={(v: number) => [`$${v.toLocaleString()}`, "Equity"]}
              />
              <Area
                type="monotone"
                dataKey="v"
                stroke={totalPnl >= 0 ? "#00FFB2" : "#FF4D6D"}
                strokeWidth={1.5}
                fill="url(#eqGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ───────── PAPER TAB (legacy in-browser sim) ─────────
function PaperTab() {
  const { balance, positions, history, openPosition, closePosition, updatePrices } = useSimEngine();
  const { data: tickers, loading } = useTickers(TRACKED, 4000);

  useEffect(() => {
    const map: Record<string, number> = {};
    for (const sym of TRACKED) {
      const t = tickers[sym];
      if (t?.price) map[sym] = t.price;
    }
    if (Object.keys(map).length > 0) updatePrices(map);
  }, [tickers, updatePrices]);

  const priceFor = (sym: string) => tickers[sym]?.price ?? 0;
  const totalUnrealizedPnl = positions.reduce((acc, p) => acc + p.pnl, 0);

  const handleSimulateOrder = (side: "LONG" | "SHORT", symbol: string) => {
    const px = priceFor(symbol);
    if (!px) return;
    const qty = symbol === "BTC/USDT" ? 0.05 : symbol === "ETH/USDT" ? 1 : 10;
    openPosition("patron", symbol, side, qty, px, 5);
  };

  return (
    <div className="p-3 md:p-6 flex flex-col gap-4 md:gap-6">
      <div className="text-[10px] text-gray-500">
        Tarayıcı içi simülasyon. Server-side risk/ledger akışı için Live tab'ını kullan.
        Engine: {loading ? "SYNC" : "LIVE FEED"}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white/5 border border-white/10 p-3 rounded-xl">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Sim Equity</div>
          <div className="text-xl md:text-2xl font-bold font-sans">
            ${(balance + totalUnrealizedPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 p-3 rounded-xl">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Unrealized PnL</div>
          <div className={clsx("text-xl md:text-2xl font-bold font-sans", totalUnrealizedPnl >= 0 ? "text-[#00FFB2]" : "text-[#FF4D6D]")}>
            {totalUnrealizedPnl >= 0 ? "+" : ""}${totalUnrealizedPnl.toFixed(2)}
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 p-3 rounded-xl">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Open Positions</div>
          <div className="text-xl md:text-2xl font-bold font-sans text-blue-400">{positions.length}</div>
        </div>
        <div className="bg-white/5 border border-white/10 p-3 rounded-xl">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Closed Trades</div>
          <div className="text-xl md:text-2xl font-bold font-sans text-gray-300">{history.length}</div>
        </div>
      </div>
      <EquityCurveChart />

      <div className="bg-white/5 border border-white/10 rounded-xl p-3 md:p-5">
        <h3 className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-wider">Quick Paper Order</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TRACKED.map((sym) => {
            const t = tickers[sym];
            return (
              <div key={sym} className="bg-black/30 border border-white/10 rounded-lg p-3 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold">{sym}</span>
                  <span className="text-xs text-white">${t?.price ? t.price.toFixed(2) : "…"}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSimulateOrder("LONG", sym)}
                    className="flex-1 py-1.5 bg-[#00FFB2]/10 hover:bg-[#00FFB2]/20 border border-[#00FFB2]/30 text-[#00FFB2] rounded text-[10px] font-bold uppercase"
                  >LONG 5x</button>
                  <button
                    onClick={() => handleSimulateOrder("SHORT", sym)}
                    className="flex-1 py-1.5 bg-[#FF4D6D]/10 hover:bg-[#FF4D6D]/20 border border-[#FF4D6D]/30 text-[#FF4D6D] rounded text-[10px] font-bold uppercase"
                  >SHORT 5x</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl">
        <div className="p-3 border-b border-white/10 bg-black/40">
          <h3 className="text-sm font-bold text-gray-300">Sim Active ({positions.length})</h3>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs text-left min-w-[720px]">
            <thead className="bg-[#0A0C14] border-b border-white/5">
              <tr>
                <th className="p-3 font-normal text-gray-500 uppercase">Pair</th>
                <th className="p-3 font-normal text-gray-500 uppercase">Side</th>
                <th className="p-3 font-normal text-gray-500 uppercase">Size</th>
                <th className="p-3 font-normal text-gray-500 uppercase">Entry</th>
                <th className="p-3 font-normal text-gray-500 uppercase">Mark</th>
                <th className="p-3 font-normal text-gray-500 uppercase">PnL</th>
                <th className="p-3 font-normal text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {positions.map((p) => (
                <tr key={p.id}>
                  <td className="p-3 font-bold">{p.symbol}</td>
                  <td className="p-3">
                    <span className={clsx("px-2 py-1 rounded text-[10px] font-bold", p.side === "LONG" ? "bg-[#00FFB2]/20 text-[#00FFB2]" : "bg-[#FF4D6D]/20 text-[#FF4D6D]")}>
                      {p.side} {p.leverage}x
                    </span>
                  </td>
                  <td className="p-3 text-gray-400">{p.size.toFixed(4)}</td>
                  <td className="p-3 font-sans">${p.entryPrice.toFixed(2)}</td>
                  <td className="p-3 font-sans">${p.markPrice.toFixed(2)}</td>
                  <td className={clsx("p-3 font-bold font-sans", p.pnl >= 0 ? "text-[#00FFB2]" : "text-[#FF4D6D]")}>
                    {p.pnl >= 0 ? "+" : ""}${p.pnl.toFixed(2)} ({p.pnlPercent.toFixed(2)}%)
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => closePosition(p.id, priceFor(p.symbol))}
                      className="px-2 py-1 bg-white/5 hover:bg-[#FF4D6D]/10 border border-white/10 text-gray-400 hover:text-[#FF4D6D] rounded text-[10px]"
                    >CLOSE</button>
                  </td>
                </tr>
              ))}
              {positions.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-gray-500 italic">Sim'de açık pozisyon yok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {history.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl">
          <div className="p-3 border-b border-white/10 bg-black/40">
            <h3 className="text-sm font-bold text-gray-300">Sim History</h3>
          </div>
          <div className="overflow-auto max-h-64">
            <table className="w-full text-xs text-left min-w-[480px]">
              <thead className="bg-[#0A0C14] sticky top-0 border-b border-white/5">
                <tr>
                  <th className="p-3 font-normal text-gray-500 uppercase">Pair</th>
                  <th className="p-3 font-normal text-gray-500 uppercase">Side</th>
                  <th className="p-3 font-normal text-gray-500 uppercase">Entry → Exit</th>
                  <th className="p-3 font-normal text-gray-500 uppercase">PnL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {history.slice(0, 30).map((p) => (
                  <tr key={p.id}>
                    <td className="p-3">{p.symbol}</td>
                    <td className={clsx("p-3", p.side === "LONG" ? "text-[#00FFB2]" : "text-[#FF4D6D]")}>{p.side}</td>
                    <td className="p-3 font-sans text-gray-400">${p.entryPrice.toFixed(2)} → ${p.markPrice.toFixed(2)}</td>
                    <td className={clsx("p-3 font-bold", p.pnl >= 0 ? "text-[#00FFB2]" : "text-[#FF4D6D]")}>
                      {p.pnl >= 0 ? "+" : ""}${p.pnl.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────── LEDGER TAB (signal → intent → guard → fill lineage) ─────────
const TYPE_COLOR: Record<string, string> = {
  signal: "text-blue-400",
  intent: "text-amber-400",
  guard: "text-purple-400",
  order_submitted: "text-cyan-400",
  order_rejected: "text-red-400",
  fill: "text-[#00FFB2]",
  close: "text-gray-300",
  kill: "text-red-500 font-bold",
  note: "text-gray-500",
};

function LedgerTab() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [filter, setFilter] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await apiGet<{ entries: LedgerEntry[] }>("/ledger?limit=200");
        if (!cancelled) setEntries(r.entries);
      } catch {
        // ignore
      }
    };
    void load();
    const i = setInterval(load, 4000);
    return () => { cancelled = true; clearInterval(i); };
  }, []);

  const filtered = filter ? entries.filter((e) => e.type === filter || e.intentId === filter) : entries;
  const types = Array.from(new Set(entries.map((e) => e.type)));

  const fills = entries.filter((e) => e.type === "fill");
  const closes = entries.filter((e) => e.type === "close");
  const totalNotional = fills.reduce((a, e) => a + (e.notionalUsd ?? 0), 0);
  const totalEntries = entries.length;

  return (
    <div className="p-3 md:p-6 flex flex-col gap-3">
      {totalEntries > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ["Toplam Kayıt", totalEntries.toString(), "text-white"],
            ["Fills", fills.length.toString(), "text-[#00FFB2]"],
            ["Closes", closes.length.toString(), "text-gray-300"],
            ["Notional (fills)", totalNotional > 0 ? `$${totalNotional.toFixed(0)}` : "—", "text-amber-400"],
          ].map(([label, val, cls]) => (
            <div key={label as string} className="bg-white/5 border border-white/10 rounded-xl p-2.5">
              <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">{label}</div>
              <div className={clsx("text-sm font-bold font-mono", cls)}>{val}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400">Filter:</span>
        <button
          onClick={() => setFilter("")}
          className={clsx("px-2 py-1 rounded text-[10px] border", filter === "" ? "bg-[#00FFB2]/15 text-[#00FFB2] border-[#00FFB2]/30" : "bg-black/30 text-gray-400 border-white/10")}
        >ALL</button>
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={clsx("px-2 py-1 rounded text-[10px] border", filter === t ? "bg-[#00FFB2]/15 text-[#00FFB2] border-[#00FFB2]/30" : "bg-black/30 text-gray-400 border-white/10")}
          >{t}</button>
        ))}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl">
        <div className="overflow-auto max-h-[calc(100dvh-300px)]">
          <table className="w-full text-[11px] text-left min-w-[720px]">
            <thead className="bg-[#0A0C14] sticky top-0 z-10 border-b border-white/5">
              <tr>
                <th className="p-2.5 font-normal text-gray-500 uppercase text-[9px]">Time</th>
                <th className="p-2.5 font-normal text-gray-500 uppercase text-[9px]">Type</th>
                <th className="p-2.5 font-normal text-gray-500 uppercase text-[9px]">Intent</th>
                <th className="p-2.5 font-normal text-gray-500 uppercase text-[9px]">Symbol</th>
                <th className="p-2.5 font-normal text-gray-500 uppercase text-[9px]">Mode</th>
                <th className="p-2.5 font-normal text-gray-500 uppercase text-[9px]">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((e) => (
                <tr key={e.id} className="hover:bg-white/5">
                  <td className="p-2.5 font-mono text-gray-500 whitespace-nowrap">
                    {new Date(e.ts).toLocaleTimeString()}
                  </td>
                  <td className={clsx("p-2.5 font-bold uppercase text-[10px]", TYPE_COLOR[e.type] ?? "text-gray-400")}>
                    {e.type}
                  </td>
                  <td className="p-2.5 font-mono text-gray-400 text-[9px]">{e.intentId?.slice(0, 12) ?? "—"}</td>
                  <td className="p-2.5 font-bold">{e.symbol ?? "—"}</td>
                  <td className="p-2.5">
                    {e.mode && (
                      <span className={clsx("px-1.5 py-0.5 rounded text-[9px] font-bold",
                        e.mode === "live" ? "bg-[#FF4D6D]/20 text-[#FF4D6D]" : "bg-amber-500/20 text-amber-400")}>
                        {e.mode}
                      </span>
                    )}
                  </td>
                  <td className="p-2.5 text-gray-300">{e.detail}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-gray-500 italic">Henüz kayıt yok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
