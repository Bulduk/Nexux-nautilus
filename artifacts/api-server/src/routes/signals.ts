import { Router, type IRouter } from "express";
import { fetchOhlcv, fetchOrderbook } from "../lib/exchange";
import { factorize } from "../lib/indicators";
import { db } from "../lib/db";
import { watchlistTable, signalsTable, pendingSignalsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { loadRiskProfile } from "../lib/risk";
import { randomUUID } from "node:crypto";
import { pushTokensTable } from "@workspace/db";
import { sendExpoPush } from "./push";

const PUSH_DEDUP_MS = 5 * 60 * 1000;
const _pushDedup = new Map<string, number>();

async function fanOutSignalPush(signal: RealSignal, grade: "A" | "B" | "C" | "D"): Promise<void> {
  try {
    const key = `${signal.symbol}|${signal.direction}|${grade}`;
    const now = Date.now();
    const last = _pushDedup.get(key) ?? 0;
    if (now - last < PUSH_DEDUP_MS) return;
    _pushDedup.set(key, now);
    // Map'i sınırlı tutmak için aşırıya kaçarsa eski kayıtları temizle
    if (_pushDedup.size > 256) {
      for (const [k, ts] of _pushDedup) if (now - ts > PUSH_DEDUP_MS) _pushDedup.delete(k);
    }

    const isHighGrade = grade === "A";
    const rows = await db
      .select()
      .from(pushTokensTable)
      .where(eq(pushTokensTable.enabled, true));
    const tokens = rows
      .filter((r) => r.notifySignals)
      .filter((r) => isHighGrade || r.signalLevel === "all")
      .map((r) => r.token);
    if (tokens.length === 0) return;
    const arrow = signal.direction === "LONG" ? "↑" : "↓";
    await sendExpoPush(tokens, {
      title: `${grade}-grade ${signal.symbol} ${arrow}`,
      body: `${signal.direction} · conf ${signal.confidence}% · entry $${signal.price.toFixed(signal.price >= 1 ? 2 : 4)}`,
      data: { type: "signal", symbol: signal.symbol, grade, direction: signal.direction },
    });
  } catch (err) {
    logger.warn({ err }, "signal push fan-out failed");
  }
}

const router: IRouter = Router();

const DEFAULT_WATCHLIST = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"];
const SOURCES = ["mirofish", "betafish", "onyx", "openclaw"];

export interface DecisionTrace {
  why_entry: string;
  why_size: string;
  why_stop: string;
  why_leverage: string;
  factors: {
    rsi14: number | null;
    macdHist: number | null;
    ema20: number | null;
    ema50: number | null;
    atrPct: number | null;
    trendBias: string;
    momentumBias: string;
    volRegime: string;
    orderbookImbalance: number;
    spreadPct: number;
  };
  grade: "A" | "B" | "C" | "D";
  confluence: number;
}

export interface RealSignal {
  type: "signal";
  source: string;
  agent_kind: "core" | "external";
  symbol: string;
  direction: "LONG" | "SHORT";
  confidence: number;
  reason: string;
  price: number;
  entry: number;
  stop_loss: number;
  take_profit: number;
  rr: number;
  suggested_leverage: number;
  trace: DecisionTrace;
  timestamp: string;
}

async function getActiveWatchlist(): Promise<string[]> {
  try {
    const rows = await db
      .select({ symbol: watchlistTable.symbol })
      .from(watchlistTable)
      .where(eq(watchlistTable.enabled, true))
      .orderBy(watchlistTable.createdAt);
    if (rows.length > 0) return rows.map((r) => r.symbol);
  } catch {
    // DB not ready yet — use defaults
  }
  return DEFAULT_WATCHLIST;
}

function gradeFromConfluence(c: number): "A" | "B" | "C" | "D" {
  if (c >= 4) return "A";
  if (c === 3) return "B";
  if (c === 2) return "C";
  return "D";
}

async function buildSignalForSymbol(symbol: string): Promise<RealSignal | null> {
  try {
    const [candles, ob] = await Promise.all([
      fetchOhlcv(symbol, "15m", 100),
      fetchOrderbook(symbol, 25),
    ]);
    if (candles.length < 50) return null;
    const f = factorize(candles);
    if (!f) return null;
    const last = candles[candles.length - 1];
    if (!last) return null;
    const price = last.close;

    let bullVotes = 0;
    let bearVotes = 0;
    if (f.trendBias === "BULL") bullVotes++;
    if (f.trendBias === "BEAR") bearVotes++;
    if (f.momentumBias === "BULL") bullVotes++;
    if (f.momentumBias === "BEAR") bearVotes++;
    if (f.rsi14 !== null) {
      if (f.rsi14 > 55) bullVotes++;
      else if (f.rsi14 < 45) bearVotes++;
    }
    if (f.macdHist !== null) {
      if (f.macdHist > 0) bullVotes++;
      else if (f.macdHist < 0) bearVotes++;
    }
    if (ob.imbalance > 10) bullVotes++;
    else if (ob.imbalance < -10) bearVotes++;

    const direction: "LONG" | "SHORT" = bullVotes >= bearVotes ? "LONG" : "SHORT";
    const confluence = Math.max(bullVotes, bearVotes);

    let confidence = 50 + confluence * 9;
    if (f.volRegime === "EXTREME") confidence -= 20;
    else if (f.volRegime === "HIGH") confidence -= 8;
    else if (f.volRegime === "LOW") confidence += 3;
    confidence = Math.max(40, Math.min(95, Math.round(confidence)));

    const atrAbs = f.atr14 ?? price * 0.01;
    const stopMult = 1.5;
    const tpMult = 2.5;
    const stop_loss =
      direction === "LONG" ? price - atrAbs * stopMult : price + atrAbs * stopMult;
    const take_profit =
      direction === "LONG" ? price + atrAbs * tpMult : price - atrAbs * tpMult;
    const risk = Math.abs(price - stop_loss);
    const reward = Math.abs(take_profit - price);
    const rr = risk > 0 ? Number((reward / risk).toFixed(2)) : 0;

    let lev = 1;
    if (f.volRegime === "LOW" && confluence >= 4) lev = 3;
    else if (f.volRegime === "NORMAL" && confluence >= 3) lev = 2;
    else lev = 1;

    const grade = gradeFromConfluence(confluence);
    const source = SOURCES[Math.floor(Math.random() * SOURCES.length)] ?? "mirofish";

    const trace: DecisionTrace = {
      why_entry:
        `${direction} on ${symbol} @ ${price.toFixed(2)}. Confluence ${confluence}/5: ` +
        `trend=${f.trendBias}, momentum=${f.momentumBias}, RSI ${f.rsi14?.toFixed(1) ?? "n/a"}, ` +
        `MACD-hist ${f.macdHist?.toFixed(4) ?? "n/a"}, OB-imbalance ${ob.imbalance.toFixed(1)}%.`,
      why_size:
        `Position sizing: RiskEngine (Kelly·0.25 capped by user max position USD). ` +
        `Vol regime ${f.volRegime} → vol_scalar applied.`,
      why_stop:
        `1.5×ATR(14) = ${(atrAbs * stopMult).toFixed(2)} below/above entry.`,
      why_leverage:
        `Suggested ${lev}x. Vol regime ${f.volRegime} + confluence ${confluence}/5.`,
      factors: {
        rsi14: f.rsi14,
        macdHist: f.macdHist,
        ema20: f.ema20,
        ema50: f.ema50,
        atrPct: f.atrPct,
        trendBias: f.trendBias,
        momentumBias: f.momentumBias,
        volRegime: f.volRegime,
        orderbookImbalance: Number(ob.imbalance.toFixed(2)),
        spreadPct: Number(ob.spreadPct.toFixed(4)),
      },
      grade,
      confluence,
    };

    const signal: RealSignal = {
      type: "signal",
      source,
      agent_kind: "core",
      symbol,
      direction,
      confidence,
      reason: `${grade}-grade · ${f.trendBias.toLowerCase()} trend · ${f.momentumBias.toLowerCase()} momentum · vol ${f.volRegime.toLowerCase()}`,
      price,
      entry: price,
      stop_loss,
      take_profit,
      rr,
      suggested_leverage: lev,
      trace,
      timestamp: new Date().toISOString(),
    };

    // Persist to signals DB async
    db.insert(signalsTable)
      .values({
        source: signal.source,
        agentKind: signal.agent_kind,
        symbol: signal.symbol,
        direction: signal.direction,
        confidence: signal.confidence.toString(),
        reason: signal.reason,
        price: signal.price.toString(),
        entry: signal.entry.toString(),
        stopLoss: signal.stop_loss.toString(),
        takeProfit: signal.take_profit.toString(),
        rr: signal.rr.toString(),
        suggestedLeverage: signal.suggested_leverage,
        trace: signal.trace as unknown as Record<string, unknown>,
      })
      .catch((err) => logger.warn({ err }, "signal DB persist failed"));

    // Push fan-out — dedup'lı: aynı symbol+direction+grade için 5 dakikada bir
    // tek bildirim gider. /signals/snapshot|stream gibi read endpoint'leri her
    // çağrıda buildSignalForSymbol'u tetiklediğinden bu dedup zorunlu — yoksa
    // herhangi bir auth'lu istemci global push spam'i tetikleyebilirdi.
    void fanOutSignalPush(signal, grade);

    // SEMI mod: onay kuyruğuna ekle
    try {
      const profile = loadRiskProfile();
      if (profile.executionMode === "semi") {
        const signalId = `sig_${randomUUID().slice(0, 8)}`;
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 dakika
        db.insert(pendingSignalsTable)
          .values({
            signalId,
            symbol: signal.symbol,
            direction: signal.direction,
            confidence: signal.confidence.toString(),
            reason: signal.reason ?? "",
            price: signal.price.toString(),
            entry: signal.entry.toString(),
            stopLoss: signal.stop_loss.toString(),
            takeProfit: signal.take_profit.toString(),
            rr: signal.rr.toString(),
            suggestedLeverage: signal.suggested_leverage,
            source: signal.source,
            status: "pending",
            trace: signal.trace as unknown as Record<string, unknown>,
            expiresAt,
          })
          .catch((err) => logger.warn({ err }, "pending signal insert failed"));
      }
    } catch {
      // best-effort
    }

    return signal;
  } catch (err) {
    logger.warn({ err, symbol }, "signal build failed");
    return null;
  }
}

// GET /api/signals/snapshot?symbol=BTC/USDT
router.get("/signals/snapshot", async (req, res) => {
  const symbol = (req.query["symbol"] as string | undefined) ?? "BTC/USDT";
  const sig = await buildSignalForSymbol(symbol.toUpperCase());
  if (!sig) {
    res.status(502).json({ error: "signal_build_failed", symbol });
    return;
  }
  res.json(sig);
});

// GET /api/signals/all — tüm watchlist için snapshot
router.get("/signals/all", async (_req, res) => {
  const watchlist = await getActiveWatchlist();
  const results = await Promise.allSettled(
    watchlist.map((sym) => buildSignalForSymbol(sym)),
  );
  const signals = results
    .filter((r): r is PromiseFulfilledResult<RealSignal> => r.status === "fulfilled" && r.value !== null)
    .map((r) => r.value);
  res.json({ signals, total: signals.length, watchlist });
});

// GET /api/signals/history?symbol=BTC/USDT&limit=50
router.get("/signals/history", async (req, res) => {
  const symbol = req.query["symbol"] as string | undefined;
  const limit = Math.min(100, Number(req.query["limit"] ?? 50));
  try {
    const query = db
      .select()
      .from(signalsTable)
      .orderBy(desc(signalsTable.createdAt))
      .limit(limit);

    const rows = symbol
      ? await db
          .select()
          .from(signalsTable)
          .where(eq(signalsTable.symbol, symbol.toUpperCase()))
          .orderBy(desc(signalsTable.createdAt))
          .limit(limit)
      : await query;

    res.json({ signals: rows, total: rows.length });
  } catch (err) {
    logger.error({ err }, "signals history fetch failed");
    res.status(500).json({ error: "db_error" });
  }
});

// GET /api/signals/pending — SEMI mod onay kuyruğu
router.get("/signals/pending", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(pendingSignalsTable)
      .where(eq(pendingSignalsTable.status, "pending"))
      .orderBy(desc(pendingSignalsTable.createdAt))
      .limit(50);
    // Expire eski sinyaller
    const now = new Date();
    const expired = rows.filter((r) => r.expiresAt && new Date(r.expiresAt) < now);
    if (expired.length > 0) {
      await db
        .update(pendingSignalsTable)
        .set({ status: "expired" })
        .where(eq(pendingSignalsTable.status, "pending"));
    }
    const active = rows.filter((r) => !r.expiresAt || new Date(r.expiresAt) >= now);
    res.json({ pending: active, total: active.length });
  } catch (err) {
    logger.error({ err }, "pending signals fetch failed");
    res.status(500).json({ error: "db_error" });
  }
});

