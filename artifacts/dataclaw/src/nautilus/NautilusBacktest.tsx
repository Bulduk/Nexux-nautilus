import { useState } from "react";
import { Play, Clock, BarChart3, Calendar } from "lucide-react";

interface Result { label: string; value: string; color: string; }

const RESULTS: Result[] = [
  { label:"Total Return",        value:"+34.2%",    color:"#00FFB2" },
  { label:"Annualized Return",   value:"+41.5%",    color:"#00FFB2" },
  { label:"Sharpe Ratio",        value:"1.82",       color:"#6366f1" },
  { label:"Sortino Ratio",       value:"2.41",       color:"#6366f1" },
  { label:"Max Drawdown",        value:"-8.7%",      color:"#ef4444" },
  { label:"Win Rate",            value:"62.3%",      color:"#F59E0B" },
  { label:"Total Trades",        value:"347",        color:"#dae2fd" },
  { label:"Profit Factor",       value:"1.94",       color:"#00FFB2" },
  { label:"Avg Win",             value:"$142.50",    color:"#00FFB2" },
  { label:"Avg Loss",            value:"-$87.30",    color:"#ef4444" },
  { label:"Expectancy/Trade",    value:"$48.20",     color:"#00FFB2" },
  { label:"Calmar Ratio",        value:"4.77",       color:"#6366f1" },
];

const EQ = [100,103,107,105,110,115,112,118,122,120,125,130,128,134,137,135,140,138,143,147,145,150,148,153,157,155,160,163,161,167];

function EquityCurve() {
  const min = Math.min(...EQ), max = Math.max(...EQ), range = max - min || 1;
  const W=600, H=80;
  const pts = EQ.map((v,i) => `${(i/(EQ.length-1))*W},${H-((v-min)/range)*H}`).join(" ");
  return (
    <div className="w-full rounded-xl overflow-hidden border" style={{ borderColor:"rgba(0,255,178,0.1)", background:"rgba(0,0,0,0.2)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{height:80}}>
        <defs><linearGradient id="eq" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00FFB2" stopOpacity="0.3"/><stop offset="100%" stopColor="#00FFB2" stopOpacity="0"/></linearGradient></defs>
        <polyline fill="url(#eq)" stroke="none" points={`0,${H} ${pts} ${W},${H}`}/>
        <polyline fill="none" stroke="#00FFB2" strokeWidth="1.5" strokeLinejoin="round" points={pts}/>
      </svg>
    </div>
  );
}

type BtState = "idle"|"running"|"done";

export default function NautilusBacktest() {
  const [state, setState] = useState<BtState>("idle");
  const [cfg, setCfg] = useState({ strategy:"EMACross", venue:"BINANCE", instrument:"BTC/USDT-PERP", start:"2024-01-01", end:"2024-12-31", capital:"100000", fast:"10", slow:"20", size:"0.05" });
  const inp = "w-full rounded-lg px-3 py-2 text-xs font-mono bg-[rgba(255,255,255,0.04)] border border-[rgba(218,226,253,0.1)] text-[#dae2fd] outline-none focus:border-[rgba(99,102,241,0.4)] transition-colors";
  const lbl = "text-[9px] tracking-widest uppercase font-mono text-[rgba(218,226,253,0.4)]";

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-4xl mx-auto">
      <div><h1 className="text-base font-bold tracking-widest uppercase text-[#dae2fd]">Backtester</h1><p className="text-[10px] font-mono text-[rgba(218,226,253,0.4)]">NautilusTrader Historical Simulation Engine</p></div>

      <div className="rounded-xl border p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" style={{ background:"rgba(255,255,255,0.02)", borderColor:"rgba(218,226,253,0.08)" }}>
        <div className="flex flex-col gap-1.5"><label className={lbl}>Strategy Class</label>
          <select value={cfg.strategy} onChange={e=>setCfg(c=>({...c,strategy:e.target.value}))} className={inp}>
            {["EMACross","RSIReversalStrategy","VWAPScalper","MACDStrategy","BollingerBandStrategy"].map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5"><label className={lbl}>Venue</label>
          <select value={cfg.venue} onChange={e=>setCfg(c=>({...c,venue:e.target.value}))} className={inp}>
            {["BINANCE","BYBIT","OKX","DERIBIT"].map(v=><option key={v}>{v}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5"><label className={lbl}>Instrument</label><input type="text" value={cfg.instrument} onChange={e=>setCfg(c=>({...c,instrument:e.target.value}))} className={inp}/></div>
        <div className="flex flex-col gap-1.5"><label className={`${lbl} flex items-center gap-1`}><Calendar size={9}/>Start Date</label><input type="date" value={cfg.start} onChange={e=>setCfg(c=>({...c,start:e.target.value}))} className={inp}/></div>
        <div className="flex flex-col gap-1.5"><label className={`${lbl} flex items-center gap-1`}><Calendar size={9}/>End Date</label><input type="date" value={cfg.end} onChange={e=>setCfg(c=>({...c,end:e.target.value}))} className={inp}/></div>
        <div className="flex flex-col gap-1.5"><label className={lbl}>Initial Capital (USD)</label><input type="number" value={cfg.capital} onChange={e=>setCfg(c=>({...c,capital:e.target.value}))} className={inp}/></div>
        <div className="flex flex-col gap-1.5"><label className={lbl}>Fast EMA</label><input type="number" value={cfg.fast} onChange={e=>setCfg(c=>({...c,fast:e.target.value}))} className={inp}/></div>
        <div className="flex flex-col gap-1.5"><label className={lbl}>Slow EMA</label><input type="number" value={cfg.slow} onChange={e=>setCfg(c=>({...c,slow:e.target.value}))} className={inp}/></div>
        <div className="flex flex-col gap-1.5"><label className={lbl}>Trade Size (BTC)</label><input type="number" value={cfg.size} onChange={e=>setCfg(c=>({...c,size:e.target.value}))} className={inp}/></div>
      </div>

      <button onClick={()=>{setState("running");setTimeout(()=>setState("done"),2500);}} disabled={state==="running"}
        className="self-start flex items-center gap-2 px-6 py-3 rounded-xl font-bold tracking-widest uppercase text-xs font-mono transition-all disabled:opacity-50"
        style={{ background:state==="running"?"rgba(99,102,241,0.4)":"#6366f1", color:"#fff", boxShadow:state==="running"?"none":"0 0 20px rgba(99,102,241,0.3)" }}>
        {state==="running" ? <><Clock size={14} className="animate-spin"/>Running…</> : <><Play size={14}/>Run Backtest</>}
      </button>

      {state==="done" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border p-4" style={{ background:"linear-gradient(135deg,rgba(0,255,178,0.04),transparent)", borderColor:"rgba(0,255,178,0.15)" }}>
            <h2 className="text-[10px] tracking-widest uppercase font-mono text-[rgba(218,226,253,0.5)] mb-3 flex items-center gap-2"><BarChart3 size={11}/>Equity Curve (Simulated)</h2>
            <EquityCurve/>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {RESULTS.map(({label,value,color})=>(
              <div key={label} className="rounded-xl p-3 border flex flex-col gap-1" style={{ background:"rgba(255,255,255,0.02)", borderColor:"rgba(218,226,253,0.07)" }}>
                <span className="text-[8px] tracking-widest uppercase font-mono text-[rgba(218,226,253,0.35)]">{label}</span>
                <span className="text-sm font-bold font-mono" style={{color}}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
