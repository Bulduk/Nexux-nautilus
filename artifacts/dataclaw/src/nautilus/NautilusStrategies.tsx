import { useState } from "react";
import { Bot, Play, Pause, Square, Settings, ChevronDown, ChevronRight, Plus, Circle } from "lucide-react";
import { clsx } from "clsx";

type StratState = "RUNNING"|"PAUSED"|"STOPPED"|"INITIALIZED";
interface Strategy { id:string; name:string; className:string; state:StratState; venue:string; instrument:string; tf:string; pnl:number; trades:number; wr:number; dd:number; params:Record<string,unknown>; }

const DATA: Strategy[] = [
  { id:"1", name:"EMA Cross — BTC/USDT", className:"EMACross",              state:"RUNNING", venue:"BINANCE",      instrument:"BTC/USDT-PERP", tf:"5m",   pnl:1842.5, trades:127, wr:61.4, dd:-3.2, params:{ fast_ema:10, slow_ema:20, trade_size:"0.05 BTC", stop_loss_pct:0.5 } },
  { id:"2", name:"RSI Reversal — ETH",   className:"RSIReversalStrategy",   state:"RUNNING", venue:"BINANCE",      instrument:"ETH/USDT-PERP", tf:"15m",  pnl:503.2,  trades:45,  wr:57.8, dd:-1.8, params:{ rsi_period:14, rsi_ob:70, rsi_os:30, trade_size:"0.5 ETH" } },
  { id:"3", name:"VWAP Scalp — SOL",     className:"VWAPScalper",           state:"PAUSED",  venue:"BYBIT",        instrument:"SOL/USDT-PERP", tf:"1m",   pnl:-128.4, trades:22,  wr:40.9, dd:-5.1, params:{ vwap_period:50, deviation:1.5, trade_size:"10 SOL" } },
  { id:"4", name:"Binance/Bybit Arb",    className:"SpreadArbitrageStrategy",state:"STOPPED", venue:"BIN+BYB",     instrument:"BTC/USDT",      tf:"tick", pnl:234.1,  trades:8,   wr:87.5, dd:-0.4, params:{ min_spread_bps:5, max_position:"0.1 BTC" } },
];
const SC: Record<StratState,{color:string;bg:string;bd:string}> = {
  RUNNING:     {color:"#00FFB2",bg:"rgba(0,255,178,0.08)",bd:"rgba(0,255,178,0.2)"},
  PAUSED:      {color:"#F59E0B",bg:"rgba(245,158,11,0.08)",bd:"rgba(245,158,11,0.2)"},
  STOPPED:     {color:"#ef4444",bg:"rgba(239,68,68,0.08)",bd:"rgba(239,68,68,0.2)"},
  INITIALIZED: {color:"#6366f1",bg:"rgba(99,102,241,0.08)",bd:"rgba(99,102,241,0.2)"},
};

function Card({ s }: { s: Strategy }) {
  const [open, setOpen] = useState(false);
  const sc = SC[s.state];
  return (
    <div className="rounded-xl border overflow-hidden" style={{ background:"rgba(255,255,255,0.02)", borderColor:"rgba(218,226,253,0.08)" }}>
      <div className="flex flex-wrap items-center gap-3 p-4 cursor-pointer hover:bg-[rgba(255,255,255,0.02)]" onClick={() => setOpen(v=>!v)}>
        <Bot size={15} style={{ color:"rgba(99,102,241,0.7)" }}/>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold font-mono text-[#dae2fd] truncate">{s.name}</div>
          <div className="text-[9px] text-[rgba(218,226,253,0.4)] font-mono">{s.className} · {s.venue} · {s.instrument} · {s.tf}</div>
        </div>
        <span className="text-[9px] font-bold font-mono tracking-widest uppercase px-2 py-0.5 rounded-full border" style={{ color:sc.color, background:sc.bg, borderColor:sc.bd }}>{s.state}</span>
        <div className="flex items-center gap-2 ml-auto">
          <div className="text-right">
            <div className="text-xs font-bold font-mono" style={{ color: s.pnl>=0?"#00FFB2":"#ef4444" }}>{s.pnl>=0?"+":""}${s.pnl.toFixed(1)}</div>
            <div className="text-[9px] font-mono text-[rgba(218,226,253,0.35)]">{s.trades} trades · {s.wr.toFixed(1)}% WR</div>
          </div>
          {open ? <ChevronDown size={13} className="text-[rgba(218,226,253,0.4)]"/> : <ChevronRight size={13} className="text-[rgba(218,226,253,0.4)]"/>}
        </div>
      </div>
      {open && (
        <div className="px-4 pb-4 border-t pt-4 flex flex-col gap-4" style={{ borderColor:"rgba(218,226,253,0.06)" }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[["Total P&L",`${s.pnl>=0?"+":""}$${s.pnl.toFixed(2)}`,s.pnl>=0?"#00FFB2":"#ef4444"],["Win Rate",`${s.wr}%`,"#6366f1"],["Trades",`${s.trades}`,"#dae2fd"],["Max DD",`${s.dd}%`,"#ef4444"]].map(([l,v,c]) => (
              <div key={l as string} className="flex flex-col gap-1">
                <span className="text-[8px] tracking-widest uppercase font-mono text-[rgba(218,226,253,0.35)]">{l}</span>
                <span className="text-sm font-bold font-mono" style={{ color: c as string }}>{v}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="text-[8px] tracking-widest uppercase font-mono text-[rgba(218,226,253,0.35)] mb-2">Parameters</div>
            <div className="rounded-lg overflow-hidden border" style={{ borderColor:"rgba(218,226,253,0.06)" }}>
              {Object.entries(s.params).map(([k,v],i) => (
                <div key={k} className={clsx("flex items-center justify-between px-3 py-2", i%2===0?"bg-[rgba(255,255,255,0.02)]":"")}>
                  <span className="text-[9px] font-mono text-[rgba(218,226,253,0.5)]">{k}</span>
                  <span className="text-[9px] font-mono font-bold text-[#dae2fd]">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.state==="RUNNING" ? <>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[9px] font-bold font-mono tracking-widest uppercase" style={{ borderColor:"rgba(245,158,11,0.3)",color:"#F59E0B" }}><Pause size={10}/>Pause</button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[9px] font-bold font-mono tracking-widest uppercase" style={{ borderColor:"rgba(239,68,68,0.3)",color:"#ef4444" }}><Square size={10}/>Stop</button>
            </> : <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[9px] font-bold font-mono tracking-widest uppercase" style={{ borderColor:"rgba(0,255,178,0.3)",color:"#00FFB2" }}><Play size={10}/>Start</button>}
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[9px] font-bold font-mono tracking-widest uppercase" style={{ borderColor:"rgba(99,102,241,0.3)",color:"#6366f1" }}><Settings size={10}/>Configure</button>
          </div>
        </div>
      )}
    </div>
  );
}
export default function NautilusStrategies() {
  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h1 className="text-base font-bold tracking-widest uppercase text-[#dae2fd]">Strategy Manager</h1><p className="text-[10px] font-mono text-[rgba(218,226,253,0.4)]">{DATA.filter(s=>s.state==="RUNNING").length} running · {DATA.length} total</p></div>
        <button className="self-start flex items-center gap-1.5 px-4 py-2 rounded-xl border text-[9px] font-bold font-mono tracking-widest uppercase" style={{ borderColor:"rgba(0,255,178,0.25)",color:"#00FFB2" }}><Plus size={12}/>Deploy Strategy</button>
      </div>
      <div className="flex flex-col gap-3">{DATA.map(s=><Card key={s.id} s={s}/>)}</div>
    </div>
  );
}
