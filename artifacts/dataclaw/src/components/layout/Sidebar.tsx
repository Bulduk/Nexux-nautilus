import { Network, Activity, BrainCircuit, Wallet, Settings, TerminalSquare, ShieldAlert, TrendingUp, LineChart, ListChecks, Users, MoreHorizontal, CreditCard } from 'lucide-react';
import { clsx } from 'clsx';
import { usePersistentStore } from '../../state/persistentStore';

const NAV_ITEMS = [
  { id: 'patrol',     icon: TerminalSquare, label: 'Control',    subtitle: 'AI Chat' },
  { id: 'signals',    icon: Activity,       label: 'Signals',    subtitle: 'Live Feed' },
  { id: 'watchlist',  icon: ListChecks,     label: 'Watchlist',  subtitle: 'Coin Takip' },
  { id: 'council',    icon: Users,          label: 'Council',    subtitle: 'Ortak Akıl' },
  { id: 'strategy',   icon: TrendingUp,     label: 'Strategy',   subtitle: 'Bot & Backtest' },
  { id: 'portfolio',  icon: Wallet,         label: 'Portfolio',  subtitle: 'Risk & Exec' },
  { id: 'agents',     icon: BrainCircuit,   label: 'Agents',     subtitle: 'AI Team' },
  { id: 'prediction', icon: LineChart,      label: 'Prediction', subtitle: 'Polymarket' },
  { id: 'trading',    icon: Network,        label: 'Config',     subtitle: 'Exchanges' },
  { id: 'admin',      icon: Settings,       label: 'Admin',      subtitle: 'Vault & Keys' },
  { id: 'billing',    icon: CreditCard,     label: 'Billing',    subtitle: 'Plan & Ödeme' },
];

// Mobile: show only the 5 most-used tabs
const MOBILE_NAV = [
  { id: 'patrol',    icon: TerminalSquare, label: 'Control' },
  { id: 'signals',   icon: Activity,       label: 'Signals' },
  { id: 'council',   icon: Users,          label: 'Council' },
  { id: 'portfolio', icon: Wallet,         label: 'Portfolio' },
  { id: 'admin',     icon: Settings,       label: 'Admin' },
];

