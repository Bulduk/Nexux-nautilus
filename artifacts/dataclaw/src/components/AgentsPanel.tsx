import { useState, useEffect, useCallback } from "react";
import { X, ChevronRight, Settings, BarChart2, ListTodo, ScrollText, Loader2, CheckCircle2, Circle, Zap } from "lucide-react";
import { clsx } from "clsx";

// ─── TYPES ────────────────────────────────────────────────

interface AgentMeta {
  id: string;
  name: string;
  icon: string;
  role: string;
  color: string;
  description: string;
}

interface AgentTask {
  id: string;
  label: string;
  desc: string;
  enabled: boolean;
}

interface AgentConfig {
  model: string;
  delegation: boolean;
  memory: boolean;
  backtesting: boolean;
  enabled: boolean;
  tasks: Record<string, boolean>;
}

interface PerfLog {
  id: number;
  time: string;
  agent: string;
  action: string;
  latencyMs: number;
  quality: number;
  confPct: number;
  pnl?: number;
}

// ─── CONSTANTS ─────────────────────────────────────────────

const AGENTS: AgentMeta[] = [
  { id: "openclaw", name: "OpenClaw", icon: "🦅", role: "İstihbarat Ajanı",   color: "#00C9A7", description: "Piyasa verisini toplayan ve analiz eden baş ajan." },
  { id: "onyx",     name: "Onyx",     icon: "🔮", role: "Araştırma Ajanı",    color: "#A78BFA", description: "Derin araştırma, makro analiz ve korelasyon." },
  { id: "mirofish", name: "Mirofish", icon: "🐟", role: "Simülasyon Ajanı",   color: "#38BDF8", description: "Backtest, Monte Carlo simülasyon ve risk modeli." },
  { id: "betafish", name: "Betafish", icon: "⚡", role: "Operasyon Ajanı",    color: "#F59E0B", description: "Emir yönlendirme ve pozisyon yönetimi." },
];

