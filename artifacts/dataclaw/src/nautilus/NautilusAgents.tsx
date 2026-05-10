import { useState, useRef, useEffect } from "react";
import {
  Bot, Send, Sparkles, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, Clock, Brain,
  BarChart3, Shield, Zap, RefreshCw,
} from "lucide-react";

// Based on nautechsystems/nautilus_agents — AI-powered trading agents
// that wrap NautilusTrader strategies with LLM reasoning

interface AgentMessage {
  id: string;
  role: "user" | "agent" | "system";
  agentType?: AgentType;
  content: string;
  ts: Date;
  data?: Record<string, unknown>;
}

type AgentType =
  | "market_analyst"
  | "risk_manager"
  | "strategy_optimizer"
  | "execution_advisor"
  | "portfolio_balancer";

interface NautilusAgent {
  id: AgentType;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  capabilities: string[];
  model: string;
}

const AGENTS: NautilusAgent[] = [
  {
    id: "market_analyst",
    name: "Market Analyst",
    description: "OHLCV, order book and sentiment analysis using bar data from the NautilusTrader data engine",
    icon: BarChart3,
    color: "#6366f1",
    capabilities: ["Bar pattern recognition", "Volume profile", "Order book imbalance", "Correlation analysis"],
    model: "claude-3-5-sonnet",
  },
  {
    id: "risk_manager",
    name: "Risk Manager",
    description: "Portfolio risk, drawdown limits and position sizing via NautilusTrader RiskEngine",
    icon: Shield,
    color: "#F59E0B",
    capabilities: ["VaR calculation", "Drawdown monitoring", "Position limits", "Kill switch triggers"],
    model: "claude-3-5-sonnet",
  },
  {
    id: "strategy_optimizer",
    name: "Strategy Optimizer",
    description: "Suggests parameter tuning for live strategies using backtest data and walk-forward analysis",
    icon: Sparkles,
    color: "#00FFB2",
    capabilities: ["Parameter sweeps", "Walk-forward analysis", "Regime detection", "Sharpe optimization"],
    model: "claude-3-opus",
  },
  {
    id: "execution_advisor",
    name: "Execution Advisor",
    description: "Optimal order routing, slippage minimization and execution timing recommendations",
    icon: Zap,
    color: "#ec4899",
    capabilities: ["TWAP/VWAP timing", "Slippage modeling", "Venue selection", "Order type selection"],
    model: "claude-3-5-sonnet",
  },
  {
    id: "portfolio_balancer",
    name: "Portfolio Balancer",
    description: "Cross-strategy allocation, correlation management and rebalancing signals",
    icon: Brain,
    color: "#14b8a6",
    capabilities: ["Kelly criterion", "Correlation matrix", "Capital allocation", "Rebalancing signals"],
    model: "claude-3-5-sonnet",
  },
];