export function Sidebar({
  currentTab,
  setTab,
  badges = {},
}: {
  currentTab: string;
  setTab: (t: string) => void;
  badges?: Record<string, number>;
}) {
  const killSwitchEngaged = usePersistentStore(s => s.killSwitchEngaged);
  const setKillSwitch = usePersistentStore(s => s.setKillSwitch);

  return (
    <div
      className="hidden md:flex w-64 flex-col h-screen shrink-0 relative z-20 transition-colors duration-200"
      style={{ background: "var(--color-sidebar)", boxShadow: "var(--shadow-sidebar)" }}
    >
      {/* Logo */}
      <div className="p-5 flex items-center gap-3 border-b" style={{ borderColor: "var(--color-border)" }}>
        <div className="w-8 h-8 rounded bg-gradient-to-br from-[#00C9A7] to-[#007A63] flex items-center justify-center font-bold text-black shadow-[0_0_15px_rgba(0,201,167,0.25)]">
          N
        </div>
        <div className="flex flex-col">
          <span className="font-['Syne'] font-bold text-sm tracking-wide" style={{ color: "var(--color-text)" }}>NEXUS O.S.</span>
          <span className="text-[10px] font-mono" style={{ color: "var(--color-muted)" }}>Institutional v5.0</span>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const active = currentTab === item.id;
          const Icon = item.icon;
          const badgeCount = badges[item.id] ?? 0;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={clsx(
                "flex items-center gap-3 w-full p-3 rounded-xl text-left transition-all duration-150 group font-mono border",
                active
                  ? "border-[var(--color-accent)] bg-[var(--color-nav-active)]"
                  : "border-transparent hover:bg-[var(--color-nav-hover)]"
              )}
            >
              <Icon
                size={16}
                style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}
                className="group-hover:opacity-100 transition-colors shrink-0"
              />
              <div className="flex flex-col flex-1 min-w-0">
                <span
                  className="text-xs font-semibold tracking-tight truncate"
                  style={{ color: active ? "var(--color-accent)" : "var(--color-text)" }}
                >
                  {item.label}
                </span>
                <span className="text-[9px] truncate" style={{ color: "var(--color-muted)" }}>{item.subtitle}</span>
              </div>
              {badgeCount > 0 && (
                <span
                  className="shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[9px] font-bold font-mono px-1"
                  style={{
                    background: "rgba(245,158,11,0.2)",
                    color: "#F59E0B",
                    border: "1px solid rgba(245,158,11,0.35)",
                    boxShadow: "0 0 8px rgba(245,158,11,0.25)",
                  }}
                >
                  {badgeCount > 9 ? "9+" : badgeCount}
                </span>
              )}
              {active && badgeCount === 0 && (
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: "var(--color-accent)", boxShadow: "0 0 6px var(--color-accent)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Kill switch */}
      <div className="p-4 border-t" style={{ borderColor: "var(--color-border)" }}>
        <button
          onClick={() => setKillSwitch(!killSwitchEngaged)}
          className={clsx(
            "w-full flex items-center justify-center gap-2 py-3 rounded-lg font-mono text-xs font-bold transition-all border",
            killSwitchEngaged
              ? "bg-red-500/10 border-red-500/30 text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.15)]"
              : "bg-[var(--color-nav-hover)] border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-high)]"
          )}
        >
          <ShieldAlert size={14} />
          {killSwitchEngaged ? 'SYSTEM HALTED' : 'ENGAGE KILL SWITCH'}
        </button>
      </div>
    </div>
  );
}

export function MobileBottomNav({
  currentTab,
  setTab,
  badges = {},
}: {
  currentTab: string;
  setTab: (t: string) => void;
  badges?: Record<string, number>;
}) {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 backdrop-blur border-t transition-colors duration-200"
      style={{ background: "var(--color-sidebar)", borderColor: "var(--color-border)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="grid grid-cols-5">
        {MOBILE_NAV.map((item) => {
          const active = currentTab === item.id;
          const Icon = item.icon;
          const badgeCount = badges[item.id] ?? 0;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className="flex flex-col items-center justify-center gap-1 py-2.5 transition-colors font-mono relative"
              style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}
            >
              <Icon size={16} />
              <span className="text-[8px] font-semibold tracking-tight leading-none">{item.label}</span>
              {badgeCount > 0 && (
                <span
                  className="absolute top-1.5 right-2 min-w-[14px] h-[14px] flex items-center justify-center rounded-full text-[8px] font-bold px-0.5"
                  style={{ background: "#F59E0B", color: "#000" }}
                >
                  {badgeCount > 9 ? "9+" : badgeCount}
                </span>
              )}
              {active && badgeCount === 0 && (
                <div
                  className="w-1 h-1 rounded-full -mt-0.5"
                  style={{ background: "var(--color-accent)", boxShadow: "0 0 4px var(--color-accent)" }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function MobileTopBar() {
  const killSwitchEngaged = usePersistentStore(s => s.killSwitchEngaged);
  const setKillSwitch = usePersistentStore(s => s.setKillSwitch);

  return (
    <div
      className="md:hidden flex items-center justify-between px-3 py-2 shrink-0 border-b transition-colors duration-200"
      style={{
        background: "var(--color-sidebar)",
        borderColor: "var(--color-border)",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)",
      }}
    >
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded bg-gradient-to-br from-[#00C9A7] to-[#007A63] flex items-center justify-center font-bold text-black text-xs shadow-[0_0_10px_rgba(0,201,167,0.25)]">
          N
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-['Syne'] font-bold text-[13px] tracking-wide" style={{ color: "var(--color-text)" }}>
            NEXUS O.S.
          </span>
          <span className="text-[8px] font-mono" style={{ color: "var(--color-muted)" }}>Institutional v5.0</span>
        </div>
      </div>
      <button
        onClick={() => setKillSwitch(!killSwitchEngaged)}
        className={clsx(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-mono text-[10px] font-bold border transition-colors",
          killSwitchEngaged
            ? "bg-red-500/10 border-red-500/30 text-red-500"
            : "bg-[var(--color-nav-hover)] border-[var(--color-border)] text-[var(--color-muted)]"
        )}
      >
        <ShieldAlert size={11} />
        {killSwitchEngaged ? 'HALTED' : 'KILL'}
      </button>
    </div>
  );
}
