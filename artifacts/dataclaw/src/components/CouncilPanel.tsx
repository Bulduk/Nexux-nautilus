import { useState, useEffect } from "react";
import { Users, Vote, RefreshCw, CheckCircle, XCircle, MinusCircle, ChevronDown, ChevronUp, History, Zap, AlertTriangle } from "lucide-react";
import { apiPost, apiGet } from "../lib/api";
import { clsx } from "clsx";
import { toast } from "../state/toastStore";

interface CouncilVote {
  agentId: string;
  agentName: string;
  vote: "APPROVE" | "REJECT" | "ABSTAIN";
  confidence: number;
  reason: string;
  model: string;
}

interface CouncilDecision {
  sessionId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  approved: boolean;
  voteCount: { approve: number; reject: number; abstain: number };
  avgConfidence: number;
  consensus: "STRONG" | "MAJORITY" | "SPLIT" | "REJECTED";
  votes: CouncilVote[];
  finalReason: string;
  durationMs: number;
}

const AGENT_ICONS: Record<string, string> = {
  openclaw: "🦅",
  mirofish: "🐟",
  betafish: "⚡",
  onyx: "🔮",
};

const AGENT_COLORS: Record<string, string> = {
  openclaw: "#00C9A7",
  mirofish: "#38BDF8",
  betafish: "#F59E0B",
  onyx: "#A78BFA",
};

const CONSENSUS_COLORS: Record<string, string> = {
  STRONG: "#00C9A7",
  MAJORITY: "#38BDF8",
  SPLIT: "#F59E0B",
  REJECTED: "#FF4D6D",
};

interface HistorySession {
  sessionId: string;
  symbol: string;
  direction: string;
  approve: number;
  reject: number;
  approved: boolean;
  createdAt: string;
}

const FALLBACK_SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"];

