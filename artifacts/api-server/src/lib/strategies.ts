import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Candle } from "./exchange";
import {
  ema,
  rsi,
  macd,
  atr,
  bollinger,
  stochastic,
  vwap,
  bbSqueeze,
  donchian,
  adx,
} from "./indicators";

const DATA_FILE = join(process.cwd(), "data", "strategies.json");

export type StrategyType =
  | "ema_cross"
  | "rsi_reversal"
  | "bb_squeeze"
  | "breakout"
  | "vwap_bounce"
  | "stoch_cross"
  | "macd_zero_cross"
  | "multi_factor"
  | "custom";

export interface StrategyParams {
  stoploss: number;
  roi: number;
  trailingStop?: number;
  emaCross?: { fast: number; slow: number };
  rsiReversal?: { oversold: number; overbought: number; period: number };
  bbSqueeze?: { period: number; mult: number };
  breakout?: { period: number };
  vwapBounce?: { deviationPct: number };
  stochCross?: { kPeriod: number; dPeriod: number; oversold: number; overbought: number };
  macdZeroCross?: { fast: number; slow: number; signal: number };
  [key: string]: unknown;
}

export interface StrategyDef {
  id: string;
  name: string;
  type: StrategyType;
  description: string;
  tags: string[];
  params: StrategyParams;
  naturalLanguage?: string;
  createdAt: number;
  builtin: boolean;
}

export type SignalDir = "LONG" | "SHORT" | "NEUTRAL";

export interface StrategySignal {
  direction: SignalDir;
  confidence: number;
  reason: string;
  entry: number;
  stopLoss: number;
  takeProfit: number;
}

const BUILTINS: StrategyDef[] = [
  {
    id: "ema_cross_12_26",
    name: "EMA Cross 12/26",
    type: "ema_cross",
    description: "Classic trend following: LONG when EMA12 > EMA26. Exit on reverse cross. Works best in trending markets. Freqtrade-compatible logic.",
    tags: ["trend", "ema", "classic", "freqtrade"],
    params: { stoploss: 0.02, roi: 0.04, emaCross: { fast: 12, slow: 26 } },
    createdAt: 0,
    builtin: true,
  },
  {
    id: "rsi_mean_reversion",
    name: "RSI Mean Reversion",
    type: "rsi_reversal",
    description: "Counter-trend: Buy RSI < 30 (oversold), sell RSI > 70 (overbought). Low drawdown in ranging markets. Hummingbot AROON-style.",
    tags: ["mean-reversion", "rsi", "oscillator", "hummingbot"],
    params: { stoploss: 0.03, roi: 0.05, rsiReversal: { oversold: 30, overbought: 70, period: 14 } },
    createdAt: 0,
    builtin: true,
  },
  {
    id: "bb_squeeze_breakout",
    name: "BB Squeeze Breakout",
    type: "bb_squeeze",
    description: "John Carter TTM Squeeze: detect volatility coiling (BB inside Keltner), trade the explosive breakout when BB expands. High R:R setups.",
    tags: ["breakout", "volatility", "bollinger", "squeeze", "ttm"],
    params: { stoploss: 0.025, roi: 0.06, bbSqueeze: { period: 20, mult: 2 } },
    createdAt: 0,
    builtin: true,
  },
  {
    id: "donchian_breakout_20",
    name: "Donchian Breakout (Turtle)",
    type: "breakout",
    description: "Turtle Traders classic: Long on 20-period high break, short on 20-period low break. Trend-following with disciplined stops.",
    tags: ["breakout", "donchian", "turtle", "trend", "freqtrade"],
    params: { stoploss: 0.03, roi: 0.08, breakout: { period: 20 } },
    createdAt: 0,
    builtin: true,
  },
  {
    id: "vwap_bounce",
    name: "VWAP Bounce",
    type: "vwap_bounce",
    description: "Intraday mean reversion: trade bounces off VWAP. Long when price dips below VWAP and reclaims it; short vice versa.",
    tags: ["vwap", "intraday", "mean-reversion"],
    params: { stoploss: 0.015, roi: 0.03, vwapBounce: { deviationPct: 0.5 } },
    createdAt: 0,
    builtin: true,
  },
  {
    id: "stoch_cross_14_3",
    name: "Stochastic Cross",
    type: "stoch_cross",
    description: "K crosses above D in oversold zone (< 20) = Buy. K crosses below D in overbought zone (> 80) = Sell. Classic momentum reversal.",
    tags: ["stochastic", "oscillator", "crossover", "momentum"],
    params: { stoploss: 0.02, roi: 0.04, stochCross: { kPeriod: 14, dPeriod: 3, oversold: 20, overbought: 80 } },
    createdAt: 0,
    builtin: true,
  },
  {
    id: "macd_zero_cross",
    name: "MACD Zero Cross",
    type: "macd_zero_cross",
    description: "Momentum strategy: trade when MACD histogram crosses zero. Bullish zero cross = Long, bearish zero cross = Short.",
    tags: ["macd", "trend", "momentum", "zero-cross"],
    params: { stoploss: 0.025, roi: 0.05, macdZeroCross: { fast: 12, slow: 26, signal: 9 } },
    createdAt: 0,
    builtin: true,
  },
  {
    id: "nexus_multi_factor",
    name: "Nexus Multi-Factor",
    type: "multi_factor",
    description: "Proprietary: EMA trend + RSI momentum + MACD confirmation + BB position + orderbook imbalance. Grade A–D system. QuantConnect-inspired ensemble.",
    tags: ["multi-factor", "proprietary", "nexus", "ensemble", "quantconnect"],
    params: { stoploss: 0.02, roi: 0.04 },
    createdAt: 0,
    builtin: true,
  },
];

