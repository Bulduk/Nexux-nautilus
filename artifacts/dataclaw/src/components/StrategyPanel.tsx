import { useState, useRef, useCallback, useEffect } from 'react';
import { TrendingUp, Zap, Newspaper, Bot, Network, Play, Save, RefreshCw, ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock, Trophy } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface StrategyDef {
  id: string; name: string; type: string; description: string;
  tags: string[]; params: Record<string, unknown>;
  naturalLanguage?: string; createdAt: number; builtin: boolean;
}

interface BacktestTrade {
  barIndex: number; direction: 'LONG' | 'SHORT'; entryPrice: number;
  exitPrice: number; pnlPct: number; holdBars: number;
  exitReason: 'TP' | 'SL' | 'TIME' | 'SIGNAL'; entryTime: number; exitTime: number;
}

interface BacktestResult {
  strategyId: string; strategyName: string; symbol: string; timeframe: string;
  totalCandles: number; totalTrades: number; winCount: number; lossCount: number;
  winRate: number; totalPnlPct: number; maxDrawdownPct: number;
  sharpeRatio: number; sortinoRatio: number; profitFactor: number;
  avgWinPct: number; avgLossPct: number; maxConsecLosses: number;
  expectancy: number; trades: BacktestTrade[];
  equityCurve: { ts: number; equity: number }[];
  runAt: string;
}

interface SentimentItem {
  symbol: string; price: number; change1h: number; change24h: number;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; score: number;
  headline: string; analysis: string;
  signals: { rsi: number | null; macdBias: string; bbPosition: string; volatility: string };
}

interface SwarmAgent {
  agent: string; role: string; direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number; reason: string; entry: number; stopLoss: number; takeProfit: number;
}

interface SwarmResult {
  symbol: string; price: number;
  agents: SwarmAgent[];
  consensus: { direction: string; confidence: number; longVotes: number; shortVotes: number };
  timestamp: string;
}

// ─── Inner Tabs ───────────────────────────────────────────────────────────────
const INNER_TABS = [
  { id: 'library', label: 'Library', icon: TrendingUp },
  { id: 'backtest', label: 'Backtest', icon: Play },
  { id: 'news', label: 'Sentiment', icon: Newspaper },
  { id: 'vibe', label: 'Vibe Agent', icon: Bot },
  { id: 'swarm', label: 'Swarm', icon: Network },
] as const;

type TabId = typeof INNER_TABS[number]['id'];

