import { useEffect, useState } from 'react';
import { Wifi, Cpu, Fingerprint, Sun, Moon } from 'lucide-react';
import { usePersistentStore } from '../../state/persistentStore';
import { UserBadge } from '../UserBadge';
import { clsx } from 'clsx';

const formatP = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function EnterpriseHeader({
  audit,
  theme,
  toggleTheme,
}: {
  audit: any;
  theme?: "light" | "dark";
  toggleTheme?: () => void;
}) {
  const [time, setTime] = useState(new Date().toISOString());
  const { mode, activeExchange, killSwitchEngaged } = usePersistentStore();

  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toISOString()), 1000);
    return () => clearInterval(t);
  }, []);

  const hhmmss = time.split('T')[1].split('.')[0];
  const isLoading: boolean = audit.tickerLoading ?? false;

  function renderPrice(price: number) {
    if (isLoading && price === 0) return <span style={{ color: "var(--color-muted)" }}>…</span>;
    return <span className="font-bold" style={{ color: "var(--color-text)" }}>${formatP(price)}</span>;
  }

  function renderChange(change: number) {
    if (isLoading && change === 0) return <span style={{ color: "var(--color-muted)" }}>…</span>;
    const isUp = change >= 0;
    return (
      <span className={clsx("font-bold", isUp ? "text-[#00C176]" : "text-[#F04A5A]")}>
        {isUp ? "+" : ""}{change.toFixed(2)}%
      </span>
    );
  }

  return (
    <div
      className="backdrop-blur-md border-b shrink-0 font-mono relative z-20 transition-colors duration-200"
      style={{ background: "var(--color-header)", borderColor: "var(--color-header-border)" }}
    >
      {/* Desktop */}
      <div className="hidden md:flex h-12 items-center justify-between px-4 gap-4">
        {/* Ticker tape */}
        <div
          className="flex items-center border rounded-lg px-3 h-8 overflow-hidden flex-1 max-w-2xl"
          style={{ background: "var(--color-surface-high)", borderColor: "var(--color-border)" }}
        >
          <div className="flex gap-6 overflow-x-auto no-scrollbar whitespace-nowrap">
            {Object.entries(audit.market).map(([sym, d]: [string, any]) => (
              <div key={sym} className="flex items-center gap-2 text-[10px]">
                <span className="font-semibold" style={{ color: "var(--color-muted)" }}>{sym.replace('/USDT', '')}</span>
                {renderPrice(d.price)}
                {renderChange(d.change)}
                <span className="ml-1" style={{ color: "var(--color-dim)" }}>vol:{d.vol}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--color-muted)" }}>
          <div className="flex items-center gap-1.5">
            <Fingerprint size={11} />
            <span>{hhmmss} UTC</span>
          </div>
          <div className="w-px h-4" style={{ background: "var(--color-border)" }} />
          <div className="flex items-center gap-1.5">
            <Cpu
              size={11}
              style={{ color: killSwitchEngaged ? "#EF4444" : "var(--color-accent)" }}
            />
            <span style={{ color: killSwitchEngaged ? "#EF4444" : "var(--color-accent)" }}>
              {killSwitchEngaged ? 'HALTED' : 'SYNCED'}
            </span>
          </div>
          <div className="w-px h-4" style={{ background: "var(--color-border)" }} />
          <div className="flex items-center gap-1.5">
            <Wifi
              size={11}
              style={{ color: mode === 'live' ? "var(--color-accent)" : "#F59E0B" }}
            />
            <span style={{ color: mode === 'live' ? "var(--color-accent)" : "#F59E0B" }}>
              {mode.toUpperCase()}
            </span>
            <span style={{ color: "var(--color-muted)" }}>[{activeExchange.toUpperCase()}]</span>
          </div>
          {toggleTheme && (
            <>
              <div className="w-px h-4" style={{ background: "var(--color-border)" }} />
              <button
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Light moda geç' : 'Dark moda geç'}
                className="w-7 h-7 flex items-center justify-center rounded-lg border transition-all hover:opacity-80"
                style={{ background: "var(--color-surface-high)", borderColor: "var(--color-border)", color: "var(--color-muted)" }}
              >
                {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
              </button>
            </>
          )}
          <div className="w-px h-4" style={{ background: "var(--color-border)" }} />
          <UserBadge />
        </div>
      </div>

      {/* Mobile */}
      <div className="md:hidden flex flex-col">
        {/* Ticker row */}
        <div
          className="flex items-center border-b px-3 h-8 overflow-hidden"
          style={{ background: "var(--color-surface-high)", borderColor: "var(--color-border)" }}
        >
          <div className="flex gap-4 overflow-x-auto no-scrollbar whitespace-nowrap w-full">
            {Object.entries(audit.market).map(([sym, d]: [string, any]) => {
              const isUp = (d.change ?? 0) >= 0;
              return (
                <div key={sym} className="flex items-center gap-1.5 text-[10px] shrink-0">
                  <span className="font-semibold" style={{ color: "var(--color-muted)" }}>{sym.replace('/USDT', '')}</span>
                  {isLoading && d.price === 0
                    ? <span style={{ color: "var(--color-muted)" }}>…</span>
                    : <span className="font-bold" style={{ color: "var(--color-text)" }}>${formatP(d.price)}</span>
                  }
                  {isLoading && d.change === 0
                    ? null
                    : <span className={clsx("font-bold", isUp ? "text-[#00C176]" : "text-[#F04A5A]")}>
                        {isUp ? "+" : ""}{(d.change ?? 0).toFixed(2)}%
                      </span>
                  }
                </div>
              );
            })}
          </div>
        </div>
        {/* Status row */}
        <div className="flex items-center justify-between px-3 py-1.5 text-[9px]">
          <div className="flex items-center gap-1" style={{ color: "var(--color-muted)" }}>
            <Fingerprint size={9} />
            <span>{hhmmss}</span>
          </div>
          <div className="flex items-center gap-1" style={{ color: killSwitchEngaged ? "#EF4444" : "var(--color-accent)" }}>
            <Cpu size={9} />
            <span>{killSwitchEngaged ? 'HALTED' : 'SYNCED'}</span>
          </div>
          <div className="flex items-center gap-1" style={{ color: mode === 'live' ? "var(--color-accent)" : "#F59E0B" }}>
            <Wifi size={9} />
            <span>{mode.toUpperCase()} [{activeExchange.toUpperCase()}]</span>
          </div>
          {toggleTheme && (
            <button onClick={toggleTheme} style={{ color: "var(--color-muted)" }}>
              {theme === 'dark' ? <Sun size={11} /> : <Moon size={11} />}
            </button>
          )}
          <UserBadge />
        </div>
      </div>
    </div>
  );
}