function loadCustomStrategies(): StrategyDef[] {
  try {
    if (!existsSync(DATA_FILE)) return [];
    const raw = readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw) as StrategyDef[];
  } catch {
    return [];
  }
}

function saveCustomStrategies(strategies: StrategyDef[]): void {
  writeFileSync(DATA_FILE, JSON.stringify(strategies, null, 2), "utf-8");
}

export function getAllStrategies(): StrategyDef[] {
  return [...BUILTINS, ...loadCustomStrategies()];
}

export function getStrategy(id: string): StrategyDef | undefined {
  return getAllStrategies().find((s) => s.id === id);
}

export function createStrategy(def: Omit<StrategyDef, "createdAt" | "builtin">): StrategyDef {
  const custom = loadCustomStrategies();
  const existing = custom.findIndex((s) => s.id === def.id);
  const strategy: StrategyDef = { ...def, createdAt: Date.now(), builtin: false };
  if (existing >= 0) custom[existing] = strategy;
  else custom.push(strategy);
  saveCustomStrategies(custom);
  return strategy;
}

export function deleteStrategy(id: string): boolean {
  const custom = loadCustomStrategies();
  const idx = custom.findIndex((s) => s.id === id);
  if (idx < 0) return false;
  custom.splice(idx, 1);
  saveCustomStrategies(custom);
  return true;
}

