import { useState, useEffect, useRef } from "react";
import { Terminal, Pause, Play, Trash2 } from "lucide-react";

type Level = "INF"|"WRN"|"ERR"|"DBG";
interface Log { ts:string; level:Level; comp:string; msg:string; }

const LS: Record<Level,{color:string;bg:string}> = {
  INF:{color:"#00FFB2",bg:"rgba(0,255,178,0.08)"},
  WRN:{color:"#F59E0B",bg:"rgba(245,158,11,0.08)"},
  ERR:{color:"#ef4444",bg:"rgba(239,68,68,0.08)"},
  DBG:{color:"rgba(218,226,253,0.4)",bg:"transparent"},
};
const COMPS = ["RiskEngine","ExecutionEngine","DataEngine","OrderMatchEngine","Strategy.EMACross","Strategy.RSIRev","MessageBus","Portfolio"];
const MSGS: Record<Level,string[]> = {
  INF:["Order filled: BUY 0.05 BTC/USDT @ 43850.0 BINANCE","Bar received: BTC/USDT 5m close=43812.5","Signal generated: LONG EMACross confidence=0.78","Portfolio NAV updated: $101,842.50","Heartbeat OK — engine uptime 2d14h","Position opened: BTC/USDT LONG 0.05 @ 43780.0","Risk check passed: utilization 42.3%"],
  WRN:["Latency spike detected: 285ms (threshold 200ms)","Order partially filled: remaining qty 0.02 BTC","Spread widened: BTC/USDT 18bps (normal <8bps)","Rate limit approaching: 85% of weight used"],
  ERR:["WebSocket reconnect: BYBIT feed dropped, attempt 1/5","Order rejected: insufficient margin","Strategy error: RSIRev divide by zero"],
  DBG:["EMA fast=43812.5 slow=43721.3 delta=91.2","RSI value=58.4 overbought=70 oversold=30","Tick processed: BTC/USDT bid=43849 ask=43851","MessageBus dispatch: BarEvent → 3 subscribers"],
};
function rndLevel(): Level { const r=Math.random(); return r<0.65?"INF":r<0.82?"DBG":r<0.95?"WRN":"ERR"; }
function makeLog(): Log {
  const level=rndLevel();
  return { ts:new Date().toISOString().slice(11,23), level, comp:COMPS[Math.floor(Math.random()*COMPS.length)]!, msg:MSGS[level][Math.floor(Math.random()*MSGS[level].length)]! };
}
const INIT: Log[] = Array.from({length:18},makeLog);
type Filter = "ALL"|Level;

export default function NautilusLogs() {
  const [logs, setLogs] = useState<Log[]>(INIT);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<Filter>("ALL");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if(paused) return;
    const t = setInterval(()=>{
      setLogs(p=>{ const n=[...p,makeLog()]; return n.length>300?n.slice(-300):n; });
    }, 900+Math.random()*1100);
    return ()=>clearInterval(t);
  }, [paused]);

  useEffect(()=>{ if(!paused) bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[logs,paused]);

  const visible = filter==="ALL" ? logs : logs.filter(l=>l.level===filter);

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl mx-auto" style={{height:"calc(100vh - 120px)"}}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-base font-bold tracking-widest uppercase text-[#dae2fd]">Live Logs</h1><p className="text-[10px] font-mono text-[rgba(218,226,253,0.4)]">Real-time engine output stream</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border" style={{borderColor:"rgba(218,226,253,0.1)"}}>
            {(["ALL","INF","WRN","ERR","DBG"] as Filter[]).map(f=>(
              <button key={f} onClick={()=>setFilter(f)} className="px-2.5 py-1.5 text-[9px] font-bold font-mono tracking-widest uppercase transition-all"
                style={filter===f?{background:"rgba(99,102,241,0.2)",color:"#6366f1"}:{background:"transparent",color:"rgba(218,226,253,0.35)"}}>{f}</button>
            ))}
          </div>
          <button onClick={()=>setPaused(p=>!p)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[9px] font-bold font-mono tracking-widest uppercase transition-all"
            style={paused?{borderColor:"rgba(0,255,178,0.3)",color:"#00FFB2",background:"rgba(0,255,178,0.05)"}:{borderColor:"rgba(245,158,11,0.3)",color:"#F59E0B",background:"rgba(245,158,11,0.05)"}}>
            {paused?<><Play size={11}/>Resume</>:<><Pause size={11}/>Pause</>}
          </button>
          <button onClick={()=>setLogs([])} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[9px] font-bold font-mono tracking-widest uppercase"
            style={{borderColor:"rgba(239,68,68,0.2)",color:"rgba(239,68,68,0.6)"}}>
            <Trash2 size={11}/>Clear
          </button>
        </div>
      </div>
      <div className="flex-1 rounded-xl border overflow-y-auto font-mono" style={{background:"#0a0a0a",borderColor:"rgba(218,226,253,0.08)",minHeight:300}}>
        <div className="p-3 flex flex-col gap-0">
          {visible.map((log,i)=>{
            const s=LS[log.level];
            return (
              <div key={i} className="flex items-start gap-2 px-2 py-0.5 rounded hover:bg-[rgba(255,255,255,0.03)]">
                <span className="text-[9px] font-mono shrink-0 text-[rgba(218,226,253,0.25)]" style={{minWidth:90}}>{log.ts}</span>
                <span className="text-[9px] font-bold shrink-0 px-1.5 rounded text-center" style={{color:s.color,background:s.bg,minWidth:32}}>{log.level}</span>
                <span className="text-[9px] shrink-0" style={{color:"rgba(99,102,241,0.7)",minWidth:120}}>{log.comp}</span>
                <span className="text-[9px] break-all" style={{color:log.level==="DBG"?"rgba(218,226,253,0.35)":"#dae2fd"}}>{log.msg}</span>
              </div>
            );
          })}
          <div ref={bottomRef}/>
        </div>
      </div>
      <div className="text-[9px] font-mono text-[rgba(218,226,253,0.25)] flex items-center gap-2">
        <div className="w-2 h-2 rounded-full animate-pulse" style={{background:paused?"#F59E0B":"#00FFB2"}}/>
        {paused?"Stream paused":`Streaming — ${visible.length} entries`}
      </div>
    </div>
  );
}