const MOCK_RESPONSES: Record<AgentType, string[]> = {
  market_analyst: [
    "**BTC/USDT 4H Analysis:**\n\nCurrent price is trading above both the 20 and 50-period EMAs, indicating a bullish trend structure. Volume on the last 3 bars is 18% above the 20-bar average — accumulation pattern. Order book shows 2.4x bid-side imbalance at the $43,200 support level.\n\n**Signal:** BULLISH with moderate confidence (0.71)\n**Key levels:** Support $43,200 | Resistance $44,800",
    "**Cross-pair correlation update:**\n\nBTC/ETH correlation at 0.87 (7d) — high co-movement. SOL showing early decoupling (correlation 0.62). Funding rates normalized across all pairs after yesterday's spike. No significant divergence signals present.",
  ],
  risk_manager: [
    "**Portfolio Risk Report:**\n\nCurrent gross exposure: 42.3% of capital\nVaR (95%, 1d): -$2,140\nMax drawdown (7d): -3.2%\n\n⚠️ **Warning:** BTC/USDT position approaching 15% max single-asset limit (currently 13.8%). Consider reducing if price moves against.\n\n**Kill switch status:** GREEN — all thresholds within bounds",
    "**Risk-adjusted position sizing for new entry:**\n\nUsing Kelly Criterion with estimated edge of 8.2%:\nFull Kelly: 16.4% of capital\nHalf Kelly (recommended): 8.2% → **$8,200 position size** at current NAV\n\nStop placement: $43,150 (2.1% risk | $172 max loss per unit)",
  ],
  strategy_optimizer: [
    "**EMACross Parameter Sweep Results:**\n\nTested 144 parameter combinations (fast: 5-20, slow: 15-50) on 12-month out-of-sample data:\n\n🏆 **Best Sharpe:** fast=8, slow=21 → Sharpe 2.14 (+17% vs current)\n🏆 **Best return:** fast=10, slow=25 → +48.2% annualized\n\n**Recommendation:** Trial fast=8, slow=21 in paper mode for 2 weeks before live deployment.",
    "**Regime Analysis — BTC/USDT:**\n\nCurrent market regime: **TRENDING** (HMM confidence 0.83)\nExpected duration: 3-12 days\n\nYour EMACross strategy performs best in trending regimes (avg Sharpe 1.94 vs 0.41 in mean-reverting). No parameter changes recommended until regime shift detected.",
  ],
  execution_advisor: [
    "**Optimal Execution Plan — BUY 0.5 BTC:**\n\nOrder book depth analysis:\n- Best bid: $43,848 | Best ask: $43,851\n- 0.5 BTC available within $43,855 (1.4bps slippage)\n\n**Recommendation:** LIMIT order at $43,849 — 78% fill probability within 30 seconds based on historical flow\n\nAlternatively: VWAP slice over 10 minutes for size > 1 BTC to minimize market impact.",
    "**Venue Comparison — BTC/USDT:**\n\n| Venue | Spread | Fee | Fill rate |\n|-------|--------|-----|-----------|\n| Binance | 2bps | 2bps | 94% |\n| Bybit | 3bps | 1.5bps | 91% |\n| OKX | 2bps | 2bps | 89% |\n\n**Recommendation:** Route to Binance for fills < 0.2 BTC, consider splitting > 0.5 BTC across venues.",
  ],
  portfolio_balancer: [
    "**Portfolio Rebalancing Signal:**\n\nCurrent allocations vs targets:\n- BTC: 13.8% (target 12%) → **Reduce by $1,840**\n- ETH: 8.1% (target 9%) → **Increase by $920**\n- SOL: 4.2% (target 5%) → **Increase by $800**\n\n**Suggested action:** Trim BTC position on next strength, add ETH/SOL on any 3%+ dip.",
    "**Cross-strategy capital allocation review:**\n\nUsing Sharpe-weighted Kelly across active strategies:\n- EMACross BTC: 42% (Sharpe 1.82)\n- RSI Reversal ETH: 28% (Sharpe 1.41)\n- VWAP Scalp SOL: 15% (Sharpe 0.62) — underperforming\n- Cash reserve: 15%\n\n**Recommendation:** Reduce VWAP Scalp to 8%, increase cash to 22% pending market regime confirmation.",
  ],
};

