import { useState } from "react";
import { Settings2, Save, Plug, Server, Key, Plus, Trash2 } from "lucide-react";

interface Venue { id:string; name:string; type:string; apiKey:string; secret:string; testnet:boolean; enabled:boolean; }
interface Node  { host:string; port:string; zmqData:string; zmqExec:string; logLevel:string; maxConn:string; heartbeat:string; bypassLog:boolean; }

const INIT_VENUES: Venue[] = [
  { id:"1", name:"BINANCE", type:"CRYPTO_EXCHANGE", apiKey:"api_key_***",   secret:"••••••••", testnet:false, enabled:true  },
  { id:"2", name:"BYBIT",   type:"CRYPTO_EXCHANGE", apiKey:"bybit_key_***", secret:"••••••••", testnet:false, enabled:true  },
  { id:"3", name:"DERIBIT", type:"CRYPTO_EXCHANGE", apiKey:"",              secret:"",         testnet:true,  enabled:false },
];
const INIT_NODE: Node = { host:"0.0.0.0", port:"6868", zmqData:"55001", zmqExec:"55002", logLevel:"INFO", maxConn:"50", heartbeat:"30", bypassLog:false };

export default function NautilusConfig() {
  const [venues, setVenues] = useState<Venue[]>(INIT_VENUES);
  const [node, setNode] = useState<Node>(INIT_NODE);
  const [saved, setSaved] = useState(false);

  function save() { setSaved(true); setTimeout(()=>setSaved(false),2000); }
  const inp = "w-full rounded-lg px-3 py-2 text-xs font-mono bg-[rgba(255,255,255,0.04)] border border-[rgba(218,226,253,0.1)] text-[#dae2fd] outline-none focus:border-[rgba(99,102,241,0.4)] transition-colors";
  const lbl = "text-[9px] tracking-widest uppercase font-mono text-[rgba(218,226,253,0.4)]";

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-base font-bold tracking-widest uppercase text-[#dae2fd]">Configuration</h1><p className="text-[10px] font-mono text-[rgba(218,226,253,0.4)]">Venues, nodes and engine parameters</p></div>
        <button onClick={save} className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold tracking-widest uppercase text-[9px] font-mono transition-all"
          style={{ background:saved?"rgba(0,255,178,0.15)":"#6366f1", color:saved?"#00FFB2":"#fff", boxShadow:saved?"none":"0 0 16px rgba(99,102,241,0.3)" }}>
          <Save size={12}/>{saved?"Saved!":"Save All"}
        </button>
      </div>

      {/* Venues */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] tracking-widest uppercase font-mono text-[rgba(218,226,253,0.5)] flex items-center gap-2"><Plug size={11}/>Trading Venues</h2>
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[9px] font-bold font-mono tracking-widest uppercase" style={{borderColor:"rgba(0,255,178,0.2)",color:"rgba(0,255,178,0.6)"}}><Plus size={11}/>Add Venue</button>
        </div>
        {venues.map(v=>(
          <div key={v.id} className="rounded-xl border p-4 flex flex-col gap-4" style={{ background:"rgba(255,255,255,0.02)", borderColor:v.enabled?"rgba(0,255,178,0.1)":"rgba(218,226,253,0.07)" }}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[11px] font-mono text-black" style={{background:v.enabled?"#00FFB2":"rgba(218,226,253,0.15)"}}>{v.name[0]}</div>
              <div className="flex-1 min-w-0"><div className="text-xs font-bold font-mono text-[#dae2fd]">{v.name}</div><div className="text-[9px] font-mono text-[rgba(218,226,253,0.4)]">{v.type}</div></div>
              <div className="flex items-center gap-2">
                <button onClick={()=>setVenues(vs=>vs.map(x=>x.id===v.id?{...x,testnet:!x.testnet}:x))} className="text-[8px] font-mono font-bold px-2 py-1 rounded border transition-all"
                  style={v.testnet?{borderColor:"rgba(245,158,11,0.3)",color:"#F59E0B",background:"rgba(245,158,11,0.08)"}:{borderColor:"rgba(218,226,253,0.1)",color:"rgba(218,226,253,0.4)",background:"transparent"}}>
                  {v.testnet?"TESTNET":"LIVE"}
                </button>
                <button onClick={()=>setVenues(vs=>vs.map(x=>x.id===v.id?{...x,enabled:!x.enabled}:x))} className="w-10 h-5 rounded-full relative transition-all border" style={{background:v.enabled?"rgba(0,255,178,0.3)":"rgba(218,226,253,0.07)",borderColor:v.enabled?"rgba(0,255,178,0.4)":"rgba(218,226,253,0.12)"}}>
                  <div className="absolute top-0.5 w-4 h-4 rounded-full transition-all" style={{left:v.enabled?"calc(100% - 18px)":"2px",background:v.enabled?"#00FFB2":"rgba(218,226,253,0.3)"}}/>
                </button>
                <button onClick={()=>setVenues(vs=>vs.filter(x=>x.id!==v.id))}><Trash2 size={13} style={{color:"rgba(239,68,68,0.4)"}}/></button>
              </div>
            </div>
            {v.enabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5"><label className={`${lbl} flex items-center gap-1`}><Key size={8}/>API Key</label><input type="text" defaultValue={v.apiKey} placeholder="Enter API key" className={inp}/></div>
                <div className="flex flex-col gap-1.5"><label className={`${lbl} flex items-center gap-1`}><Key size={8}/>API Secret</label><input type="password" defaultValue={v.secret} placeholder="Enter secret" className={inp}/></div>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* Node */}
      <section className="flex flex-col gap-3">
        <h2 className="text-[10px] tracking-widest uppercase font-mono text-[rgba(218,226,253,0.5)] flex items-center gap-2"><Server size={11}/>Trading Node</h2>
        <div className="rounded-xl border p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" style={{ background:"rgba(255,255,255,0.02)", borderColor:"rgba(218,226,253,0.08)" }}>
          {([["Host","host","text"],["Port","port","number"],["ZMQ Data Port","zmqData","number"],["ZMQ Exec Port","zmqExec","number"],["Max Connections","maxConn","number"],["Heartbeat (s)","heartbeat","number"]] as [string,keyof Node,string][]).map(([label,key,type])=>(
            <div key={key} className="flex flex-col gap-1.5"><label className={lbl}>{label}</label>
              <input type={type} value={String(node[key])} onChange={e=>setNode(n=>({...n,[key]:e.target.value}))} className={inp}/>
            </div>
          ))}
          <div className="flex flex-col gap-1.5"><label className={lbl}>Log Level</label>
            <select value={node.logLevel} onChange={e=>setNode(n=>({...n,logLevel:e.target.value}))} className={inp}>
              {["DEBUG","INFO","WARNING","ERROR"].map(l=><option key={l}>{l}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5"><label className={lbl}>Bypass File Logging</label>
            <button onClick={()=>setNode(n=>({...n,bypassLog:!n.bypassLog}))} className="flex items-center gap-2 text-[10px] font-mono font-bold">
              <div className="w-10 h-5 rounded-full relative border transition-all" style={{background:node.bypassLog?"rgba(245,158,11,0.3)":"rgba(218,226,253,0.07)",borderColor:node.bypassLog?"rgba(245,158,11,0.4)":"rgba(218,226,253,0.12)"}}>
                <div className="absolute top-0.5 w-4 h-4 rounded-full transition-all" style={{left:node.bypassLog?"calc(100% - 18px)":"2px",background:node.bypassLog?"#F59E0B":"rgba(218,226,253,0.3)"}}/>
              </div>
              <span style={{color:node.bypassLog?"#F59E0B":"rgba(218,226,253,0.35)"}}>{node.bypassLog?"Enabled":"Disabled"}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
