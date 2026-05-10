import { lazy, Suspense, useState } from "react";
import { useLocation } from "wouter";
import {
  LayoutDashboard, Bot, FlaskConical, Database,
  Terminal, Settings2, LogOut, ChevronRight,
  Activity, Waves, Brain,
} from "lucide-react";
import { clsx } from "clsx";

const NautilusDashboard   = lazy(() => import("../nautilus/NautilusDashboard"));
const NautilusStrategies  = lazy(() => import("../nautilus/NautilusStrategies"));
const NautilusBacktest    = lazy(() => import("../nautilus/NautilusBacktest"));
const NautilusDataCatalog = lazy(() => import("../nautilus/NautilusDataCatalog"));
const NautilusLogs        = lazy(() => import("../nautilus/NautilusLogs"));
const NautilusConfig      = lazy(() => import("../nautilus/NautilusConfig"));
const NautilusAgents      = lazy(() => import("../nautilus/NautilusAgents"));

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const NAV = [
  { id:"dashboard",  icon:LayoutDashboard, label:"Dashboard",  sub:"Engine Status"  },
  { id:"strategies", icon:Bot,             label:"Strategies", sub:"Live & Idle"     },
  { id:"agents",     icon:Brain,           label:"AI Agents",  sub:"nautilus_agents" },
  { id:"backtest",   icon:FlaskConical,    label:"Backtest",   sub:"Simulation"      },
  { id:"data",       icon:Database,        label:"Data",       sub:"Catalog & Feeds" },
  { id:"logs",       icon:Terminal,        label:"Live Logs",  sub:"Stream"          },
  { id:"config",     icon:Settings2,       label:"Config",     sub:"Venues & Nodes"  },
];

const MOBILE_NAV = [
  { id:"dashboard",  icon:LayoutDashboard, label:"Dashboard" },
  { id:"strategies", icon:Bot,             label:"Strategies"},
  { id:"agents",     icon:Brain,           label:"Agents"    },
  { id:"logs",       icon:Terminal,        label:"Logs"      },
  { id:"config",     icon:Settings2,       label:"Config"    },
];

function TabLoader() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[300px]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-9 h-9 rounded-full border-2 border-t-transparent animate-spin" style={{borderColor:"#6366f1",borderTopColor:"transparent"}}/>
        <span className="text-[10px] tracking-widest uppercase font-mono text-[#6366f1]/60">Loading</span>
      </div>
    </div>
  );
}

function useCurrentUser() {
  const [user, setUser] = useState<{email?:string;fullName?:string|null;plan?:string}|null>(null);
  useState(() => {
    fetch("/api/auth/user", {credentials:"include"}).then(r=>r.json()).then((d:{user?:{email?:string;fullName?:string|null;plan?:string}|null})=>{
      if(d.user) setUser(d.user);
    }).catch(()=>{});
  });
  return user;
}

async function doLogout() {
  await fetch("/api/auth/logout", {method:"POST", credentials:"include"}).catch(()=>{});
  window.location.href = `${basePath}/login`;
}

