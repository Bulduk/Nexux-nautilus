import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Terminal, AlertTriangle, ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import { apiPost, apiGet } from "../lib/api";
import { usePersistentStore } from "../state/persistentStore";

type ExecMode = "paper" | "semi" | "auto_confirm" | "full_auto";

const EXEC_MODES: { id: ExecMode; label: string; color: string; desc: string }[] = [
  { id: "paper",        label: "PAPER",       color: "#A78BFA", desc: "Simülasyon — gerçek emir yok" },
  { id: "semi",         label: "SEMI",        color: "#38BDF8", desc: "Sinyaller üretilir, manuel onay" },
  { id: "auto_confirm", label: "AUTO CONF",   color: "#F59E0B", desc: "10sn onay penceresi" },
  { id: "full_auto",    label: "FULL AUTO",   color: "#FF4D6D", desc: "Tam otonom execution" },
];

interface Message {
  id: number;
  sender: "patron" | "nexus";
  text: string;
  time: string;
  pending?: boolean;
  error?: boolean;
}

interface ChatResponse {
  content?: { text?: string }[];
  model?: string;
}

export default function ControlPlane({ auditData }: { auditData?: any }) {
  const { mode, activeExchange } = usePersistentStore();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      sender: "nexus",
      text: "[BOOT] NEXUS PRIME hazır. Anthropic Claude bağlandı, CCXT canlı piyasa akışı aktif. Komut bekliyorum, Patron.",
      time: new Date().toLocaleTimeString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  // ── Execution mode (DB-backed) ───────────────────────────────────────────
  const [execMode, setExecMode] = useState<ExecMode>("paper");
  const [execDropOpen, setExecDropOpen] = useState(false);
  const [execSaving, setExecSaving] = useState(false);

  useEffect(() => {
    apiGet<{ execution_mode: string }>("/risk/status")
      .then((d) => { if (d.execution_mode) setExecMode(d.execution_mode as ExecMode); })
      .catch(() => {});
  }, []);

  const changeExecMode = useCallback(async (m: ExecMode) => {
    if (execSaving) return;
    setExecDropOpen(false);
    setExecSaving(true);
    try {
      await apiPost("/risk/mode", { mode: m });
      setExecMode(m);
    } catch {
      // ignore
    } finally {
      setExecSaving(false);
    }
  }, [execSaving]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const userMsg: Message = {
      id: Date.now(),
      sender: "patron",
      text,
      time: new Date().toLocaleTimeString(),
    };
    const pendingId = Date.now() + 1;
    const pendingMsg: Message = {
      id: pendingId,
      sender: "nexus",
      text: "…analiz ediliyor",
      time: new Date().toLocaleTimeString(),
      pending: true,
    };
    setMessages((p) => [...p, userMsg, pendingMsg]);
    setInput("");
    setSending(true);

    // Build the conversation context for the AI: only real prior turns,
    // no pending placeholders.
    const history = [...messages, userMsg]
      .filter((m) => !m.pending && !m.error)
      .map((m) => ({
        role: m.sender === "patron" ? "user" : "assistant",
        content: m.text,
      }));

    // Inject a short system-style preface so the AI knows current mode/exchange
    // and the latest market snapshot from the dashboard.
    const market = auditData?.market ?? {};
    const marketSnapshot = Object.entries(market)
      .map(
        ([sym, d]: [string, any]) =>
          `${sym}=${d.price?.toFixed(2)} (${d.change >= 0 ? "+" : ""}${d.change?.toFixed(2)}%)`,
      )
      .join("  ");
    const contextPreface = `[CONTEXT] mode=${mode.toUpperCase()} exchange=${activeExchange} market=${marketSnapshot}`;
    const messagesForApi = [
      { role: "user" as const, content: contextPreface },
      ...history,
    ];

    try {
      const res = await apiPost<ChatResponse>("/chat", { messages: messagesForApi });
      const reply = res.content?.[0]?.text?.trim() || "(boş yanıt)";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId
            ? { ...m, text: reply, pending: false, time: new Date().toLocaleTimeString() }
            : m,
        ),
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId
            ? {
                ...m,
                text: `[HATA] AI bağlantısı başarısız: ${detail}`,
                pending: false,
                error: true,
              }
            : m,
        ),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050505] relative z-10">
      <div className="p-3 md:p-6 border-b border-white/5 shrink-0 bg-black/40 backdrop-blur-md flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2 font-['Syne']">
            <Terminal size={16} className="text-[#00FFB2] shrink-0" />
            Control Plane
          </h2>
          <p className="text-[10px] md:text-xs text-gray-500 font-mono mt-0.5 md:mt-1 truncate">
            High Level Orchestration · Claude (canlı)
          </p>
        </div>
        <div className="flex gap-2 md:gap-3 shrink-0 items-center">
          {/* Execution mode selector */}
          <div className="relative">
            <button
              onClick={() => setExecDropOpen((o) => !o)}
              disabled={execSaving}
              className="flex flex-col items-end bg-white/5 border border-white/10 rounded-lg px-2.5 md:px-4 py-1.5 md:py-2 transition-colors hover:border-white/20"
            >
              <span className="text-[8px] md:text-[9px] text-gray-400 font-mono uppercase flex items-center gap-1">
                Exec Mode <ChevronDown size={8} />
              </span>
              <span
                className="text-xs md:text-sm font-bold"
                style={{ color: EXEC_MODES.find((m) => m.id === execMode)?.color ?? "#A78BFA" }}
              >
                {execSaving ? "…" : EXEC_MODES.find((m) => m.id === execMode)?.label ?? execMode.toUpperCase()}
              </span>
            </button>

            {execDropOpen && (
              <div
                className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl border overflow-hidden shadow-2xl"
                style={{ background: "#0a0a0a", borderColor: "rgba(255,255,255,0.12)" }}
              >
                {EXEC_MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => changeExecMode(m.id)}
                    className={clsx(
                      "w-full flex flex-col px-4 py-3 text-left border-b last:border-0 transition-colors",
                      execMode === m.id ? "bg-white/10" : "hover:bg-white/5",
                    )}
                    style={{ borderColor: "rgba(255,255,255,0.06)" }}
                  >
                    <span className="text-xs font-bold font-mono" style={{ color: m.color }}>{m.label}</span>
                    <span className="text-[9px] font-mono text-gray-500 mt-0.5">{m.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white/5 border border-white/10 rounded-lg px-2.5 md:px-4 py-1.5 md:py-2 flex flex-col items-end">
            <span className="text-[8px] md:text-[9px] text-gray-400 font-mono uppercase">Exch</span>
            <span className="text-xs md:text-sm font-bold text-[#00FFB2]">
              {activeExchange.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row gap-3 md:gap-6 p-3 md:p-6">
        <div className="flex flex-col bg-white/5 border border-white/10 rounded-xl overflow-hidden relative md:flex-1 min-h-[60vh] md:min-h-0">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,178,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,178,0.01)_1px,transparent_1px)] bg-[size:10px_10px]" />

          <div
            className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 relative z-10"
            ref={chatRef}
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={clsx(
                  "flex flex-col max-w-[80%] font-mono text-xs",
                  m.sender === "patron" ? "self-end items-end" : "self-start items-start",
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={clsx(
                      "text-[9px] font-bold tracking-wider",
                      m.sender === "patron" ? "text-[#00FFB2]" : "text-gray-400",
                    )}
                  >
                    {m.sender === "patron" ? "PATRON" : "NEXUS.SUPERVISOR"}
                  </span>
                  <span className="text-[9px] text-gray-600">{m.time}</span>
                </div>
                <div
                  className={clsx(
                    "px-4 py-3 rounded-lg leading-relaxed shadow-sm whitespace-pre-wrap",
                    m.error
                      ? "bg-[#FF4D6D]/10 border border-[#FF4D6D]/30 text-[#FF4D6D]"
                      : m.sender === "patron"
                        ? "bg-[#00FFB2]/10 border border-[#00FFB2]/20 text-[#e0e0e0]"
                        : "bg-black/50 border border-white/10 text-gray-300",
                    m.pending && "animate-pulse",
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 bg-black/60 border-t border-white/10 relative z-10">
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                disabled={sending}
                placeholder="Nexus'a komut ver..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm font-mono text-white outline-none focus:border-[#00FFB2]/50 transition-colors disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={sending || !input.trim()}
                className="bg-[#00FFB2]/10 hover:bg-[#00FFB2]/20 border border-[#00FFB2]/30 text-[#00FFB2] w-12 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40"
              >
                <Send size={18} />
              </button>
            </div>
            {mode === "live" && (
              <div className="mt-2 flex items-center gap-2 text-[10px] text-[#FF4D6D]">
                <AlertTriangle size={12} />
                LIVE mod aktif — emirler gerçek hesaba gönderilebilir.
              </div>
            )}
          </div>
        </div>

        <div className="w-full md:w-80 flex flex-col gap-3 md:gap-4 shrink-0">
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 md:p-5">
            <h3 className="text-xs font-bold font-mono text-gray-400 uppercase mb-4 tracking-wider">
              Hierarchy Supervisor
            </h3>

            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full border border-[#00FFB2]/30 bg-[#00FFB2]/10 flex items-center justify-center">
                <Terminal size={20} className="text-[#00FFB2]" />
              </div>
              <div>
                <div className="text-sm font-bold">NEXUS PRIME</div>
                <div className="text-[10px] text-[#00FFB2]">
                  STATUS: {sending ? "WORKING" : "IDLE"}
                </div>
              </div>
            </div>

            <div className="space-y-3 font-mono text-[10px]">
              <div className="flex justify-between items-center bg-black/30 p-2 rounded">
                <span className="text-gray-500">Current Task</span>
                <span className="text-gray-300">
                  {sending ? "Reasoning…" : "Monitoring Patrol"}
                </span>
              </div>
              <div className="flex justify-between items-center bg-black/30 p-2 rounded">
                <span className="text-gray-500">Sub-Agents</span>
                <span className="text-[#00FFB2]">4 Online</span>
              </div>
              <div className="flex justify-between items-center bg-black/30 p-2 rounded">
                <span className="text-gray-500">Model</span>
                <span className="text-gray-300 truncate max-w-[140px]">
                  claude-sonnet-4-6
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl md:flex-1 p-4 md:p-5 flex flex-col">
            <h3 className="text-xs font-bold font-mono text-gray-400 uppercase mb-4 tracking-wider">
              Live Market
            </h3>
            <div className="flex flex-col gap-2">
              {Object.entries(auditData?.market ?? {}).map(
                ([sym, d]: [string, any]) => (
                  <div
                    key={sym}
                    className="flex justify-between items-center bg-black/30 p-2 rounded text-[10px]"
                  >
                    <span className="text-gray-400">{sym}</span>
                    <span className="text-white font-bold">
                      {d.price ? `$${d.price.toFixed(2)}` : <span className="text-gray-500">…</span>}
                    </span>
                    <span
                      className={clsx(
                        d.change >= 0 ? "text-[#00FFB2]" : "text-[#FF4D6D]",
                      )}
                    >
                      {d.price ? `${d.change >= 0 ? "+" : ""}${d.change?.toFixed(2)}%` : <span className="text-gray-500">…</span>}
                    </span>
                  </div>
                ),
              )}
            </div>
            <p className="text-center font-mono text-[9px] text-gray-500 mt-4 leading-relaxed">
              KuCoin public REST üzerinden CCXT ile çekilen canlı tikker verisi.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