// PATCH /api/signals/pending/:signalId — approve or reject
router.patch("/signals/pending/:signalId", async (req, res) => {
  const { signalId } = req.params;
  const action = req.body?.action as "approve" | "reject" | undefined;

  if (!signalId || !action || !["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "signal_id and action (approve|reject) required" });
    return;
  }

  try {
    const updated = await db
      .update(pendingSignalsTable)
      .set({ status: action === "approve" ? "approved" : "rejected" })
      .where(eq(pendingSignalsTable.signalId, signalId))
      .returning();

    if (updated.length === 0) {
      res.status(404).json({ error: "not_found", signalId });
      return;
    }

    req.log.info({ signalId, action }, "pending signal actioned");
    res.json({ ok: true, signal: updated[0], action });
  } catch (err) {
    logger.error({ err }, "pending signal action failed");
    res.status(500).json({ error: "db_error" });
  }
});

// GET /api/signals/stream — SSE, watchlist'i sırayla tarar
router.get("/signals/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  res.write(
    `data: ${JSON.stringify({ type: "handshake", message: "SSE — multi-factor signal stream (DB-backed watchlist)" })}\n\n`,
  );

  let closed = false;
  let cursor = 0;
  let currentWatchlist = DEFAULT_WATCHLIST;

  // Refresh watchlist every cycle
  const refreshWatchlist = async () => {
    currentWatchlist = await getActiveWatchlist();
  };
  void refreshWatchlist();

  const tick = async () => {
    if (closed) return;
    if (cursor === 0) await refreshWatchlist();
    const symbol = currentWatchlist[cursor % currentWatchlist.length] ?? "BTC/USDT";
    cursor += 1;
    const sig = await buildSignalForSymbol(symbol);
    if (!closed && sig) res.write(`data: ${JSON.stringify(sig)}\n\n`);
  };

  void tick();
  const interval = setInterval(tick, 8000);
  const heartbeat = setInterval(() => {
    if (!closed) res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 20000);

  req.on("close", () => {
    closed = true;
    clearInterval(interval);
    clearInterval(heartbeat);
    res.end();
  });
});

export default router;