export default function NautilusShell() {
  const [tab, setTab] = useState("dashboard");
  const user = useCurrentUser();
  const [, setLocation] = useLocation();

  const displayName = user?.fullName ?? user?.email?.split("@")[0] ?? "Trader";
  const displayInitial = displayName[0]?.toUpperCase() ?? "T";
  const planLabel = user?.plan ?? "FREE";

  return (
    <div className="flex h-[100dvh] font-mono overflow-hidden" style={{background:"#050505",color:"#dae2fd"}}>

      {/* ── Desktop Sidebar ─────────────────────────────────────────── */}
      <div className="hidden md:flex w-60 flex-col h-screen shrink-0 relative z-20"
        style={{background:"linear-gradient(180deg,#080d1a 0%,#050a14 100%)",borderRight:"1px solid rgba(99,102,241,0.15)",boxShadow:"4px 0 24px rgba(0,0,0,0.5)"}}>

        {/* Logo */}
        <div className="p-4 flex items-center gap-3 border-b" style={{borderColor:"rgba(99,102,241,0.12)"}}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background:"linear-gradient(135deg,#6366f1 0%,#4338ca 100%)",boxShadow:"0 0 16px rgba(99,102,241,0.35)"}}>
            <Waves size={16} className="text-white"/>
          </div>
          <div>
            <div className="text-xs font-bold tracking-widest uppercase" style={{color:"#6366f1"}}>NAUTILUS</div>
            <div className="text-[9px] text-[rgba(218,226,253,0.35)] tracking-wide">Algo Trading Engine</div>
          </div>
        </div>

        {/* Switch to Nexus */}
        <button onClick={()=>setLocation(`${basePath}/nexus`)}
          className="mx-3 mt-3 mb-1 flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[9px] font-bold tracking-widest uppercase border transition-all hover:bg-[rgba(0,255,178,0.06)]"
          style={{borderColor:"rgba(0,255,178,0.15)",color:"rgba(0,255,178,0.6)"}}>
          <span className="flex items-center gap-1.5"><Activity size={10}/>NEXUS OS</span>
          <ChevronRight size={10}/>
        </button>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 flex flex-col gap-0.5">
          {NAV.map(item=>{
            const active = tab===item.id;
            const Icon = item.icon;
            return (
              <button key={item.id} onClick={()=>setTab(item.id)}
                className={clsx("flex items-center gap-3 w-full p-2.5 rounded-xl text-left transition-all border",
                  active?"border-[rgba(99,102,241,0.4)] bg-[rgba(99,102,241,0.12)]":"border-transparent hover:bg-[rgba(255,255,255,0.03)]")}>
                <Icon size={14} style={{color:active?"#6366f1":"rgba(218,226,253,0.35)"}}/>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold tracking-tight" style={{color:active?"#dae2fd":"rgba(218,226,253,0.55)"}}>{item.label}</span>
                  <span className="text-[9px] text-[rgba(218,226,253,0.3)]">{item.sub}</span>
                </div>
                {active&&<div className="ml-auto w-1.5 h-1.5 rounded-full" style={{background:"#6366f1",boxShadow:"0 0 6px #6366f1"}}/>}
              </button>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-3 border-t" style={{borderColor:"rgba(99,102,241,0.12)"}}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-mono shrink-0" style={{background:"rgba(99,102,241,0.2)",color:"#6366f1"}}>{displayInitial}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold truncate text-[#dae2fd]">{displayName}</div>
              <div className="text-[9px] text-[rgba(218,226,253,0.35)] truncate">{planLabel} plan</div>
            </div>
            <button onClick={doLogout} className="p-1.5 rounded-lg hover:bg-[rgba(239,68,68,0.1)] transition-colors" title="Çıkış Yap">
              <LogOut size={12} style={{color:"rgba(218,226,253,0.4)"}}/>
            </button>
          </div>
        </div>
      </div>

      {/* ── Main ───────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-3 py-2 shrink-0 border-b"
          style={{background:"#080d1a",borderColor:"rgba(99,102,241,0.15)",paddingTop:"calc(env(safe-area-inset-top,0px) + 0.5rem)"}}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{background:"linear-gradient(135deg,#6366f1,#4338ca)"}}>
              <Waves size={13} className="text-white"/>
            </div>
            <span className="text-xs font-bold tracking-widest uppercase text-[#6366f1]">NAUTILUS</span>
          </div>
          <button onClick={()=>setLocation(`${basePath}/nexus`)}
            className="text-[9px] font-mono font-bold tracking-widest uppercase px-2.5 py-1.5 rounded-lg border"
            style={{borderColor:"rgba(0,255,178,0.2)",color:"rgba(0,255,178,0.6)"}}>
            → NEXUS
          </button>
        </div>

        <main className="flex-1 overflow-y-auto" style={{paddingBottom:"calc(env(safe-area-inset-bottom,0) + 4rem)"}}>
          <Suspense fallback={<TabLoader/>}>
            {tab==="dashboard"  && <NautilusDashboard/>}
            {tab==="strategies" && <NautilusStrategies/>}
            {tab==="agents"     && <NautilusAgents/>}
            {tab==="backtest"   && <NautilusBacktest/>}
            {tab==="data"       && <NautilusDataCatalog/>}
            {tab==="logs"       && <NautilusLogs/>}
            {tab==="config"     && <NautilusConfig/>}
          </Suspense>
        </main>
      </div>

      {/* ── Mobile bottom nav ──────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 backdrop-blur border-t"
        style={{background:"rgba(8,13,26,0.95)",borderColor:"rgba(99,102,241,0.15)",paddingBottom:"env(safe-area-inset-bottom,0)"}}>
        <div className="grid grid-cols-5">
          {MOBILE_NAV.map(item=>{
            const active = tab===item.id;
            const Icon = item.icon;
            return (
              <button key={item.id} onClick={()=>setTab(item.id)}
                className="flex flex-col items-center justify-center gap-1 py-2.5 transition-colors font-mono"
                style={{color:active?"#6366f1":"rgba(218,226,253,0.3)"}}>
                <Icon size={15}/>
                <span className="text-[8px] font-semibold tracking-tight leading-none">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
