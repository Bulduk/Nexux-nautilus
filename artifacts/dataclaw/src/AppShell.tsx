import { lazy, Suspense, useMemo, useState, useEffect } from "react";
import { usePersistentStore } from "./state/persistentStore";
import { Sidebar, MobileBottomNav, MobileTopBar } from "./components/layout/Sidebar";
import { EnterpriseHeader } from "./components/layout/EnterpriseHeader";
import { useTickers } from "./hooks/useTickers";
import { usePendingCount } from "./hooks/usePendingCount";
import ToastContainer from "./components/ToastContainer";
import PaywallModal from "./components/PaywallModal";

// ── Eager: default tab only — loaded with the initial bundle ──────────────
import ControlPlane from "./components/ControlPlane";

// ── Lazy: all other tabs — fetched only when first activated ──────────────
const AdminPanel      = lazy(() => import("./components/AdminPanel"));
const PortfolioPanel  = lazy(() => import("./components/PortfolioPanel"));
const SignalEngine    = lazy(() => import("./components/SignalEngine"));
const StrategyPanel   = lazy(() => import("./components/StrategyPanel"));
const AgentsPanel     = lazy(() => import("./components/AgentsPanel"));
const PredictionPanel = lazy(() => import("./components/PredictionPanel"));
const WatchlistPanel  = lazy(() => import("./components/WatchlistPanel"));
const CouncilPanel    = lazy(() => import("./components/CouncilPanel"));
const BillingPanel    = lazy(() => import("./components/BillingPanel"));

function TabLoader() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[300px]">
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-9 h-9 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
        />
        <span
          className="text-[10px] tracking-widest uppercase font-mono"
          style={{ color: "var(--color-muted)" }}
        >
          Yükleniyor
        </span>
      </div>
    </div>
  );
}

const STATIC_AUDIT_SHELL = {
  version: "5.0.0",
  mode: "REAL_DATA",
  modules: {
    ccxt:      { status: "OK",       version: "4.5.x" },
    anthropic: { status: "OK",       install: "@anthropic-ai/sdk via Replit AI" },
    crewai:    { status: "EMULATED", install: "in-app orchestration" },
    fastapi:   { status: "REPLACED", version: "Express 5" },
    coremem:   { status: "OK",       version: "localStorage persist" },
  },
  signals: {
    orderbook: { symbol: "BTC/USDT", imbalance: 0, bias: "—" },
    funding:   { symbol: "BTC/USDT", rate: 0, bias: "—" },
    arbitrage: { symbol: "BTC/USDT", spread_pct: 0, opportunity: false },
    sentiment: { BTC: 0, ETH: 0, SOL: 0 },
    freqtrade: { signal: "—", confidence: 0, strategy: "n/a" },
    mirofish:  { direction: "LONG", confidence: 0, entry: 0, tp: 0, sl: 0, rr: 0, approval: false },
  },
};

export default function AppShell() {
  const [tab, setTab] = useState("patrol");
  const { mode, activeExchange, killSwitchEngaged } = usePersistentStore();

  // ── Theme ──────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved =
      typeof window !== "undefined"
        ? (window.localStorage.getItem("nexus-theme") as "light" | "dark") ?? "light"
        : "light";
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", saved);
    }
    return saved;
  });

  const toggleTheme = () =>
    setTheme((t) => {
      const next = t === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      try { window.localStorage.setItem("nexus-theme", next); } catch {}
      return next;
    });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // ── Execution mode from server (synced on mount) ───────────────────────
  const [execMode, setExecMode] = useState<string>("paper");
  useEffect(() => {
    fetch("/api/risk/status")
      .then((r) => r.json())
      .then((d: any) => { if (d?.execution_mode) setExecMode(d.execution_mode); })
      .catch(() => {});
  }, []);

  // ── Tickers (refreshed every 15 s — server caches at 10 s TTL) ─────────
  const { data: tickers, loading } = useTickers(
    ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"],
    15_000,
  );

  // ── Pending signals badge (SEMI mod) ─────────────────────────────────────
  const pendingCount = usePendingCount(5000);

  const auditData = useMemo(() => {
    const market: Record<string, { price: number; change: number; vol: string }> = {};
    for (const sym of ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"]) {
      const t = tickers[sym];
      market[sym] = {
        price:  t?.price    ?? 0,
        change: t?.change   ?? 0,
        vol:    t?.volQuote ?? (loading ? "…" : "—"),
      };
    }
    return { ...STATIC_AUDIT_SHELL, mode: mode.toUpperCase(), market, tickerLoading: loading };
  }, [tickers, loading, mode]);

  void activeExchange;
  void killSwitchEngaged;

  return (
    <div
      className="flex h-[100dvh] font-mono overflow-hidden"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <Sidebar currentTab={tab} setTab={setTab} badges={{ portfolio: pendingCount }} />

      <div className="flex flex-col flex-1 min-w-0">
        <MobileTopBar />
        <EnterpriseHeader audit={auditData} theme={theme} toggleTheme={toggleTheme} />

        <main className="flex-1 overflow-hidden flex flex-col relative">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(var(--color-grid) 1px, transparent 1px), linear-gradient(90deg, var(--color-grid) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />

          <div
            className="relative z-10 flex-1 overflow-y-auto flex flex-col pb-16 md:pb-0"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 4rem)" }}
          >
            {/* Default tab eagerly rendered — no Suspense needed */}
            {tab === "patrol" && <ControlPlane auditData={auditData} />}

            {/* All other tabs lazy-loaded — shown only on first visit */}
            <Suspense fallback={<TabLoader />}>
              {tab === "signals"    && <SignalEngine />}
              {tab === "strategy"   && <StrategyPanel />}
              {tab === "portfolio"  && <PortfolioPanel />}
              {tab === "agents"     && <AgentsPanel />}
              {tab === "prediction" && <PredictionPanel />}
              {tab === "trading"    && <AdminPanel forceSection="trading" />}
              {tab === "admin"      && <AdminPanel forceSection="nasa" />}
              {tab === "watchlist"  && <WatchlistPanel />}
              {tab === "council"    && <CouncilPanel />}
              {tab === "billing"    && <BillingPanel />}
            </Suspense>
          </div>
        </main>
      </div>

      <MobileBottomNav currentTab={tab} setTab={setTab} badges={{ portfolio: pendingCount }} />
      <ToastContainer />
      <PaywallModal onUpgrade={() => setTab("billing")} />
    </div>
  );
}
