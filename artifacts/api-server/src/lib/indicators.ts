import type { Candle } from "./exchange";

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i] ?? 0;
  return sum / period;
}

export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  const seed = sma(values.slice(0, period), period);
  if (seed === null) return null;
  let e = seed;
  for (let i = period; i < values.length; i++) e = ((values[i] ?? 0) - e) * k + e;
  return e;
}

export function emaSeries(values: number[], period: number): number[] {
  const out: number[] = [];
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i] ?? 0;
  seed /= period;
  out.push(seed);
  for (let i = period; i < values.length; i++) {
    const prev = out[out.length - 1] ?? 0;
    out.push(((values[i] ?? 0) - prev) * k + prev);
  }
  return out;
}

export function rsi(values: number[], period: number = 14): number | null {
  if (values.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = (values[i] ?? 0) - (values[i - 1] ?? 0);
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgG = gain / period;
  let avgL = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = (values[i] ?? 0) - (values[i - 1] ?? 0);
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
  }
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

export interface MacdResult {
  macd: number;
  signal: number;
  hist: number;
}

export function macd(values: number[], fast = 12, slow = 26, signalP = 9): MacdResult | null {
  if (values.length < slow + signalP) return null;
  const fastSer = emaSeries(values, fast);
  const slowSer = emaSeries(values, slow);
  const offset = slow - fast;
  const macdSer: number[] = [];
  for (let i = 0; i < slowSer.length; i++) {
    const f = fastSer[i + offset];
    const s = slowSer[i];
    if (f === undefined || s === undefined) continue;
    macdSer.push(f - s);
  }
  if (macdSer.length < signalP) return null;
  const sigSer = emaSeries(macdSer, signalP);
  const m = macdSer[macdSer.length - 1] ?? 0;
  const s = sigSer[sigSer.length - 1] ?? 0;
  return { macd: m, signal: s, hist: m - s };
}

export function atr(candles: Candle[], period: number = 14): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    if (!c || !prev) continue;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
    trs.push(tr);
  }
  return sma(trs.slice(-period), period);
}

// ─── Bollinger Bands ────────────────────────────────────────────────────────
export interface BollingerResult {
  upper: number;
  middle: number;
  lower: number;
  width: number;
  pct: number;
}

export function bollinger(
  values: number[],
  period = 20,
  mult = 2,
): BollingerResult | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((acc, v) => acc + (v - mid) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  const upper = mid + mult * std;
  const lower = mid - mult * std;
  const width = mid > 0 ? (upper - lower) / mid : 0;
  const last = values[values.length - 1] ?? 0;
  const pct = upper !== lower ? (last - lower) / (upper - lower) : 0.5;
  return { upper, middle: mid, lower, width, pct };
}

// ─── Stochastic Oscillator ──────────────────────────────────────────────────
export interface StochasticResult {
  k: number;
  d: number;
}

export function stochastic(
  candles: Candle[],
  kPeriod = 14,
  dPeriod = 3,
): StochasticResult | null {
  if (candles.length < kPeriod + dPeriod) return null;
  const kVals: number[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const slice = candles.slice(i - kPeriod + 1, i + 1);
    const highMax = Math.max(...slice.map((c) => c.high));
    const lowMin = Math.min(...slice.map((c) => c.low));
    const close = candles[i]?.close ?? 0;
    const k = highMax === lowMin ? 50 : ((close - lowMin) / (highMax - lowMin)) * 100;
    kVals.push(k);
  }
  const k = kVals[kVals.length - 1] ?? 50;
  const dSlice = kVals.slice(-dPeriod);
  const d = dSlice.reduce((a, v) => a + v, 0) / dSlice.length;
  return { k, d };
}

// ─── VWAP (Volume Weighted Average Price) ───────────────────────────────────
export function vwap(candles: Candle[]): number | null {
  if (candles.length === 0) return null;
  let cumPV = 0;
  let cumV = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    cumPV += typical * c.volume;
    cumV += c.volume;
  }
  return cumV > 0 ? cumPV / cumV : null;
}

// ─── Williams %R ─────────────────────────────────────────────────────────────
export function williamsR(candles: Candle[], period = 14): number | null {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  const highMax = Math.max(...slice.map((c) => c.high));
  const lowMin = Math.min(...slice.map((c) => c.low));
  const close = candles[candles.length - 1]?.close ?? 0;
  return highMax === lowMin ? -50 : ((highMax - close) / (highMax - lowMin)) * -100;
}

