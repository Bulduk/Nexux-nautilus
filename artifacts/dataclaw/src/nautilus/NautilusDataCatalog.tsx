import { useState } from "react";
import { Database, Search, HardDrive, Calendar, BarChart3, RefreshCw } from "lucide-react";

interface Ins { id:string; symbol:string; venue:string; type:string; quote:string; start:string; end:string; bars:string; ticks:string; gb:number; tfs:string[]; }

const DATA: Ins[] = [
  { id:"1", symbol:"BTC/USDT", venue:"BINANCE", type:"CRYPTO_PERPETUAL", quote:"USDT", start:"2020-01-01", end:"2025-05-10", bars:"2.3M", ticks:"128M", gb:4.2, tfs:["1m","5m","15m","1h","4h","1d"] },
  { id:"2", symbol:"ETH/USDT", venue:"BINANCE", type:"CRYPTO_PERPETUAL", quote:"USDT", start:"2020-01-01", end:"2025-05-10", bars:"2.1M", ticks:"115M", gb:3.8, tfs:["1m","5m","15m","1h","4h","1d"] },
  { id:"3", symbol:"SOL/USDT", venue:"BYBIT",   type:"CRYPTO_PERPETUAL", quote:"USDT", start:"2021-03-15", end:"2025-05-10", bars:"1.4M", ticks:"89M",  gb:2.1, tfs:["1m","5m","15m","1h","1d"] },
  { id:"4", symbol:"BNB/USDT", venue:"BINANCE", type:"CRYPTO_PERPETUAL", quote:"USDT", start:"2021-01-01", end:"2025-05-10", bars:"1.7M", ticks:"94M",  gb:2.8, tfs:["1m","5m","15m","1h","4h","1d"] },
  { id:"5", symbol:"BTC/USDT", venue:"BYBIT",   type:"CRYPTO_PERPETUAL", quote:"USDT", start:"2022-01-01", end:"2025-05-10", bars:"1.1M", ticks:"67M",  gb:1.9, tfs:["1m","5m","15m","1h","4h"] },
  { id:"6", symbol:"BTC-26DEC25", venue:"DERIBIT", type:"OPTION",        quote:"USD",  start:"2024-01-01", end:"2025-12-26", bars:"0.4M", ticks:"12M",  gb:0.6, tfs:["1m","1h","1d"] },
];
const VENUES = ["ALL","BINANCE","BYBIT","DERIBIT"];
const TYPES  = ["ALL","CRYPTO_PERPETUAL","SPOT","OPTION"];

export default function NautilusDataCatalog() {
  const [q, setQ] = useState("");
  const [venue, setVenue] = useState("ALL");
  const [type, setType] = useState("ALL");
  const filtered = DATA.filter(d => (venue==="ALL"||d.venue===venue)&&(type==="ALL"||d.type===type)&&(d.symbol.toLowerCase().includes(q.toLowerCase())||d.venue.toLowerCase().includes(q.toLowerCase())));
  const totalGb = DATA.reduce((s,d)=>s+d.gb,0);
  const sel = "rounded-lg px-3 py-2 text-xs font-mono bg-[rgba(255,255,255,0.04)] border border-[rgba(218,226,253,0.1)] text-[#dae2fd] outline-none";
  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h1 className="text-base font-bold tracking-widest uppercase text-[#dae2fd]">Data Catalog</h1><p className="text-[10px] font-mono text-[rgba(218,226,253,0.4)]">Historical market data for backtesting</p></div>
        <button className="self-start flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[9px] font-bold font-mono tracking-widest uppercase" style={{ borderColor:"rgba(99,102,241,0.25)",color:"#6366f1" }}><RefreshCw size={11}/>Sync Feed</button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {([{icon:HardDrive,label:"Total Storage",value:`${totalGb.toFixed(1)} GB`},{icon:BarChart3,label:"Total Bars",value:"8.0M"},{icon:Database,label:"Instruments",value:`${DATA.length}`}] as const).map(({icon:Icon,label,value})=>(
          <div key={label} className="rounded-xl p-3 border flex flex-col gap-1" style={{ background:"rgba(255,255,255,0.02)", borderColor:"rgba(218,226,253,0.07)" }}>
            <div className="flex items-center gap-1.5"><Icon size={11} style={{color:"rgba(99,102,241,0.7)"}}/><span className="text-[8px] tracking-widest uppercase font-mono text-[rgba(218,226,253,0.35)]">{label}</span></div>
            <span className="text-sm font-bold font-mono text-[#dae2fd]">{value}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] rounded-lg px-3 py-2 border" style={{ background:"rgba(255,255,255,0.04)", borderColor:"rgba(218,226,253,0.1)" }}>
          <Search size={13} style={{color:"rgba(218,226,253,0.3)"}}/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…" className="flex-1 bg-transparent text-xs font-mono text-[#dae2fd] outline-none placeholder:text-[rgba(218,226,253,0.25)]"/>
        </div>
        <select value={venue} onChange={e=>setVenue(e.target.value)} className={sel}>{VENUES.map(v=><option key={v}>{v}</option>)}</select>
        <select value={type}  onChange={e=>setType(e.target.value)}  className={sel}>{TYPES.map(t=><option key={t}>{t}</option>)}</select>
      </div>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor:"rgba(218,226,253,0.08)" }}>
        <div className="hidden md:grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 border-b text-[8px] tracking-widest uppercase font-mono text-[rgba(218,226,253,0.35)]" style={{ borderColor:"rgba(218,226,253,0.07)", background:"rgba(255,255,255,0.015)" }}>
          <span>Symbol</span><span>Venue/Type</span><span>Date Range</span><span>Records</span><span>Timeframes</span><span>Size</span>
        </div>
        <div className="flex flex-col divide-y divide-[rgba(218,226,253,0.05)]">
          {filtered.map(ins=>(
            <div key={ins.id} className="flex flex-col md:grid md:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] gap-2 md:gap-4 px-4 py-3 hover:bg-[rgba(255,255,255,0.02)] transition-colors cursor-pointer">
              <div><div className="text-xs font-bold font-mono text-[#dae2fd]">{ins.symbol}</div><div className="text-[9px] font-mono text-[rgba(218,226,253,0.4)]">{ins.quote}</div></div>
              <div><div className="text-[10px] font-mono text-[#dae2fd]">{ins.venue}</div><div className="text-[9px] font-mono text-[rgba(218,226,253,0.4)]">{ins.type}</div></div>
              <div className="flex items-center gap-1 text-[9px] font-mono text-[rgba(218,226,253,0.5)]"><Calendar size={9}/>{ins.start} → {ins.end}</div>
              <div><div className="text-[10px] font-mono text-[#dae2fd]">{ins.bars} bars</div><div className="text-[9px] font-mono text-[rgba(218,226,253,0.4)]">{ins.ticks} ticks</div></div>
              <div className="flex flex-wrap gap-1">{ins.tfs.map(tf=><span key={tf} className="text-[8px] font-mono px-1.5 py-0.5 rounded border" style={{ borderColor:"rgba(99,102,241,0.2)",color:"rgba(99,102,241,0.8)",background:"rgba(99,102,241,0.05)" }}>{tf}</span>)}</div>
              <div className="text-[10px] font-mono font-bold text-[rgba(218,226,253,0.6)]">{ins.gb.toFixed(1)} GB</div>
            </div>
          ))}
          {filtered.length===0 && <div className="px-4 py-8 text-center text-[10px] font-mono text-[rgba(218,226,253,0.25)]">No instruments match your filter</div>}
        </div>
      </div>
    </div>
  );
}