export default function CouncilPanel() {
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [running, setRunning] = useState(false);
  const [decision, setDecision] = useState<CouncilDecision | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistorySession[]>([]);
  const [histTab, setHistTab] = useState<"vote" | "history">("vote");
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(FALLBACK_SYMBOLS);
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    apiGet<{ sessions: HistorySession[] }>("/council/history?limit=10")
      .then((d) => setHistory(d.sessions ?? []))
      .catch(() => {});
  }, [decision]);

  useEffect(() => {
    apiGet<{ symbols: string[] }>("/watchlist/symbols")
      .then((d) => { if (d.symbols?.length > 0) setWatchlistSymbols(d.symbols); })
      .catch(() => {});
  }, []);

  const runVote = async () => {
    if (running) return;
    setRunning(true);
    setDecision(null);
    setError(null);
    setExecResult(null);
    try {
      const res = await apiPost<CouncilDecision>("/council/vote", {
        symbol: symbol.toUpperCase(),
        direction,
        context: { symbol, direction, timestamp: new Date().toISOString() },
      });
      setDecision(res);
      toast({
        kind: "council",
        title: `Council → ${res.consensus}: ${res.approved ? "ONAYLANDI" : "REDDEDİLDİ"}`,
        body: `${res.symbol} ${res.direction} · ${res.voteCount.approve}✓ ${res.voteCount.reject}✗ · %${res.avgConfidence} güven`,
        durationMs: 7000,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  };

  const executeIntent = async () => {
    if (!decision || executing) return;
    setExecuting(true);
    setExecResult(null);
    try {
      const tickerRes = await apiGet<{ tickers: Array<{ price: number; symbol: string }> }>(
        `/markets/ticker?symbols=${encodeURIComponent(decision.symbol)}`,
      );
      const price = tickerRes.tickers[0]?.price ?? 0;
      await apiPost("/intent/submit", {
        symbol: decision.symbol,
        direction: decision.direction,
        confidence_pct: decision.avgConfidence,
        price,
        mode: "paper",
        agent_source: "council",
        decision_trace: [
          `Council ${decision.consensus} vote: ${decision.voteCount.approve}✓ ${decision.voteCount.reject}✗`,
          decision.finalReason,
        ],
      });
      setExecResult({ ok: true, msg: `${decision.direction} ${decision.symbol} @ $${price.toFixed(2)} — paper ledger'a kaydedildi` });
      toast({
        kind: "autoexec",
        title: `Council Intent Gönderildi`,
        body: `${decision.direction} ${decision.symbol} @ $${price.toFixed(2)} · ${decision.consensus}`,
        durationMs: 6000,
      });
    } catch (err) {
      setExecResult({ ok: false, msg: String(err) });
      toast({ kind: "error", title: "Intent gönderilemedi", body: String(err), durationMs: 5000 });
    } finally {
      setExecuting(false);
    }
  };

  const toggleExpand = (agentId: string) => {
    setExpanded((prev) => ({ ...prev, [agentId]: !prev[agentId] }));
  };

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <div
        className="p-4 md:p-6 border-b shrink-0"
        style={{ borderColor: "var(--color-border)", background: "var(--color-sidebar)" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Users size={16} style={{ color: "var(--color-accent)" }} />
          <h2 className="text-base md:text-lg font-bold font-['Syne']" style={{ color: "var(--color-text)" }}>
            Council — Ortak Akıl
          </h2>
        </div>
        <p className="text-[10px] font-mono" style={{ color: "var(--color-muted)" }}>
          4 ajan paralel oylama → konsensüs karar
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b px-4 gap-1 shrink-0" style={{ borderColor: "var(--color-border)", background: "var(--color-sidebar)" }}>
        {([["vote", Vote, "Oylama"], ["history", History, "Geçmiş"]] as const).map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setHistTab(id)}
            className="flex items-center gap-1.5 px-3 py-3 text-[11px] font-semibold transition-all border-b-2 -mb-px"
            style={{
              borderColor: histTab === id ? "var(--color-accent)" : "transparent",
              color: histTab === id ? "var(--color-accent)" : "var(--color-muted)",
            }}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4">
        {/* ── History Tab ── */}
        {histTab === "history" && (
          <div className="flex flex-col gap-2">
            {history.length === 0 ? (
              <div className="rounded-xl p-8 border text-center" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
                <p className="text-xs font-mono" style={{ color: "var(--color-muted)" }}>Henüz oylama geçmişi yok.</p>
              </div>
            ) : (
              history.map((s) => (
                <div key={s.sessionId} className="rounded-xl border p-3 flex items-center gap-3" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                    style={{
                      background: s.approved ? "rgba(0,201,167,0.15)" : "rgba(255,77,109,0.15)",
                      color: s.approved ? "#00C9A7" : "#FF4D6D",
                    }}
                  >
                    {s.approved ? "✓" : "✗"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono" style={{ color: "var(--color-text)" }}>{s.symbol}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{
                        background: s.direction === "LONG" ? "rgba(0,201,167,0.1)" : "rgba(255,77,109,0.1)",
                        color: s.direction === "LONG" ? "#00C9A7" : "#FF4D6D",
                      }}>
                        {s.direction}
                      </span>
                    </div>
                    <div className="text-[9px] font-mono mt-0.5" style={{ color: "var(--color-muted)" }}>
                      {new Date(s.createdAt).toLocaleString("tr-TR")} · {s.approve}✓ {s.reject}✗
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {histTab === "vote" && (<>
        {/* Input */}
        <div
          className="rounded-xl p-4 border"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <p className="text-[10px] font-mono uppercase tracking-wider mb-3" style={{ color: "var(--color-muted)" }}>
            Oylama Başlat
          </p>
          <div className="flex flex-col gap-2 md:flex-row">
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              disabled={running}
              className="flex-1 rounded-lg px-3 py-2 text-sm font-mono outline-none border transition-colors"
              style={{
                background: "var(--color-bg)",
                borderColor: "var(--color-border)",
                color: "var(--color-text)",
              }}
            >
              {watchlistSymbols.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => setDirection("LONG")}
                disabled={running}
                className={clsx(
                  "flex-1 md:flex-none px-4 py-2 rounded-lg font-mono text-xs font-bold border transition-all",
                )}
                style={{
                  background: direction === "LONG" ? "rgba(0,201,167,0.15)" : "var(--color-bg)",
                  borderColor: direction === "LONG" ? "#00C9A7" : "var(--color-border)",
                  color: direction === "LONG" ? "#00C9A7" : "var(--color-muted)",
                }}
              >
                LONG
              </button>
              <button
                onClick={() => setDirection("SHORT")}
                disabled={running}
                className={clsx(
                  "flex-1 md:flex-none px-4 py-2 rounded-lg font-mono text-xs font-bold border transition-all",
                )}
                style={{
                  background: direction === "SHORT" ? "rgba(255,77,109,0.15)" : "var(--color-bg)",
                  borderColor: direction === "SHORT" ? "#FF4D6D" : "var(--color-border)",
                  color: direction === "SHORT" ? "#FF4D6D" : "var(--color-muted)",
                }}
              >
                SHORT
              </button>
            </div>
            <button
              onClick={runVote}
              disabled={running || !symbol.trim()}
              className="flex items-center justify-center gap-2 px-5 py-2 rounded-lg font-mono text-xs font-bold border transition-all"
              style={{
                background: "var(--color-accent-bg)",
                borderColor: "var(--color-accent)",
                color: "var(--color-accent)",
                opacity: running || !symbol.trim() ? 0.5 : 1,
              }}
            >
              {running ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  Oylanıyor...
                </>
              ) : (
                <>
                  <Vote size={12} />
                  Oylat
                </>
              )}
            </button>
          </div>
          {running && (
            <div className="mt-3 text-[10px] font-mono" style={{ color: "var(--color-muted)" }}>
              4 ajan paralel düşünüyor — OpenClaw · Mirofish · Betafish · Onyx...
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl p-4 border text-xs font-mono" style={{ borderColor: "#FF4D6D", color: "#FF4D6D", background: "rgba(255,77,109,0.05)" }}>
            {error}
          </div>
        )}

        {/* Result */}
        {decision && (
          <>
            {/* Verdict */}
            <div
              className="rounded-xl p-5 border"
              style={{
                background: "var(--color-surface)",
                borderColor: CONSENSUS_COLORS[decision.consensus] + "40",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                    Karar
                  </p>
                  <p
                    className="text-xl font-bold font-['Syne'] mt-0.5"
                    style={{ color: CONSENSUS_COLORS[decision.consensus] }}
                  >
                    {decision.approved ? "ONAYLANDI" : "REDDEDİLDİ"}
                  </p>
                </div>
                <div className="text-right">
                  <div
                    className="text-xs font-mono font-bold px-3 py-1 rounded-full border"
                    style={{
                      color: CONSENSUS_COLORS[decision.consensus],
                      borderColor: CONSENSUS_COLORS[decision.consensus] + "40",
                      background: CONSENSUS_COLORS[decision.consensus] + "15",
                    }}
                  >
                    {decision.consensus}
                  </div>
                  <p className="text-[9px] font-mono mt-1" style={{ color: "var(--color-muted)" }}>
                    {decision.durationMs}ms
                  </p>
                </div>
              </div>

              {/* Vote counts */}
              <div className="flex gap-3 mb-3">
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <CheckCircle size={12} style={{ color: "#00C9A7" }} />
                  <span style={{ color: "#00C9A7" }}>{decision.voteCount.approve}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <XCircle size={12} style={{ color: "#FF4D6D" }} />
                  <span style={{ color: "#FF4D6D" }}>{decision.voteCount.reject}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <MinusCircle size={12} style={{ color: "var(--color-muted)" }} />
                  <span style={{ color: "var(--color-muted)" }}>{decision.voteCount.abstain}</span>
                </div>
                <div className="ml-auto text-xs font-mono" style={{ color: "var(--color-muted)" }}>
                  Ort. güven: <span style={{ color: "var(--color-text)" }}>{decision.avgConfidence}%</span>
                </div>
              </div>

              <p className="text-[10px] font-mono" style={{ color: "var(--color-muted)" }}>
                {decision.finalReason}
              </p>

              {/* ── Execute Intent Bridge ── */}
              {decision.approved && (decision.consensus === "STRONG" || decision.consensus === "MAJORITY") && (
                <div className="mt-4 pt-4 border-t flex flex-col gap-2" style={{ borderColor: "var(--color-border)" }}>
                  <button
                    onClick={executeIntent}
                    disabled={executing || !!execResult?.ok}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-mono text-xs font-bold border transition-all"
                    style={{
                      background: execResult?.ok ? "rgba(0,201,167,0.1)" : "rgba(0,255,178,0.08)",
                      borderColor: execResult?.ok ? "#00C9A7" : "rgba(0,255,178,0.3)",
                      color: execResult?.ok ? "#00C9A7" : "#00FFB2",
                      opacity: executing ? 0.7 : 1,
                    }}
                  >
                    {executing ? (
                      <><RefreshCw size={12} className="animate-spin" /> Emir gönderiliyor…</>
                    ) : execResult?.ok ? (
                      <><CheckCircle size={12} /> Emir Gönderildi</>
                    ) : (
                      <><Zap size={12} /> Intent Gönder — {decision.direction} {decision.symbol}</>
                    )}
                  </button>
                  {execResult && (
                    <div
                      className="text-[9px] font-mono px-3 py-2 rounded-lg border flex items-center gap-2"
                      style={{
                        color: execResult.ok ? "#00C9A7" : "#FF4D6D",
                        borderColor: execResult.ok ? "rgba(0,201,167,0.2)" : "rgba(255,77,109,0.2)",
                        background: execResult.ok ? "rgba(0,201,167,0.05)" : "rgba(255,77,109,0.05)",
                      }}
                    >
                      {execResult.ok ? <CheckCircle size={10} /> : <AlertTriangle size={10} />}
                      {execResult.msg}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Individual votes */}
            <div className="flex flex-col gap-2">
              {decision.votes.map((vote) => (
                <div
                  key={vote.agentId}
                  className="rounded-xl border overflow-hidden"
                  style={{
                    borderColor: "var(--color-border)",
                    background: "var(--color-surface)",
                  }}
                >
                  <button
                    className="w-full flex items-center gap-3 p-3 text-left"
                    onClick={() => toggleExpand(vote.agentId)}
                  >
                    <span className="text-base">{AGENT_ICONS[vote.agentId] ?? "🤖"}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold font-mono" style={{ color: AGENT_COLORS[vote.agentId] ?? "var(--color-text)" }}>
                        {vote.agentName}
                      </span>
                      <span className="text-[9px] font-mono ml-2" style={{ color: "var(--color-muted)" }}>
                        {vote.model}
                      </span>
                    </div>
                    <div
                      className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border"
                      style={{
                        color: vote.vote === "APPROVE" ? "#00C9A7" : vote.vote === "REJECT" ? "#FF4D6D" : "var(--color-muted)",
                        borderColor: vote.vote === "APPROVE" ? "#00C9A7" + "40" : vote.vote === "REJECT" ? "#FF4D6D" + "40" : "var(--color-border)",
                        background: vote.vote === "APPROVE" ? "rgba(0,201,167,0.1)" : vote.vote === "REJECT" ? "rgba(255,77,109,0.1)" : "transparent",
                      }}
                    >
                      {vote.vote}
                    </div>
                    <span className="text-[10px] font-mono w-10 text-right" style={{ color: "var(--color-muted)" }}>
                      {vote.confidence}%
                    </span>
                    {expanded[vote.agentId] ? (
                      <ChevronUp size={12} style={{ color: "var(--color-muted)" }} />
                    ) : (
                      <ChevronDown size={12} style={{ color: "var(--color-muted)" }} />
                    )}
                  </button>
                  {expanded[vote.agentId] && (
                    <div
                      className="px-4 pb-3 pt-1 text-[10px] font-mono border-t"
                      style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}
                    >
                      {vote.reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {!decision && !running && !error && (
          <div
            className="rounded-xl p-8 border text-center"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
          >
            <Users size={32} className="mx-auto mb-3 opacity-30" style={{ color: "var(--color-accent)" }} />
            <p className="text-xs font-mono" style={{ color: "var(--color-muted)" }}>
              Sembol ve yön seçip "Oylat" butonuna bas.
            </p>
            <p className="text-[10px] font-mono mt-1" style={{ color: "var(--color-muted)" }}>
              4 ajan bağımsız olarak analiz yapıp oy kullanır → konsensüs karar verilir.
            </p>
          </div>
        )}
        </>)}
      </div>
    </div>
  );
}