// ─── ADX (Average Directional Index) ────────────────────────────────────────
export function adx(candles: Candle[], period = 14): number | null {
  if (candles.length < period * 2) return null;
  const dxVals: number[] = [];
  let sPDM = 0, sNDM = 0, sTR = 0;

  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i]!;
    const prev = candles[i - 1]!;
    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    const pDM = upMove > downMove && upMove > 0 ? upMove : 0;
    const nDM = downMove > upMove && downMove > 0 ? downMove : 0;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close),
    );

    if (i <= period) {
      sPDM += pDM;
      sNDM += nDM;
      sTR += tr;
    } else {
      sPDM = sPDM - sPDM / period + pDM;
      sNDM = sNDM - sNDM / period + nDM;
      sTR = sTR - sTR / period + tr;
      if (sTR === 0) continue;
      const pDI = (sPDM / sTR) * 100;
      const nDI = (sNDM / sTR) * 100;
      const dx =
        pDI + nDI > 0 ? (Math.abs(pDI - nDI) / (pDI + nDI)) * 100 : 0;
      dxVals.push(dx);
    }
  }
  if (dxVals.length < period) return null;
  const recent = dxVals.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

// ─── BB Squeeze (Bollinger Bands inside Keltner Channel) ─────────────────────
export interface BBSqueezeResult {
  squeeze: boolean;
  momentum: number;
  bbWidth: number;
}

export function bbSqueeze(
  candles: Candle[],
  bbPeriod = 20,
  bbMult = 2,
  kcMult = 1.5,
): BBSqueezeResult | null {
  const closes = candles.map((c) => c.close);
  const bb = bollinger(closes, bbPeriod, bbMult);
  const a = atr(candles, bbPeriod);
  const e = ema(closes, bbPeriod);
  if (!bb || !a || !e) return null;
  const kcUpper = e + kcMult * a;
  const kcLower = e - kcMult * a;
  const squeeze = bb.upper < kcUpper && bb.lower > kcLower;
  const last = closes[closes.length - 1] ?? 0;
  const momentum = last - bb.middle;
  return { squeeze, momentum, bbWidth: bb.width };
}

// ─── Donchian Channel (N-period high/low) ────────────────────────────────────
export interface DonchianResult {
  high: number;
  low: number;
  mid: number;
}

export function donchian(candles: Candle[], period = 20): DonchianResult | null {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  const high = Math.max(...slice.map((c) => c.high));
  const low = Math.min(...slice.map((c) => c.low));
  return { high, low, mid: (high + low) / 2 };
}

// ─── factorize (enhanced) ────────────────────────────────────────────────────
export interface FactorScore {
  rsi14: number | null;
  ema20: number | null;
  ema50: number | null;
  macdHist: number | null;
  atr14: number | null;
  atrPct: number | null;
  trendBias: "BULL" | "BEAR" | "NEUTRAL";
  momentumBias: "BULL" | "BEAR" | "NEUTRAL";
  volRegime: "LOW" | "NORMAL" | "HIGH" | "EXTREME";
  // Enhanced
  bbPct: number | null;
  stochK: number | null;
  stochD: number | null;
  vwapDev: number | null;
  adx14: number | null;
  williamsR14: number | null;
  bbSqueezeActive: boolean;
}

export function factorize(candles: Candle[]): FactorScore | null {
  const closes = candles.map((c) => c.close);
  if (closes.length < 50) return null;
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const r14 = rsi(closes, 14);
  const m = macd(closes, 12, 26, 9);
  const a14 = atr(candles, 14);
  const last = closes[closes.length - 1] ?? 0;
  const atrPct = a14 && last ? (a14 / last) * 100 : null;

  // Enhanced indicators
  const bb = bollinger(closes, 20, 2);
  const stoch = stochastic(candles, 14, 3);
  const vwapVal = vwap(candles);
  const adxVal = adx(candles, 14);
  const willR = williamsR(candles, 14);
  const squeeze = bbSqueeze(candles, 20, 2, 1.5);

  let trend: FactorScore["trendBias"] = "NEUTRAL";
  if (e20 !== null && e50 !== null) {
    if (last > e20 && e20 > e50) trend = "BULL";
    else if (last < e20 && e20 < e50) trend = "BEAR";
  }

  let momentum: FactorScore["momentumBias"] = "NEUTRAL";
  if (m && r14 !== null) {
    if (m.hist > 0 && r14 > 50) momentum = "BULL";
    else if (m.hist < 0 && r14 < 50) momentum = "BEAR";
  }

  let regime: FactorScore["volRegime"] = "NORMAL";
  if (atrPct !== null) {
    if (atrPct < 0.4) regime = "LOW";
    else if (atrPct < 1.5) regime = "NORMAL";
    else if (atrPct < 3.0) regime = "HIGH";
    else regime = "EXTREME";
  }

  const vwapDev = vwapVal && last ? ((last - vwapVal) / vwapVal) * 100 : null;

  return {
    rsi14: r14,
    ema20: e20,
    ema50: e50,
    macdHist: m ? m.hist : null,
    atr14: a14,
    atrPct,
    trendBias: trend,
    momentumBias: momentum,
    volRegime: regime,
    bbPct: bb ? bb.pct : null,
    stochK: stoch ? stoch.k : null,
    stochD: stoch ? stoch.d : null,
    vwapDev,
    adx14: adxVal,
    williamsR14: willR,
    bbSqueezeActive: squeeze ? squeeze.squeeze : false,
  };
}
