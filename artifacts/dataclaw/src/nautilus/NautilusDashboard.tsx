import { useState, useEffect } from "react";
import { Circle, TrendingUp, TrendingDown, RefreshCw, Zap } from "lucide-react";

interface Position { instrument: string; side: "LONG"|"SHORT"; qty: number; entry: number; current: number; pnl: number; pct: number; }
interface StratSummary { id: string; name: string; state: "RUNNING"|"PAUSED"|"STOPPED"; pnl: number; trades: number; }

const ENGINE = { state: "RUNNING", uptime: "2d 14h 33m", traderId: "TRADER-001", env: "LIVE", version: "1.206.0" };
const POSITIONS: Position[] = [
  { instrument: "BTC/USDT.BINANCE", side: "LONG",  qty: 0.15, entry: 42100, current: 43850, pnl: 262.5,  pct: 4.15  },
  { instrument: "ETH/USDT.BINANCE", side: "SHORT", qty: 2.0,  entry: 2280,  current: 2205,  pnl: 150.0,  pct: 3.29  },
  { instrument: "SOL/USDT.BYBIT",   side: "LONG",  qty: 12.0, entry: 98.5,  current: 95.2,  pnl: -39.6,  pct: -3.35 },
];
const STRATS: StratSummary[] = [
  { id: "1", name: "EMA Cross BTC",      state: "RUNNING", pnl: 1842.5, trades: 127 },
  { id: "2", name: "RSI Reversal ETH",   state: "RUNNING", pnl: 503.2,  trades: 45  },
  { id: "3", name: "VWAP Scalp SOL",     state: "PAUSED",  pnl: -128.4, trades: 22  },
  { id: "4", name: "Binance/Bybit Arb",  state: "STOPPED", pnl: 234.1,  trades: 8   },
];
const STATE_COLOR: Record<string,string> = { RUNNING:"#00FFB2", PAUSED:"#F59E0B", STOPPED:"#ef4444", INITIALIZED:"#6366f1" };