// ─── Strategy Evaluator ──────────────────────────────────────────────────────
export function evaluateStrategy(
  strategy: StrategyDef,
  candles: Candle[],
): StrategySignal {
  const closes = candles.map((c) => c.close);
  const currentPrice = closes[closes.length - 1] ?? 0;
  const params = strategy.params;

  let direction: SignalDir = "NEUTRAL";
  let confidence = 50;
  let reason = "No clear signal";

  switch (strategy.type) {
    case "ema_cross": {
      const p = params.emaCross ?? { fast: 12, slow: 26 };
      const f = ema(closes, p.fast);
      const sl = ema(closes, p.slow);
      if (f && sl) {
        if (f > sl) { direction = "LONG"; confidence = 65; reason = `EMA${p.fast}(${f.toFixed(2)}) > EMA${p.slow}(${sl.toFixed(2)}) — bullish cross`; }
        else { direction = "SHORT"; confidence = 65; reason = `EMA${p.fast}(${f.toFixed(2)}) < EMA${p.slow}(${sl.toFixed(2)}) — bearish cross`; }
      }
      break;
    }
    case "rsi_reversal": {
      const p = params.rsiReversal ?? { oversold: 30, overbought: 70, period: 14 };
      const r = rsi(closes, p.period);
      if (r !== null) {
        if (r < p.oversold) { direction = "LONG"; confidence = Math.min(90, 65 + (p.oversold - r) * 2); reason = `RSI(${r.toFixed(1)}) < ${p.oversold} oversold — reversal buy`; }
        else if (r > p.overbought) { direction = "SHORT"; confidence = Math.min(90, 65 + (r - p.overbought) * 2); reason = `RSI(${r.toFixed(1)}) > ${p.overbought} overbought — reversal sell`; }
      }
      break;
    }
    case "bb_squeeze": {
      const p = params.bbSqueeze ?? { period: 20, mult: 2 };
      const sq = bbSqueeze(candles, p.period, p.mult, 1.5);
      if (sq) {
        if (!sq.squeeze && sq.momentum > 0) { direction = "LONG"; confidence = 75; reason = `BB Squeeze released ↑ momentum ${sq.momentum.toFixed(2)} — breakout long`; }
        else if (!sq.squeeze && sq.momentum < 0) { direction = "SHORT"; confidence = 75; reason = `BB Squeeze released ↓ momentum ${sq.momentum.toFixed(2)} — breakout short`; }
        else { reason = `BB Squeeze active (width ${(sq.bbWidth * 100).toFixed(2)}%) — coiling, await breakout`; }
      }
      break;
    }
    case "breakout": {
      const p = params.breakout ?? { period: 20 };
      const don = donchian(candles.slice(0, -1), p.period);
      if (don) {
        if (currentPrice > don.high) { direction = "LONG"; confidence = 70; reason = `Price broke ${p.period}-period high (${don.high.toFixed(2)}) — Donchian breakout`; }
        else if (currentPrice < don.low) { direction = "SHORT"; confidence = 70; reason = `Price broke ${p.period}-period low (${don.low.toFixed(2)}) — Donchian breakdown`; }
      }
      break;
    }
    case "vwap_bounce": {
      const p = params.vwapBounce ?? { deviationPct: 0.5 };
      const v = vwap(candles);
      if (v) {
        const dev = ((currentPrice - v) / v) * 100;
        const prev = closes[closes.length - 2] ?? 0;
        const prevDev = prev ? ((prev - v) / v) * 100 : dev;
        if (prevDev < 0 && dev >= 0) { direction = "LONG"; confidence = 68; reason = `Price reclaimed VWAP (${v.toFixed(2)}) from below — bounce long`; }
        else if (prevDev > 0 && dev <= 0) { direction = "SHORT"; confidence = 68; reason = `Price dropped below VWAP (${v.toFixed(2)}) — bounce short`; }
        else if (Math.abs(dev) < p.deviationPct) { reason = `Near VWAP (${dev.toFixed(2)}% deviation) — watching for cross`; }
      }
      break;
    }
    case "stoch_cross": {
      const p = params.stochCross ?? { kPeriod: 14, dPeriod: 3, oversold: 20, overbought: 80 };
      const cur = stochastic(candles, p.kPeriod, p.dPeriod);
      const prev = stochastic(candles.slice(0, -1), p.kPeriod, p.dPeriod);
      if (cur && prev) {
        const kCrossUp = prev.k < prev.d && cur.k > cur.d;
        const kCrossDown = prev.k > prev.d && cur.k < cur.d;
        if (kCrossUp && cur.k < p.oversold + 30) { direction = "LONG"; confidence = 72; reason = `Stoch K(${cur.k.toFixed(1)}) crossed above D(${cur.d.toFixed(1)}) in oversold zone`; }
        else if (kCrossDown && cur.k > p.overbought - 30) { direction = "SHORT"; confidence = 72; reason = `Stoch K(${cur.k.toFixed(1)}) crossed below D(${cur.d.toFixed(1)}) in overbought zone`; }
      }
      break;
    }
    case "macd_zero_cross": {
      const p = params.macdZeroCross ?? { fast: 12, slow: 26, signal: 9 };
      const cur = macd(closes, p.fast, p.slow, p.signal);
      const prev = macd(closes.slice(0, -1), p.fast, p.slow, p.signal);
      if (cur && prev) {
        if (prev.hist < 0 && cur.hist > 0) { direction = "LONG"; confidence = 68; reason = `MACD histogram crossed zero bullish (${cur.hist.toFixed(5)})`; }
        else if (prev.hist > 0 && cur.hist < 0) { direction = "SHORT"; confidence = 68; reason = `MACD histogram crossed zero bearish (${cur.hist.toFixed(5)})`; }
      }
      break;
    }
    case "multi_factor": {
      // Simplified multi-factor (mirrors signal engine logic)
      const e20 = ema(closes, 20);
      const e50 = ema(closes, 50);
      const r = rsi(closes, 14);
      const m = macd(closes, 12, 26, 9);
      let bull = 0, bear = 0;
      if (e20 && e50) { if (currentPrice > e20 && e20 > e50) bull++; else if (currentPrice < e20 && e20 < e50) bear++; }
      if (r !== null) { if (r > 55) bull++; else if (r < 45) bear++; }
      if (m) { if (m.hist > 0) bull++; else if (m.hist < 0) bear++; }
      const confluence = Math.max(bull, bear);
      if (bull > bear && bull >= 2) { direction = "LONG"; confidence = 50 + bull * 9; reason = `Multi-factor LONG: ${bull}/3 bull signals (RSI:${r?.toFixed(0)}, EMA trend, MACD)`; }
      else if (bear > bull && bear >= 2) { direction = "SHORT"; confidence = 50 + bear * 9; reason = `Multi-factor SHORT: ${bear}/3 bear signals (RSI:${r?.toFixed(0)}, EMA trend, MACD)`; }
      else { reason = `Confluence insufficient (${confluence}/3) — no trade`; }
      break;
    }
  }

  confidence = Math.min(95, Math.max(40, confidence));
  const atVal = atr(candles, 14) ?? currentPrice * 0.02;
  const sl = direction === "LONG" ? currentPrice - 1.5 * atVal : currentPrice + 1.5 * atVal;
  const tp = direction === "LONG" ? currentPrice + 2.5 * atVal : currentPrice - 2.5 * atVal;
  return { direction, confidence, reason, entry: currentPrice, stopLoss: sl, takeProfit: tp };
}