function AgentCard({
  agent,
  selected,
  onSelect,
}: {
  agent: NautilusAgent;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = agent.icon;
  return (
    <button
      onClick={onSelect}
      className="w-full text-left rounded-xl border p-3 transition-all"
      style={{
        background: selected ? `rgba(${agent.color === "#6366f1" ? "99,102,241" : agent.color === "#00FFB2" ? "0,255,178" : agent.color === "#F59E0B" ? "245,158,11" : agent.color === "#ec4899" ? "236,72,153" : "20,184,166"},0.1)` : "rgba(255,255,255,0.02)",
        borderColor: selected ? agent.color + "40" : "rgba(218,226,253,0.07)",
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={13} style={{ color: agent.color }} />
        <span className="text-[10px] font-bold font-mono text-[#dae2fd]">{agent.name}</span>
      </div>
      <p className="text-[9px] font-mono leading-relaxed" style={{ color: "rgba(218,226,253,0.4)" }}>
        {agent.description}
      </p>
      <div className="flex flex-wrap gap-1 mt-2">
        {agent.capabilities.slice(0, 2).map((c) => (
          <span
            key={c}
            className="text-[8px] px-1.5 py-0.5 rounded border font-mono"
            style={{ borderColor: agent.color + "25", color: agent.color + "aa", background: agent.color + "08" }}
          >
            {c}
          </span>
        ))}
      </div>
    </button>
  );
}

let _msgId = 0;
function makeId() { return String(++_msgId); }

export default function NautilusAgents() {
  const [selectedAgent, setSelectedAgent] = useState<AgentType>("market_analyst");
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: makeId(),
      role: "system",
      content: "Nautilus Agents are online. Select an agent and ask a question about your trading engine, strategies, risk, or execution.",
      ts: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const agent = AGENTS.find((a) => a.id === selectedAgent)!;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage() {
    if (!input.trim() || thinking) return;
    const userMsg: AgentMessage = {
      id: makeId(),
      role: "user",
      content: input.trim(),
      ts: new Date(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setThinking(true);

    const responses = MOCK_RESPONSES[selectedAgent];
    const reply = responses[Math.floor(Math.random() * responses.length)]!;
    setTimeout(
      () => {
        setMessages((m) => [
          ...m,
          {
            id: makeId(),
            role: "agent",
            agentType: selectedAgent,
            content: reply,
            ts: new Date(),
          },
        ]);
        setThinking(false);
      },
      1200 + Math.random() * 1000,
    );
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function renderContent(text: string) {
    return text.split("\n").map((line, i) => {
      if (line.startsWith("**") && line.endsWith("**")) {
        return <p key={i} className="font-bold text-[#dae2fd] mb-1">{line.slice(2, -2)}</p>;
      }
      if (line.startsWith("🏆 ") || line.startsWith("⚠️ ")) {
        return <p key={i} className="my-0.5">{line}</p>;
      }
      if (line.startsWith("- ") || line.startsWith("| ")) {
        return <p key={i} className="text-[rgba(218,226,253,0.7)] my-0">{line}</p>;
      }
      if (line === "") return <br key={i} />;
      return <p key={i} className="my-0">{line}</p>;
    });
  }

  return (
    <div className="flex flex-col md:flex-row h-full gap-0 min-h-[600px]">
      {/* ── Agent selector (sidebar) ────────────────────────────────────── */}
      <div
        className="md:w-64 shrink-0 flex flex-col border-b md:border-b-0 md:border-r p-3 gap-2"
        style={{ borderColor: "rgba(218,226,253,0.07)", background: "rgba(0,0,0,0.15)" }}
      >
        <div className="flex items-center gap-2 px-1 pb-2 border-b mb-1" style={{ borderColor: "rgba(218,226,253,0.06)" }}>
          <Brain size={13} style={{ color: "#6366f1" }} />
          <span className="text-[9px] font-bold font-mono tracking-widest uppercase text-[rgba(218,226,253,0.5)]">
            Nautilus Agents
          </span>
        </div>
        {/* Mobile: horizontal scroll */}
        <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0">
          {AGENTS.map((a) => (
            <div key={a.id} className="shrink-0 w-[220px] md:w-auto">
              <AgentCard
                agent={a}
                selected={selectedAgent === a.id}
                onSelect={() => {
                  setSelectedAgent(a.id);
                  setMessages([{
                    id: makeId(),
                    role: "system",
                    content: `Switched to **${a.name}**. ${a.description}`,
                    ts: new Date(),
                  }]);
                }}
              />
            </div>
          ))}
        </div>

        {/* Model info */}
        <div
          className="hidden md:flex items-center gap-1.5 mt-auto p-2 rounded-lg border"
          style={{ borderColor: "rgba(218,226,253,0.07)", background: "rgba(255,255,255,0.02)" }}
        >
          <Sparkles size={10} style={{ color: "rgba(218,226,253,0.4)" }} />
          <div className="flex flex-col">
            <span className="text-[8px] font-mono text-[rgba(218,226,253,0.3)]">Model</span>
            <span className="text-[9px] font-mono font-bold text-[rgba(218,226,253,0.6)]">{agent.model}</span>
          </div>
        </div>
      </div>

      {/* ── Chat panel ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b shrink-0"
          style={{ borderColor: "rgba(218,226,253,0.07)", background: "rgba(0,0,0,0.1)" }}
        >
          {(() => { const Icon = agent.icon; return <Icon size={15} style={{ color: agent.color }} />; })()}
          <div>
            <div className="text-xs font-bold font-mono text-[#dae2fd]">{agent.name}</div>
            <div className="text-[9px] font-mono text-[rgba(218,226,253,0.35)]">
              Powered by {agent.model} · NautilusTrader data engine
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#00FFB2] animate-pulse" />
            <span className="text-[9px] font-mono text-[#00FFB2]">Online</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "system" ? (
                <div
                  className="text-[9px] font-mono px-3 py-1.5 rounded-lg border text-center w-full"
                  style={{
                    background: "rgba(99,102,241,0.05)",
                    borderColor: "rgba(99,102,241,0.15)",
                    color: "rgba(218,226,253,0.5)",
                  }}
                >
                  {msg.content}
                </div>
              ) : msg.role === "user" ? (
                <div
                  className="max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-xs font-mono"
                  style={{ background: "rgba(99,102,241,0.2)", color: "#dae2fd", border: "1px solid rgba(99,102,241,0.3)" }}
                >
                  {msg.content}
                </div>
              ) : (
                <div className="max-w-[90%] flex items-start gap-2">
                  {(() => { const a = AGENTS.find((x) => x.id === msg.agentType)!; const Icon = a?.icon ?? Bot; return <Icon size={13} style={{ color: a?.color ?? "#6366f1" }} className="mt-1 shrink-0" />; })()}
                  <div
                    className="rounded-2xl rounded-tl-sm px-4 py-3 text-[11px] font-mono leading-relaxed"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(218,226,253,0.08)",
                      color: "rgba(218,226,253,0.85)",
                    }}
                  >
                    {renderContent(msg.content)}
                  </div>
                </div>
              )}
            </div>
          ))}

          {thinking && (
            <div className="flex items-center gap-2">
              {(() => { const Icon = agent.icon; return <Icon size={13} style={{ color: agent.color }} className="shrink-0" />; })()}
              <div
                className="rounded-2xl rounded-tl-sm px-4 py-3 border flex items-center gap-2"
                style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(218,226,253,0.08)" }}
              >
                <RefreshCw size={11} className="animate-spin" style={{ color: agent.color }} />
                <span className="text-[10px] font-mono" style={{ color: "rgba(218,226,253,0.4)" }}>
                  Analyzing engine data…
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick prompts */}
        <div className="px-4 pb-2 flex flex-wrap gap-1.5 shrink-0">
          {[
            "Analyze current BTC/USDT trend",
            "Check portfolio risk levels",
            "Suggest position sizing",
            "Optimize strategy parameters",
          ].map((p) => (
            <button
              key={p}
              onClick={() => { setInput(p); }}
              className="text-[8px] font-mono px-2 py-1 rounded-lg border transition-all hover:bg-[rgba(99,102,241,0.1)]"
              style={{ borderColor: "rgba(99,102,241,0.2)", color: "rgba(99,102,241,0.7)" }}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Input */}
        <div
          className="px-4 pb-4 shrink-0"
        >
          <div
            className="flex items-end gap-2 rounded-xl border p-2"
            style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(218,226,253,0.1)" }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={`Ask ${agent.name}…`}
              rows={1}
              className="flex-1 bg-transparent text-xs font-mono text-[#dae2fd] outline-none resize-none placeholder:text-[rgba(218,226,253,0.25)] min-h-[28px] max-h-[100px]"
              style={{ lineHeight: "1.5" }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || thinking}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-40"
              style={{ background: agent.color, color: "#050505" }}
            >
              <Send size={13} />
            </button>
          </div>
          <p className="text-[8px] font-mono text-[rgba(218,226,253,0.2)] mt-1.5 text-center">
            Based on nautechsystems/nautilus_agents · Press Enter to send
          </p>
        </div>
      </div>
    </div>
  );
}