// ─── Equity Curve Chart ───────────────────────────────────────────────────────
function EquityCurve({ data }: { data: { ts: number; equity: number }[] }) {
  if (data.length < 2) return null;
  const W = 600; const H = 120; const PAD = 12;
  const min = Math.min(...data.map(d => d.equity));
  const max = Math.max(...data.map(d => d.equity));
  const range = max - min || 1;
  const pts = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - 2 * PAD);
    const y = H - PAD - ((d.equity - min) / range) * (H - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const isGreen = (data[data.length - 1]?.equity ?? 100) >= 100;
  const color = isGreen ? '#00FFB2' : '#FF4D6D';
  const first = pts.split(' ')[0] ?? '0,120';
  const last = pts.split(' ').pop() ?? '600,120';
  const fill = `${first} ${pts} ${last.split(',')[0]},${H} ${PAD},${H}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 120 }}>
      <defs>
        <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={PAD} y1={H - PAD - ((100 - min) / range) * (H - 2 * PAD)} x2={W - PAD} y2={H - PAD - ((100 - min) / range) * (H - 2 * PAD)} stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="4 4" />
      <polygon points={fill} fill="url(#eq-fill)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ─── Library Tab ──────────────────────────────────────────────────────────────
function LibraryTab({ strategies, onBacktest }: { strategies: StrategyDef[]; onBacktest: (s: StrategyDef) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const TYPE_COLORS: Record<string, string> = {
    ema_cross: '#adc9eb', rsi_reversal: '#00FFB2', bb_squeeze: '#a78bfa',
    breakout: '#f59e0b', vwap_bounce: '#67e8f9', stoch_cross: '#fb923c',
    macd_zero_cross: '#34d399', multi_factor: '#00FFB2', custom: '#f472b6',
  };
  return (
    <div className="p-4 grid grid-cols-1 gap-3 overflow-y-auto max-h-full">
      {strategies.map(s => {
        const color = TYPE_COLORS[s.type] ?? '#8e9192';
        const isOpen = expanded === s.id;
        return (
          <div key={s.id} className="border border-white/10 rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="flex items-start gap-3 p-4 cursor-pointer" onClick={() => setExpanded(isOpen ? null : s.id)}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white font-mono">{s.name}</span>
                  {s.builtin && <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ color, borderColor: `${color}55`, background: `${color}15` }}>BUILTIN</span>}
                  {!s.builtin && <span className="text-[10px] px-2 py-0.5 rounded-full border border-pink-500/40 text-pink-400 bg-pink-500/10">CUSTOM</span>}
                </div>
                <p className="text-xs text-[#8e9192] mt-1 line-clamp-1">{s.description}</p>
                <div className="flex gap-1 flex-wrap mt-2">
                  {s.tags.slice(0, 4).map(t => (
                    <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-[#8e9192]">{t}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  className="text-xs px-3 py-1.5 rounded-lg border border-[#00FFB2]/40 text-[#00FFB2] hover:bg-[#00FFB2]/10 transition-colors"
                  onClick={e => { e.stopPropagation(); onBacktest(s); }}
                >
                  Backtest
                </button>
                {isOpen ? <ChevronUp size={14} className="text-[#8e9192]" /> : <ChevronDown size={14} className="text-[#8e9192]" />}
              </div>
            </div>
            {isOpen && (
              <div className="px-4 pb-4 border-t border-white/5">
                <p className="text-xs text-[#8e9192] mt-3 leading-relaxed">{s.description}</p>
                <div className="mt-3 p-3 rounded-lg bg-black/20 font-mono text-xs text-[#adc9eb]">
                  <div className="text-[10px] text-[#8e9192] mb-1">PARAMETERS</div>
                  <pre className="whitespace-pre-wrap text-[11px]">{JSON.stringify(s.params, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Backtest Tab ─────────────────────────────────────────────────────────────
function BacktestTab({ strategies, preselected }: { strategies: StrategyDef[]; preselected?: string }) {
  const [strategyId, setStrategyId] = useState(preselected ?? strategies[0]?.id ?? '');
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [limit, setLimit] = useState(500);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState('');

  const run = async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/strategy/backtest', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId, symbol, timeframe, limit }),
      });
      if (r.status === 402) {
        const d = await r.json().catch(() => ({}));
        if (d?.requiresUpgrade) window.dispatchEvent(new CustomEvent('nexus:paywall', { detail: d }));
        setError(d?.message || 'Plan upgrade required');
        return;
      }
      const data = await r.json() as { result?: BacktestResult; error?: string };
      if (data.error) { setError(data.error); return; }
      setResult(data.result ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const pnlColor = result && result.totalPnlPct >= 0 ? '#00FFB2' : '#FF4D6D';

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto max-h-full">
      {/* Form */}
      <div className="border border-white/10 rounded-xl p-4 bg-white/[0.03] space-y-3">
        <div className="text-xs text-[#8e9192] font-semibold tracking-widest">BACKTEST CONFIGURATION</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-[#8e9192] tracking-wider">STRATEGY</label>
            <select value={strategyId} onChange={e => setStrategyId(e.target.value)} className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono">
              {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-[#8e9192] tracking-wider">SYMBOL</label>
            <select value={symbol} onChange={e => setSymbol(e.target.value)} className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono">
              {['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT','XRP/USDT','DOGE/USDT'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-[#8e9192] tracking-wider">TIMEFRAME</label>
            <select value={timeframe} onChange={e => setTimeframe(e.target.value)} className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono">
              {['5m','15m','30m','1h','4h','1d'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-[#8e9192] tracking-wider">CANDLES</label>
            <select value={limit} onChange={e => setLimit(Number(e.target.value))} className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono">
              {[100,200,500,1000].map(n => <option key={n} value={n}>{n} candles</option>)}
            </select>
          </div>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="w-full py-2.5 rounded-xl text-sm font-semibold font-mono tracking-wider transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: '#00FFB2', color: '#0b1326' }}
        >
          <Play size={14} />
          {loading ? 'RUNNING BACKTEST…' : 'RUN BACKTEST'}
        </button>
        {error && <div className="text-xs text-red-400 p-2 bg-red-500/10 rounded-lg">{error}</div>}
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Total Return', val: `${result.totalPnlPct >= 0 ? '+' : ''}${result.totalPnlPct.toFixed(2)}%`, color: pnlColor },
              { label: 'Win Rate', val: `${(result.winRate * 100).toFixed(1)}%`, color: result.winRate >= 0.5 ? '#00FFB2' : '#FF4D6D' },
              { label: 'Max Drawdown', val: `-${result.maxDrawdownPct.toFixed(2)}%`, color: result.maxDrawdownPct > 20 ? '#FF4D6D' : '#f59e0b' },
              { label: 'Sharpe Ratio', val: result.sharpeRatio.toFixed(2), color: result.sharpeRatio >= 1 ? '#00FFB2' : '#f59e0b' },
              { label: 'Profit Factor', val: result.profitFactor.toFixed(2), color: result.profitFactor >= 1 ? '#00FFB2' : '#FF4D6D' },
              { label: 'Total Trades', val: String(result.totalTrades), color: '#dae2fd' },
              { label: 'Avg Win', val: `+${result.avgWinPct.toFixed(2)}%`, color: '#00FFB2' },
              { label: 'Avg Loss', val: `-${result.avgLossPct.toFixed(2)}%`, color: '#FF4D6D' },
              { label: 'Expectancy', val: `${result.expectancy >= 0 ? '+' : ''}${result.expectancy.toFixed(2)}%`, color: result.expectancy >= 0 ? '#00FFB2' : '#FF4D6D' },
            ].map(m => (
              <div key={m.label} className="border border-white/8 rounded-xl p-3 bg-white/[0.02]">
                <div className="text-[9px] text-[#8e9192] tracking-wider mb-1">{m.label.toUpperCase()}</div>
                <div className="text-lg font-bold font-mono" style={{ color: m.color }}>{m.val}</div>
              </div>
            ))}
          </div>

          {/* Equity Curve */}
          <div className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.02]">
            <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
              <span className="text-[10px] text-[#8e9192] tracking-wider">EQUITY CURVE</span>
              <span className="text-[10px] font-mono" style={{ color: pnlColor }}>
                {result.symbol} {result.timeframe} · {result.totalCandles} candles
              </span>
            </div>
            <div className="px-2 py-2">
              <EquityCurve data={result.equityCurve} />
            </div>
            <div className="px-4 py-2 border-t border-white/5 flex gap-6 text-[10px] text-[#8e9192]">
              <span>W:{result.winCount} <span className="text-[#00FFB2]">▲</span></span>
              <span>L:{result.lossCount} <span className="text-[#FF4D6D]">▼</span></span>
              <span>Sortino: {result.sortinoRatio.toFixed(2)}</span>
              <span>Max Consec. Losses: {result.maxConsecLosses}</span>
            </div>
          </div>

          {/* Trades */}
          <div className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.02]">
            <div className="px-4 py-2 border-b border-white/5">
              <span className="text-[10px] text-[#8e9192] tracking-wider">LAST TRADES</span>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {result.trades.slice(-20).reverse().map((t, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2 border-b border-white/[0.04] text-xs font-mono">
                  <span className={t.direction === 'LONG' ? 'text-[#00FFB2]' : 'text-[#FF4D6D]'}>{t.direction}</span>
                  <span className="text-[#8e9192]">{t.exitReason}</span>
                  <span className="flex-1 text-[#8e9192]">{t.holdBars}b</span>
                  <span style={{ color: t.pnlPct >= 0 ? '#00FFB2' : '#FF4D6D' }}>
                    {t.pnlPct >= 0 ? '+' : ''}{t.pnlPct.toFixed(2)}%
                  </span>
                  {t.pnlPct >= 0 ? <CheckCircle2 size={12} className="text-[#00FFB2]" /> : <XCircle size={12} className="text-[#FF4D6D]" />}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sentiment Tab ────────────────────────────────────────────────────────────
function NewsTab() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ items: SentimentItem[]; overall: { score: number; mood: string }; generatedAt: string } | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/news/sentiment');
      setData(await r.json());
    } finally {
      setLoading(false);
    }
  };

  const moodColor = (m: string) => m === 'BULLISH' ? '#00FFB2' : m === 'BEARISH' ? '#FF4D6D' : '#f59e0b';

  return (
    <div className="p-4 space-y-4 overflow-y-auto max-h-full">
      <div className="flex items-center justify-between">
        <div className="text-xs text-[#8e9192]">Claude-powered piyasa duygu analizi</div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-mono transition-all disabled:opacity-50"
          style={{ borderColor: '#00FFB255', color: '#00FFB2', background: '#00FFB210' }}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? 'ANALİZ EDİLİYOR…' : 'DUYGU ANALİZİ YAP'}
        </button>
      </div>

      {data && (
        <>
          {/* Overall */}
          <div className="border rounded-xl p-4 flex items-center gap-4" style={{ borderColor: `${moodColor(data.overall.mood)}44`, background: `${moodColor(data.overall.mood)}10` }}>
            <div className="text-3xl font-bold font-mono" style={{ color: moodColor(data.overall.mood) }}>
              {data.overall.score > 0 ? '+' : ''}{data.overall.score}
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: moodColor(data.overall.mood) }}>{data.overall.mood}</div>
              <div className="text-xs text-[#8e9192]">Market Duygu Skoru · {new Date(data.generatedAt).toLocaleTimeString()}</div>
            </div>
          </div>

          {/* Per-coin */}
          {data.items.map(item => (
            <div key={item.symbol} className="border border-white/10 rounded-xl p-4 bg-white/[0.03] space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold font-mono text-white">{item.symbol.replace('/USDT', '')}</span>
                  <span className="text-xs font-mono text-[#8e9192]">${item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className={`text-xs ${item.change24h >= 0 ? 'text-[#00FFB2]' : 'text-[#FF4D6D]'}`}>
                    {item.change24h >= 0 ? '+' : ''}{item.change24h.toFixed(2)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-bold font-mono" style={{ color: moodColor(item.sentiment) }}>
                    {item.score > 0 ? '+' : ''}{item.score}
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: `${moodColor(item.sentiment)}18`, color: moodColor(item.sentiment) }}>
                    {item.sentiment}
                  </span>
                </div>
              </div>
              <p className="text-xs font-semibold text-[#dae2fd]">{item.headline}</p>
              <p className="text-xs text-[#8e9192] leading-relaxed">{item.analysis}</p>
              <div className="flex gap-3 text-[10px] text-[#8e9192] pt-1">
                <span>RSI: {item.signals.rsi?.toFixed(1) ?? '—'}</span>
                <span>MACD: {item.signals.macdBias}</span>
                <span>BB: {item.signals.bbPosition}</span>
                <span>Vol: {item.signals.volatility}</span>
              </div>
            </div>
          ))}
        </>
      )}

      {!data && !loading && (
        <div className="flex flex-col items-center gap-3 pt-12 text-center">
          <Newspaper size={32} className="text-[#8e9192]" />
          <p className="text-sm text-[#8e9192]">Duygu analizi için butona tıkla</p>
          <p className="text-xs text-[#8e9192]">Claude piyasa verilerini anlık analiz eder</p>
        </div>
      )}
    </div>
  );
}

// ─── Vibe Agent Tab ───────────────────────────────────────────────────────────
function VibeAgentTab({ onSave }: { onSave: () => void }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string; strategy?: object }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [savedStrategy, setSavedStrategy] = useState<StrategyDef | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    const newMessages = [...messages, { role: 'user' as const, content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const r = await fetch('/api/strategy/vibe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          history: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      if (r.status === 402) {
        const d = await r.json().catch(() => ({}));
        if (d?.requiresUpgrade) window.dispatchEvent(new CustomEvent('nexus:paywall', { detail: d }));
        setMessages([...newMessages, { role: 'assistant', content: '⚠ ' + (d?.message || 'Plan upgrade required') }]);
        return;
      }
      const data = await r.json() as { reply: string; strategy?: StrategyDef; ready: boolean };
      setMessages([...newMessages, { role: 'assistant', content: data.reply, strategy: data.strategy ?? undefined }]);
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const saveStrategy = async (strategy: StrategyDef) => {
    const r = await fetch('/api/strategy', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(strategy),
    });
    if (r.status === 402) {
      const d = await r.json().catch(() => ({}));
      if (d?.requiresUpgrade) window.dispatchEvent(new CustomEvent('nexus:paywall', { detail: d }));
      return;
    }
    setSavedStrategy(strategy);
    onSave();
  };

  const PROMPTS = [
    '200 EMA üzerindeyken RSI 30 altına düşünce al, 70 üzerinde sat',
    'BB squeeze patlarken MACD onaylayınca trend yönünde gir',
    '20 periyot en yükseği kırdığında al, ATR bazlı stop koy',
    'Stochastic K, D\'yi aşağı kestiğinde ve RSI > 70 ise sat',
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Prompts */}
      {messages.length === 0 && (
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-[#00FFB2]" />
            <span className="text-sm text-white font-semibold">Vibe Strategy Agent</span>
          </div>
          <p className="text-xs text-[#8e9192]">İngilizce veya Türkçe stratejini açıkla, Claude yapılandırılmış parametrelere dönüştürsün.</p>
          <div className="grid grid-cols-1 gap-2">
            {PROMPTS.map(p => (
              <button key={p} onClick={() => setInput(p)} className="text-left text-xs p-3 rounded-xl border border-white/10 text-[#8e9192] hover:border-[#00FFB2]/40 hover:text-[#00FFB2] transition-all bg-white/[0.02]">
                "{p}"
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3 min-h-0">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${m.role === 'user' ? 'bg-[#00FFB2]/15 text-[#dae2fd] border border-[#00FFB2]/20' : 'bg-white/[0.05] text-[#dae2fd] border border-white/10'}`}>
              <pre className="whitespace-pre-wrap font-mono text-xs">{m.content}</pre>
              {m.strategy && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <button
                    onClick={() => saveStrategy(m.strategy as StrategyDef)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                    style={{ background: '#00FFB2', color: '#0b1326' }}
                  >
                    <Save size={12} /> Stratejiyi Kaydet
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#00FFB2] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        {savedStrategy && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[#00FFB2]/10 border border-[#00FFB2]/30 text-xs text-[#00FFB2]">
            <CheckCircle2 size={14} /> <span>"{savedStrategy.name}" kütüphaneye eklendi!</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/8">
        <div className="flex gap-2">
          <input
            className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8e9192] focus:outline-none focus:border-[#00FFB2]/40 font-mono"
            placeholder="Strateji fikrini yaz… (Türkçe veya İngilizce)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="px-4 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-40"
            style={{ background: '#00FFB2', color: '#0b1326' }}
          >
            <Zap size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Swarm Tab ────────────────────────────────────────────────────────────────
function SwarmTab() {
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SwarmResult | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/strategy/swarm?symbol=${encodeURIComponent(symbol)}`);
      setResult(await r.json());
    } finally {
      setLoading(false);
    }
  };

  const AGENTS = [
    { id: 'mirofish', color: '#adc9eb', icon: '🐡', specialty: 'BB Squeeze Breakout' },
    { id: 'betafish', color: '#00FFB2', icon: '🐟', specialty: 'RSI Mean Reversion' },
    { id: 'onyx', color: '#a78bfa', icon: '⬛', specialty: 'EMA Cross Trend' },
    { id: 'openclaw', color: '#f59e0b', icon: '⚡', specialty: 'Donchian Breakout' },
  ];

  const dirColor = (d: string) => d === 'LONG' ? '#00FFB2' : d === 'SHORT' ? '#FF4D6D' : '#8e9192';

  return (
    <div className="p-4 space-y-4 overflow-y-auto max-h-full">
      <div className="flex items-center gap-3">
        <select value={symbol} onChange={e => setSymbol(e.target.value)} className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono">
          {['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT'].map(s => <option key={s}>{s}</option>)}
        </select>
        <button
          onClick={run}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold font-mono transition-opacity disabled:opacity-50"
          style={{ background: '#00FFB2', color: '#0b1326' }}
        >
          <Network size={14} className={loading ? 'animate-pulse' : ''} />
          {loading ? 'ÇALIŞIYOR…' : 'SWARM ÇALIŞTIR'}
        </button>
      </div>

      {/* Agent description */}
      <div className="text-xs text-[#8e9192] p-3 rounded-xl bg-white/[0.02] border border-white/5">
        <strong className="text-white">Sürü Sistemi:</strong> 4 uzman ajan aynı anda farklı stratejilerle {symbol} analiz eder.
        Çoğunluk oyu konsensus yön belirler. Freqtrade + Hummingbot + Donchian + TTM Squeeze karması.
      </div>

      {/* Agent cards */}
      <div className="grid grid-cols-2 gap-3">
        {AGENTS.map(a => {
          const agentResult = result?.agents.find(ag => ag.agent === a.id);
          return (
            <div key={a.id} className="border border-white/10 rounded-xl p-4 bg-white/[0.03]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{a.icon}</span>
                <div>
                  <div className="text-xs font-semibold text-white uppercase tracking-wider">{a.id}</div>
                  <div className="text-[9px] text-[#8e9192]">{a.specialty}</div>
                </div>
              </div>
              {agentResult ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold font-mono" style={{ color: dirColor(agentResult.direction) }}>{agentResult.direction}</span>
                    <span className="text-xs text-[#8e9192]">{agentResult.confidence.toFixed(0)}%</span>
                  </div>
                  <p className="text-[10px] text-[#8e9192] mt-1 leading-relaxed line-clamp-2">{agentResult.reason}</p>
                  {agentResult.direction !== 'NEUTRAL' && (
                    <div className="flex gap-2 mt-2 text-[9px] font-mono">
                      <span className="text-[#FF4D6D]">SL ${agentResult.stopLoss?.toFixed(0)}</span>
                      <span className="text-[#00FFB2]">TP ${agentResult.takeProfit?.toFixed(0)}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-[#8e9192] mt-2">—</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Consensus */}
      {result && (
        <div className="border rounded-xl p-4" style={{ borderColor: `${dirColor(result.consensus.direction)}55`, background: `${dirColor(result.consensus.direction)}0a` }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[#8e9192] tracking-wider">SWARM KONSENSUS</span>
            <span className="text-[10px] text-[#8e9192]">{new Date(result.timestamp).toLocaleTimeString()}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-2xl font-bold font-mono" style={{ color: dirColor(result.consensus.direction) }}>
              {result.consensus.direction}
            </span>
            <div className="text-xs text-[#8e9192]">
              <div>Güven: <span className="text-white">{result.consensus.confidence}%</span></div>
              <div>Oylar: <span className="text-[#00FFB2]">↑{result.consensus.longVotes}</span> <span className="text-[#FF4D6D]">↓{result.consensus.shortVotes}</span></div>
            </div>
          </div>
          <div className="mt-2 text-xs text-[#8e9192]">Fiyat: <span className="text-white font-mono">${result.price.toLocaleString()}</span></div>
        </div>
      )}
    </div>
  );
}

// ─── Main StrategyPanel ───────────────────────────────────────────────────────
export default function StrategyPanel() {
  const [tab, setTab] = useState<TabId>('library');
  const [strategies, setStrategies] = useState<StrategyDef[]>([]);
  const [backtestTarget, setBacktestTarget] = useState<string | undefined>();

  const loadStrategies = useCallback(async () => {
    try {
      const r = await fetch('/api/strategy');
      const d = await r.json() as { strategies: StrategyDef[] };
      setStrategies(d.strategies ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadStrategies(); }, [loadStrategies]);

  const handleBacktest = (s: StrategyDef) => {
    setBacktestTarget(s.id);
    setTab('backtest');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Inner tab bar */}
      <div className="flex items-center gap-0 px-4 pt-4 pb-0 border-b border-white/8 shrink-0 overflow-x-auto no-scrollbar">
        {INNER_TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold font-mono tracking-wider border-b-2 transition-all whitespace-nowrap ${active ? 'border-[#00FFB2] text-[#00FFB2]' : 'border-transparent text-[#8e9192] hover:text-white'}`}
            >
              <Icon size={12} />
              {label.toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {tab === 'library' && <LibraryTab strategies={strategies} onBacktest={handleBacktest} />}
        {tab === 'backtest' && <BacktestTab strategies={strategies} preselected={backtestTarget} />}
        {tab === 'news' && <NewsTab />}
        {tab === 'vibe' && <VibeAgentTab onSave={loadStrategies} />}
        {tab === 'swarm' && <SwarmTab />}
      </div>
    </div>
  );
}