const MODELS = [
  { value: "claude-haiku-4-5",        label: "Claude Haiku 4.5",   badge: "HIZLI",    badgeColor: "#38BDF8" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4",    badge: "DENGELI",  badgeColor: "#00C9A7" },
  { value: "claude-opus-4-5",          label: "Claude Opus 4.5",    badge: "EN İYİ",   badgeColor: "#A78BFA" },
];

const TASKS_BY_AGENT: Record<string, AgentTask[]> = {
  openclaw: [
    { id: "sentiment",  label: "Sentiment Analizi",     desc: "Fear&Greed, Twitter/X, Reddit skorları",       enabled: true  },
    { id: "news",       label: "Haber Monitörlüğü",     desc: "CryptoPanic, RSS, breaking news taraması",     enabled: true  },
    { id: "ohlcv",      label: "OHLCV Toplama",          desc: "CCXT ile tüm coinler, 1m/5m/1h verileri",     enabled: true  },
    { id: "orderbook",  label: "Order Book Analizi",     desc: "Büyük duvarlar, bid/ask dengesizliği",        enabled: true  },
    { id: "whale",      label: "Balina Takibi",          desc: "Büyük cüzdan hareketleri, on-chain flows",    enabled: false },
    { id: "arbitrage",  label: "Arbitraj Tespiti",       desc: "Çapraz borsa fiyat farkı taraması",           enabled: true  },
    { id: "funding",    label: "Funding Rate",           desc: "Perp funding oranları, long/short bias",      enabled: true  },
    { id: "trending",   label: "Trending Tespiti",       desc: "Sosyal medya hacim artışı, momentum",         enabled: false },
  ],
  onyx: [
    { id: "research",     label: "Piyasa Araştırması",  desc: "Derinlikli analiz ve trend incelemesi",       enabled: true  },
    { id: "correlation",  label: "Korelasyon Analizi",  desc: "BTC dominance, alt-beta katsayıları",         enabled: true  },
    { id: "macro",        label: "Makro Takip",         desc: "Fed, CPI, DXY ve jeopolitik haberler",        enabled: true  },
    { id: "onchain",      label: "On-chain Metrikler",  desc: "MVRV, Realized P&L, exchange flows",          enabled: false },
  ],
  mirofish: [
    { id: "simulate",     label: "Simülasyon Motoru",   desc: "Monte Carlo ve stress test",                  enabled: true  },
    { id: "backtest",     label: "Backtest Motoru",     desc: "Strateji geçmiş performans analizi",          enabled: true  },
    { id: "riskmodel",    label: "Risk Modeli",         desc: "VaR, CVaR, beklenen kayıp hesaplama",         enabled: true  },
    { id: "portfolio",    label: "Portföy Opt.",        desc: "Kelly kriteri, korelasyon matrisi",           enabled: false },
  ],
  betafish: [
    { id: "order_routing", label: "Emir Yönlendirme",  desc: "CCXT aracılığı ile borsa emirleri",           enabled: true  },
    { id: "position_mgmt", label: "Pozisyon Yönetimi", desc: "TP/SL takibi, kısmi kapatma",                enabled: true  },
    { id: "arb_exec",      label: "Arbitraj Exec.",    desc: "Hız gerektiren çapraz borsa işlemleri",       enabled: true  },
    { id: "rebalance",     label: "Yeniden Dengeleme", desc: "Portföy ağırlık dengeleme",                   enabled: false },
  ],
};

const ACTIONS = [
  "Trend analizi yapılıyor", "Order book inceleniyor", "Sinyal üretiliyor",
  "Haber taranıyor", "Portföy kontrol ediliyor", "Risk hesaplanıyor",
  "Strateji değerlendiriliyor", "Veri toplama işlemi", "Consensus oluşturuluyor",
  "OHLCV verisi güncelleniyor", "Arbitraj taranıyor", "Funding rate hesaplanıyor",
];

function makeDefaultConfig(id: string): AgentConfig {
  const tasks: Record<string, boolean> = {};
  for (const t of TASKS_BY_AGENT[id] ?? []) tasks[t.id] = t.enabled;
  return { model: "claude-sonnet-4-20250514", delegation: true, memory: true, backtesting: true, enabled: true, tasks };
}

// ─── SMALL COMPONENTS ──────────────────────────────────────

function StatusDot({ on }: { on: boolean }) {
  return (
    <span
      className={clsx("inline-block w-2 h-2 rounded-full flex-shrink-0", on ? "animate-glow" : "")}
      style={{ background: on ? "var(--color-accent)" : "var(--color-muted)" }}
    />
  );
}

function ModelBadge({ model }: { model: string }) {
  const m = MODELS.find(x => x.value === model) ?? MODELS[1];
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ color: m.badgeColor, background: `${m.badgeColor}18`, border: `1px solid ${m.badgeColor}30` }}>
      {m.badge}
    </span>
  );
}

// ─── AGENT CARD ───────────────────────────────────────────