export default function NautilusDashboard() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 5000); return () => clearInterval(t); }, []);
  const totalPnl = POSITIONS.reduce((s,p) => s + p.pnl, 0);
  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-bold tracking-widest uppercase text-[#dae2fd]">Engine Dashboard</h1>
          <p className="text-[10px] font-mono text-[rgba(218,226,253,0.4)]">NautilusTrader v{ENGINE.version} — {ENGINE.env}</p>
        </div>
        <span className="text-[9px] font-mono text-[rgba(218,226,253,0.3)] flex items-center gap-1.5"><RefreshCw size={9}/>{now.toLocaleTimeString()}</span>
      </div>

      {/* Engine bar */}
      <div className="rounded-xl p-4 border flex flex-wrap items-center gap-4" style={{ background:"rgba(99,102,241,0.06)", borderColor:"rgba(99,102,241,0.2)" }}>
        <div className="flex items-center gap-2">
          <Circle size={8} fill={STATE_COLOR[ENGINE.state]} style={{ color:STATE_COLOR[ENGINE.state], filter:`0 0 8px ${STATE_COLOR[ENGINE.state]}` }}/>
          <span className="text-xs font-bold font-mono" style={{ color:STATE_COLOR[ENGINE.state] }}>{ENGINE.state}</span>
        </div>
        {([["Uptime",ENGINE.uptime],["Trader ID",ENGINE.traderId],["Env",ENGINE.env]] as [string,string][]).map(([l,v]) => (
          <div key={l} className="flex flex-col">
            <span className="text-[8px] tracking-widest uppercase text-[rgba(218,226,253,0.3)]">{l}</span>
            <span className="text-[10px] font-mono font-semibold text-[#dae2fd]">{v}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1"><Zap size={12} style={{ color:"#00FFB2" }}/><span className="text-[10px] font-mono font-bold text-[#00FFB2]">LIVE</span></div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:"Total Unrealized P&L", value:`${totalPnl>=0?"+":""}$${totalPnl.toFixed(2)}`, color: totalPnl>=0?"#00FFB2":"#ef4444" },
          { label:"Open Positions",       value:`${POSITIONS.length}`,                            color:"#6366f1" },
          { label:"Active Strategies",    value:`${STRATS.filter(s=>s.state==="RUNNING").length}/${STRATS.length}`, color:"#F59E0B" },
          { label:"Total Trades",         value:`${STRATS.reduce((s,x)=>s+x.trades,0)}`,          color:"#00FFB2" },
        ].map(({label,value,color}) => (
          <div key={label} className="rounded-xl p-4 border flex flex-col gap-1" style={{ background:"rgba(255,255,255,0.025)", borderColor:"rgba(218,226,253,0.08)" }}>
            <span className="text-[9px] tracking-widest uppercase font-mono text-[rgba(218,226,253,0.4)]">{label}</span>
            <span className="text-xl font-bold font-mono" style={{ color }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Positions */}
      <div>
        <h2 className="text-[10px] tracking-widest uppercase font-mono text-[rgba(218,226,253,0.4)] mb-3">Open Positions</h2>
        <div className="flex flex-col gap-2">
          {POSITIONS.map(pos => (
            <div key={pos.instrument} className="rounded-xl p-4 border flex flex-wrap items-center gap-3" style={{ background:"rgba(255,255,255,0.02)", borderColor: pos.pnl>=0?"rgba(0,255,178,0.12)":"rgba(239,68,68,0.12)" }}>
              <div className="flex items-center gap-2 min-w-[160px]">
                {pos.pnl>=0 ? <TrendingUp size={14} style={{color:"#00FFB2"}}/> : <TrendingDown size={14} style={{color:"#ef4444"}}/>}
                <div>
                  <div className="text-xs font-bold font-mono text-[#dae2fd]">{pos.instrument}</div>
                  <div className="text-[9px] font-mono font-bold" style={{ color: pos.side==="LONG"?"#00FFB2":"#ef4444" }}>{pos.side} × {pos.qty}</div>
                </div>
              </div>
              <div className="flex gap-4 flex-wrap ml-auto">
                {([["Entry",`$${pos.entry.toLocaleString()}`],["Current",`$${pos.current.toLocaleString()}`]] as [string,string][]).map(([l,v]) => (
                  <div key={l} className="flex flex-col items-end">
                    <span className="text-[8px] text-[rgba(218,226,253,0.35)] tracking-widest uppercase">{l}</span>
                    <span className="text-[10px] font-mono text-[#dae2fd]">{v}</span>
                  </div>
                ))}
                <div className="flex flex-col items-end">
                  <span className="text-[8px] text-[rgba(218,226,253,0.35)] tracking-widest uppercase">P&L</span>
                  <span className="text-[10px] font-mono font-bold" style={{ color: pos.pnl>=0?"#00FFB2":"#ef4444" }}>{pos.pnl>=0?"+":""}${pos.pnl.toFixed(2)} ({pos.pct.toFixed(2)}%)</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Strategies */}
      <div>
        <h2 className="text-[10px] tracking-widest uppercase font-mono text-[rgba(218,226,253,0.4)] mb-3">Strategy Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {STRATS.map(s => (
            <div key={s.id} className="rounded-xl p-3 border flex items-center gap-3" style={{ background:"rgba(255,255,255,0.02)", borderColor:"rgba(218,226,253,0.07)" }}>
              <Circle size={7} fill={STATE_COLOR[s.state]??'#666'} style={{ color:STATE_COLOR[s.state]??'#666' }}/>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold font-mono text-[#dae2fd] truncate">{s.name}</div>
                <div className="text-[9px] font-mono text-[rgba(218,226,253,0.35)]">{s.trades} trades</div>
              </div>
              <span className="text-[10px] font-bold font-mono shrink-0" style={{ color: s.pnl>=0?"#00FFB2":"#ef4444" }}>{s.pnl>=0?"+":""}${s.pnl.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
