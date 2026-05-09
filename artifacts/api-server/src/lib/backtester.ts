import type { Candle } from "./exchange";
import { type StrategyDef, evaluateStrategy } from "./strategies";

export interface BacktestTrade {
  barIndex: number;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number;
  pnlPct: number;
  holdBars: number;
  exitReason: "TP" | "SL" | "TIME" | "SIGNAL";
  entryTime: number;
  exitTime: number;
}

export interface BacktestResult {
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: string;
  totalCandles: number;
  lookback: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  totalPnlPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  profitFactor: number;
  avgWinPct: number;
  avgLossPct: number;
  maxConsecLosses: number;
  expectancy: number;
  trades: BacktestTrade[];
  equityCurve: { ts: number; equity: number }[];
  runAt: string;
}

const SLIPPAGE = 0.001; // 0.1%
const FEE = 0.001;      // 0.1% per side
const LOOKBACK = 60;    // candles needed to warm up indicators
const MAX_HOLD = 72;    // max hold in bars (auto-exit)

export async function runBacktest(
  strategy: StrategyDef,
  candles: Candle[],
  symbol: string,
  timeframe: string,
): Promise<BacktestResult> {
  if (candles.length < LOOKBACK + 10) {
    throw new Error(`Not enough candles: need ${LOOKBACK + 10}, got ${candles.length}`);
  }

  let equity = 100.0;
  const trades: BacktestTrade[] = [];
  const equityCurve: { ts: number; equity: number }[] = [
    { ts: candles[LOOKBACK]?.time ?? 0, equity },
  ];

  type OpenPos = {
    direction: "LONG" | "SHORT";
    entryPrice: number;
    entryIndex: number;
    entryTime: number;
    stopLoss: number;
    takeProfit: number;
  };

  let position: OpenPos | null = null;
  let consecLoss = 0;
  let maxConsecLoss = 0;

  for (let i = LOOKBACK; i < candles.length - 1; i++) {
    const candle = candles[i]!;
    const nextCandle = candles[i + 1]!;

    // ── Check exit conditions for open position ──
    if (position) {
      const isLong = position.direction === "LONG";
      let exitPrice: number | null = null;
      let exitReason: BacktestTrade["exitReason"] | null = null;

      if (isLong) {
        if (candle.low <= position.stopLoss) {
          exitPrice = position.stopLoss;
          exitReason = "SL";
        } else if (candle.high >= position.takeProfit) {
          exitPrice = position.takeProfit;
          exitReason = "TP";
        }
      } else {
        if (candle.high >= position.stopLoss) {
          exitPrice = position.stopLoss;
          exitReason = "SL";
        } else if (candle.low <= position.takeProfit) {
          exitPrice = position.takeProfit;
          exitReason = "TP";
        }
      }

      // Time-based exit
      if (!exitPrice && i - position.entryIndex >= MAX_HOLD) {
        exitPrice = candle.close;
        exitReason = "TIME";
      }

      if (exitPrice && exitReason) {
        const rawPnl = isLong
          ? (exitPrice - position.entryPrice) / position.entryPrice
          : (position.entryPrice - exitPrice) / position.entryPrice;
        const netPnl = rawPnl - 2 * FEE;
        equity *= 1 + netPnl;

        const trade: BacktestTrade = {
          barIndex: i,
          direction: position.direction,
          entryPrice: position.entryPrice,
          exitPrice,
          pnlPct: netPnl * 100,
          holdBars: i - position.entryIndex,
          exitReason,
          entryTime: position.entryTime,
          exitTime: candle.time,
        };
        trades.push(trade);

        if (netPnl < 0) {
          consecLoss++;
          if (consecLoss > maxConsecLoss) maxConsecLoss = consecLoss;
        } else {
          consecLoss = 0;
        }

        position = null;
      }
    }

    // ── Look for entry signal (only if flat) ──
    if (!position) {
      const windowCandles = candles.slice(0, i + 1);
      const signal = evaluateStrategy(strategy, windowCandles);

      if (signal.direction !== "NEUTRAL" && signal.confidence >= 58) {
        const slip = signal.direction === "LONG" ? 1 + SLIPPAGE : 1 - SLIPPAGE;
        const entryPrice = (nextCandle.open ?? candle.close) * slip;
        position = {
          direction: signal.direction,
          entryPrice,
          entryIndex: i + 1,
          entryTime: nextCandle.time,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
        };
      }
    }

    equityCurve.push({ ts: candle.time, equity });
  }

  // ── Close any remaining open position at last price ──
  if (position) {
    const last = candles[candles.length - 1]!;
    const rawPnl =
      position.direction === "LONG"
        ? (last.close - position.entryPrice) / position.entryPrice
        : (position.entryPrice - last.close) / position.entryPrice;
    const netPnl = rawPnl - 2 * FEE;
    equity *= 1 + netPnl;
    trades.push({
      barIndex: candles.length - 1,
      direction: position.direction,
      entryPrice: position.entryPrice,
      exitPrice: last.close,
      pnlPct: netPnl * 100,
      holdBars: candles.length - 1 - position.entryIndex,
      exitReason: "TIME",
      entryTime: position.entryTime,
      exitTime: last.time,
    });
  }

  // ── Metrics ──────────────────────────────────────────────────────────────
  const wins = trades.filter((t) => t.pnlPct > 0);
  const losses = trades.filter((t) => t.pnlPct <= 0);
  const winRate = trades.length > 0 ? wins.length / trades.length : 0;
  const totalPnlPct = equity - 100;

  // Max drawdown
  let peak = 100;
  let maxDD = 0;
  for (const pt of equityCurve) {
    if (pt.equity > peak) peak = pt.equity;
    const dd = ((peak - pt.equity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  // Sharpe & Sortino (annualized, using per-trade returns)
  const returns = trades.map((t) => t.pnlPct / 100);
  const meanR = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdR = Math.sqrt(
    returns.reduce((a, b) => a + (b - meanR) ** 2, 0) / (returns.length || 1),
  );
  const downR = Math.sqrt(
    returns.filter((r) => r < 0).reduce((a, b) => a + b * b, 0) / (returns.length || 1),
  );
  const sharpe = stdR > 0 ? (meanR / stdR) * Math.sqrt(252) : 0;
  const sortino = downR > 0 ? (meanR / downR) * Math.sqrt(252) : 0;

  const grossWin = wins.reduce((a, t) => a + t.pnlPct, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnlPct, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;

  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    symbol,
    timeframe,
    totalCandles: candles.length,
    lookback: LOOKBACK,
    totalTrades: trades.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRate,
    totalPnlPct,
    maxDrawdownPct: maxDD,
    sharpeRatio: sharpe,
    sortinoRatio: sortino,
    profitFactor,
    avgWinPct: avgWin,
    avgLossPct: avgLoss,
    maxConsecLosses: maxConsecLoss,
    expectancy,
    trades: trades.slice(-100),
    equityCurve,
    runAt: new Date().toISOString(),
  };
}