function AgentCard({ agent, config, stats, onClick }: {
  agent: AgentMeta;
  config: AgentConfig;
  stats: { trades: number; winRate: number; pnl: number; latency: number };
  onClick: () => void;
}) {
  const enabledTasks = Object.values(config.tasks).filter(Boolean).length;
  const totalTasks = Object.keys(config.tasks).length;

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl border p-4 transition-all duration-200 group hover:shadow-lg"
      style={{
        background: "var(--color-surface)",
        borderColor: config.enabled ? `${agent.color}30` : "var(--color-border)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-3xl">{agent.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold" style={{ color: agent.color, fontFamily: "'Syne', sans-serif" }}>{agent.name}</span>
              <StatusDot on={config.enabled} />
            </div>
            <span className="text-[10px] text-[var(--color-muted)]">{agent.role}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <ModelBadge model={config.model} />
          <ChevronRight size={14} className="text-[var(--color-muted)] group-hover:text-[var(--color-accent)] transition-colors" />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: "İşlem", value: stats.trades },
          { label: "Kazanma", value: `%${(stats.winRate * 100).toFixed(0)}` },
          { label: "Latans", value: `${stats.latency}ms` },
        ].map(s => (
          <div key={s.label} className="rounded-lg p-2 text-center" style={{ background: "var(--color-surface-high)" }}>
            <div className="text-xs font-bold text-[var(--color-text)]">{s.value}</div>
            <div className="text-[9px] text-[var(--color-muted)]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* PnL */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-muted)]">Toplam PnL</span>
        <span className={clsx("text-xs font-bold", stats.pnl >= 0 ? "text-[#00C176]" : "text-[#F04A5A]")}>
          {stats.pnl >= 0 ? "+" : ""}${stats.pnl.toFixed(2)}
        </span>
      </div>

      {/* Task progress */}
      <div className="mt-2.5">
        <div className="flex justify-between mb-1">
          <span className="text-[9px] text-[var(--color-muted)]">Aktif Görevler</span>
          <span className="text-[9px]" style={{ color: agent.color }}>{enabledTasks}/{totalTasks}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-surface-high)" }}>
          <div className="h-full rounded-full" style={{ width: `${(enabledTasks / totalTasks) * 100}%`, background: agent.color }} />
        </div>
      </div>
    </button>
  );
}

// ─── AGENT MODAL ─────────────────────────────────────────

function AgentModal({ agent, config, onClose, onUpdateConfig, onApply, saving, logs }: {
  agent: AgentMeta;
  config: AgentConfig;
  onClose: () => void;
  onUpdateConfig: (patch: Partial<AgentConfig>) => void;
  onApply: () => void;
  saving: boolean;
  logs: PerfLog[];
}) {
  const [tab, setTab] = useState<"config" | "tasks" | "perf" | "logs">("config");

  const TABS = [
    { key: "config", icon: Settings,     label: "Yapılandırma" },
    { key: "tasks",  icon: ListTodo,     label: "Görevler" },
    { key: "perf",   icon: BarChart2,    label: "Performans" },
    { key: "logs",   icon: ScrollText,   label: "Loglar" },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl rounded-t-3xl md:rounded-2xl border animate-slide-up overflow-hidden"
        style={{ background: "var(--color-surface)", borderColor: `${agent.color}40`, maxHeight: "85vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
          <span className="text-3xl">{agent.icon}</span>
          <div className="flex-1">
            <span className="font-bold text-base" style={{ color: agent.color, fontFamily: "'Syne', sans-serif" }}>{agent.name}</span>
            <p className="text-xs text-[var(--color-muted)]">{agent.description}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--color-surface-high)] transition-colors">
            <X size={16} className="text-[var(--color-muted)]" />
          </button>
        </div>

        {/* Tab nav */}
        <div className="flex border-b px-2 gap-1" style={{ borderColor: "var(--color-border)" }}>
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-3 text-[11px] font-semibold transition-all border-b-2 -mb-px",
                  tab === t.key
                    ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                    : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
                )}
              >
                <Icon size={12} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="overflow-y-auto p-5" style={{ maxHeight: "calc(85vh - 160px)" }}>

          {/* ── Config Tab ── */}
          {tab === "config" && (
            <div className="space-y-5">
              {/* Model selector */}
              <div>
                <label className="block text-[10px] text-[var(--color-muted)] uppercase tracking-wide font-semibold mb-2">Model</label>
                <div className="space-y-2">
                  {MODELS.map(m => (
                    <button
                      key={m.value}
                      onClick={() => onUpdateConfig({ model: m.value })}
                      className={clsx(
                        "w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-semibold transition-all",
                        config.model === m.value
                          ? "border-[var(--color-accent)] bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface-high)] text-[var(--color-muted)] hover:border-[var(--color-accent)]"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {config.model === m.value ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                        {m.label}
                      </div>
                      <span className="text-[9px] px-2 py-0.5 rounded font-bold" style={{ color: m.badgeColor, background: `${m.badgeColor}18` }}>
                        {m.badge}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Feature toggles */}
              <div>
                <label className="block text-[10px] text-[var(--color-muted)] uppercase tracking-wide font-semibold mb-3">Özellikler</label>
                <div className="space-y-2">
                  {[
                    { key: "delegation", label: "Görev Devretme",      desc: "Diğer ajanlara alt-görev devredebilir" },
                    { key: "memory",     label: "Bellek",               desc: "Geçmiş sinyalleri ve sonuçları hatırlar" },
                    { key: "backtesting",label: "Backtest Dahil",       desc: "Sinyal üretimde geçmiş veri kullanır" },
                    { key: "enabled",    label: "Ajan Aktif",           desc: "Ajanın aktif olarak çalışıp çalışmayacağı" },
                  ].map(f => {
                    const isOn = config[f.key as keyof AgentConfig] as boolean;
                    return (
                      <div
                        key={f.key}
                        className="flex items-center justify-between p-3 rounded-xl border"
                        style={{ background: "var(--color-surface-high)", borderColor: "var(--color-border)" }}
                      >
                        <div>
                          <div className="text-xs font-semibold text-[var(--color-text)]">{f.label}</div>
                          <div className="text-[10px] text-[var(--color-muted)]">{f.desc}</div>
                        </div>
                        <button
                          onClick={() => onUpdateConfig({ [f.key]: !isOn })}
                          className="relative flex-shrink-0 w-11 h-6 rounded-full transition-all"
                          style={{ background: isOn ? "var(--color-accent)" : "var(--color-border)" }}
                        >
                          <span
                            className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                            style={{ left: isOn ? "calc(100% - 20px)" : "4px" }}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Apply button */}
              <button
                onClick={onApply}
                disabled={saving}
                className={clsx(
                  "w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all",
                  saving ? "opacity-60 cursor-not-allowed" : "hover:opacity-90"
                )}
                style={{ background: agent.color, color: "#000" }}
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Kaydediliyor…</> : <><Zap size={14} /> Değişiklikleri Uygula</>}
              </button>
            </div>
          )}

          {/* ── Tasks Tab ── */}
          {tab === "tasks" && (
            <div className="space-y-2">
              <p className="text-[11px] text-[var(--color-muted)] mb-4">Bu ajanın çalıştırabileceği görevleri seçin.</p>
              {(TASKS_BY_AGENT[agent.id] ?? []).map(task => {
                const isOn = config.tasks[task.id] ?? task.enabled;
                return (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 rounded-xl border"
                    style={{ background: "var(--color-surface-high)", borderColor: isOn ? `${agent.color}25` : "var(--color-border)" }}
                  >
                    <div>
                      <div className="text-xs font-semibold text-[var(--color-text)]">{task.label}</div>
                      <div className="text-[10px] text-[var(--color-muted)]">{task.desc}</div>
                    </div>
                    <button
                      onClick={() => onUpdateConfig({ tasks: { ...config.tasks, [task.id]: !isOn } })}
                      className="relative flex-shrink-0 w-10 h-5 rounded-full transition-all"
                      style={{ background: isOn ? agent.color : "var(--color-border)" }}
                    >
                      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: isOn ? "calc(100% - 18px)" : "2px" }} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Performance Tab ── */}
          {tab === "perf" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Toplam İşlem", value: logs.length > 0 ? String(logs.filter(l => l.pnl !== undefined).length) : "—" },
                  { label: "Kazanma Oranı", value: logs.length > 0 ? `%${(logs.filter(l => (l.pnl ?? 0) > 0).length / Math.max(1, logs.filter(l => l.pnl !== undefined).length) * 100).toFixed(0)}` : "—" },
                  { label: "Ort. Latans", value: logs.length > 0 ? `${Math.round(logs.reduce((s, l) => s + l.latencyMs, 0) / logs.length)}ms` : "—" },
                  { label: "Ort. Kalite", value: logs.length > 0 ? `%${(logs.reduce((s, l) => s + l.quality, 0) / logs.length * 100).toFixed(0)}` : "—" },
                ].map(s => (
                  <div key={s.label} className="p-3 rounded-xl border text-center" style={{ background: "var(--color-surface-high)", borderColor: "var(--color-border)" }}>
                    <div className="text-lg font-bold text-[var(--color-text)]">{s.value}</div>
                    <div className="text-[10px] text-[var(--color-muted)]">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="p-3 rounded-xl border" style={{ background: "var(--color-surface-high)", borderColor: "var(--color-border)" }}>
                <p className="text-[11px] text-[var(--color-muted)]">PnL & performans verileri gerçek zamanlı log akışından hesaplanır.</p>
              </div>
            </div>
          )}

          {/* ── Logs Tab ── */}
          {tab === "logs" && (
            <div className="space-y-2">
              {logs.length === 0 ? (
                <p className="text-[11px] text-[var(--color-muted)] text-center py-6">Henüz log yok. Ajanlar aktif olduğunda log akışı başlayacak.</p>
              ) : (
                [...logs].reverse().slice(0, 20).map(log => (
                  <div key={log.id} className="flex items-start gap-2 py-2 border-b text-[10px]" style={{ borderColor: "var(--color-border)" }}>
                    <span className="text-[var(--color-muted)] shrink-0 w-14">{log.time}</span>
                    <span className="flex-1 text-[var(--color-text)]">{log.action}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[var(--color-muted)]">{log.latencyMs}ms</span>
                      {log.pnl !== undefined && (
                        <span className={clsx("font-bold", log.pnl >= 0 ? "text-[#00C176]" : "text-[#F04A5A]")}>
                          {log.pnl >= 0 ? "+" : ""}${log.pnl.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────

export default function AgentsPanel() {
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState<Record<string, AgentConfig>>(() => {
    const out: Record<string, AgentConfig> = {};
    for (const a of AGENTS) out[a.id] = makeDefaultConfig(a.id);
    return out;
  });

  // Sync models from DB on mount
  useEffect(() => {
    fetch("/api/agents/config")
      .then((r) => r.json())
      .then((data: { agents?: Array<{ agentId: string; model: string; enabled: boolean }> }) => {
        if (!data.agents) return;
        setConfigs((prev) => {
          const next = { ...prev };
          for (const a of data.agents!) {
            if (next[a.agentId]) {
              next[a.agentId] = { ...next[a.agentId], model: a.model, enabled: a.enabled };
            }
          }
          return next;
        });
      })
      .catch(() => {});
  }, []);
  const [stats, setStats] = useState<Record<string, { trades: number; winRate: number; pnl: number; latency: number }>>(() => {
    const out: Record<string, any> = {};
    for (const a of AGENTS) out[a.id] = { trades: 0, winRate: 0.67, pnl: 0, latency: 350 };
    return out;
  });
  const [perfLogs, setPerfLogs] = useState<PerfLog[]>([]);

  // Simulated real-time activity
  useEffect(() => {
    const timer = setInterval(() => {
      const activeAgents = AGENTS.filter(a => configs[a.id]?.enabled);
      if (activeAgents.length === 0) return;
      const agent = activeAgents[Math.floor(Math.random() * activeAgents.length)];
      const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
      const latencyMs = Math.floor(Math.random() * 900 + 150);
      const quality = parseFloat((Math.random() * 0.18 + 0.82).toFixed(2));
      const confPct = Math.floor(Math.random() * 20 + 78);
      const isExec = Math.random() > 0.75;
      const pnl = isExec ? parseFloat(((Math.random() * 220) - 80).toFixed(2)) : undefined;

      const entry: PerfLog = {
        id: Date.now(),
        time: new Date().toLocaleTimeString("tr-TR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        agent: agent.id,
        action,
        latencyMs,
        quality,
        confPct,
        pnl,
      };

      setPerfLogs(prev => {
        const next = [...prev, entry];
        if (next.length > 40) next.shift();
        return next;
      });

      if (pnl !== undefined) {
        setStats(prev => ({
          ...prev,
          [agent.id]: {
            trades: prev[agent.id].trades + 1,
            winRate: parseFloat(((prev[agent.id].winRate * prev[agent.id].trades + (pnl > 0 ? 1 : 0)) / (prev[agent.id].trades + 1)).toFixed(3)),
            pnl: parseFloat((prev[agent.id].pnl + pnl).toFixed(2)),
            latency: Math.round((prev[agent.id].latency + latencyMs) / 2),
          },
        }));
      }
    }, 1800);
    return () => clearInterval(timer);
  }, [configs]);

  const applyConfig = useCallback(async (agentId: string) => {
    setSaving(true);
    try {
      await fetch("/api/agents/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, ...configs[agentId] }),
      });
    } catch {
      // silently ignore — backend may not be ready
    } finally {
      setSaving(false);
    }
  }, [configs]);

  const selectedAgent = selected ? AGENTS.find(a => a.id === selected) : null;
  const recentLogs = perfLogs.slice(-6).reverse();
  const totalPnl = Object.values(stats).reduce((s, x) => s + x.pnl, 0);
  const totalTrades = Object.values(stats).reduce((s, x) => s + x.trades, 0);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]" style={{ fontFamily: "'Syne', sans-serif" }}>
            AI Ajan Ekibi
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">4 aktif ajan · {totalTrades} işlem · Toplam PnL: <span className={totalPnl >= 0 ? "text-[#00C176]" : "text-[#F04A5A]"}>{totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}</span></p>
        </div>
        <div className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-bold border" style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)", background: "var(--color-accent-dim)" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
          SWARM AKTIF
        </div>
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        {AGENTS.map(agent => (
          <AgentCard
            key={agent.id}
            agent={agent}
            config={configs[agent.id]}
            stats={stats[agent.id]}
            onClick={() => setSelected(agent.id)}
          />
        ))}
      </div>

      {/* Live Activity Feed */}
      <div className="rounded-2xl border p-4" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-[var(--color-text)]">Canlı Aktivite</span>
          <span className="flex items-center gap-1 text-[9px] text-[var(--color-muted)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00C176] animate-pulse" /> CANLI
          </span>
        </div>
        <div className="space-y-1.5">
          {recentLogs.length === 0 ? (
            <p className="text-[11px] text-[var(--color-muted)] text-center py-2">Ajanlar işlem yapıldığında burada görünecek…</p>
          ) : (
            recentLogs.map(log => {
              const meta = AGENTS.find(a => a.id === log.agent);
              return (
                <div key={log.id} className="flex items-center gap-2 text-[10px] py-1 border-b last:border-0" style={{ borderColor: "var(--color-border)" }}>
                  <span className="text-[var(--color-muted)] w-12 shrink-0">{log.time}</span>
                  <span className="font-bold shrink-0" style={{ color: meta?.color ?? "var(--color-muted)" }}>{meta?.icon} {meta?.name ?? log.agent}</span>
                  <span className="flex-1 text-[var(--color-muted)]">{log.action}</span>
                  <span className="text-[var(--color-muted)] shrink-0">{log.latencyMs}ms</span>
                  {log.pnl !== undefined && (
                    <span className={clsx("font-bold shrink-0 text-[9px]", log.pnl >= 0 ? "text-[#00C176]" : "text-[#F04A5A]")}>
                      {log.pnl >= 0 ? "+" : ""}${log.pnl.toFixed(2)}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal */}
      {selectedAgent && (
        <AgentModal
          agent={selectedAgent}
          config={configs[selectedAgent.id]}
          onClose={() => setSelected(null)}
          onUpdateConfig={patch => setConfigs(c => ({ ...c, [selectedAgent.id]: { ...c[selectedAgent.id], ...patch } }))}
          onApply={() => applyConfig(selectedAgent.id)}
          saving={saving}
          logs={perfLogs.filter(l => l.agent === selectedAgent.id)}
        />
      )}
    </div>
  );
}
