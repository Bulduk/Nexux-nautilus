import { Router, type IRouter } from "express";
import { runCouncil } from "../lib/council";
import { db } from "../lib/db";
import { councilVotesTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { fetchOhlcv, fetchOrderbook } from "../lib/exchange";
import { factorize } from "../lib/indicators";
import { requirePlan } from "../middlewares/requirePlan";

const router: IRouter = Router();

/**
 * Gerçek piyasa verisi çekip context'i zenginleştir
 * Council ajanlarına indikatör + orderbook verileri verir
 */
async function enrichContext(
  symbol: string,
  userContext: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    const [candles, ob] = await Promise.all([
      fetchOhlcv(symbol, "15m", 60),
      fetchOrderbook(symbol, 20),
    ]);
    const f = candles.length >= 30 ? factorize(candles) : null;
    const last = candles[candles.length - 1];

    return {
      ...userContext,
      price: last?.close ?? userContext["price"] ?? 0,
      open: last?.open,
      high: last?.high,
      low: last?.low,
      volume: last?.volume,
      rsi14: f?.rsi14 ?? null,
      macd_hist: f?.macdHist ?? null,
      ema20: f?.ema20 ?? null,
      ema50: f?.ema50 ?? null,
      atr14_pct: f?.atrPct ?? null,
      trend_bias: f?.trendBias ?? "NEUTRAL",
      momentum_bias: f?.momentumBias ?? "NEUTRAL",
      vol_regime: f?.volRegime ?? "NORMAL",
      bb_pct: f?.bbPct ?? null,
      orderbook_imbalance_pct: ob.imbalance,
      spread_pct: ob.spreadPct,
      bid_wall: ob.bidWall,
      ask_wall: ob.askWall,
      data_source: "live_kucoin_15m",
      fetched_at: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn({ err, symbol }, "council context enrichment failed — using user context");
    return { ...userContext, data_source: "user_provided" };
  }
}

/**
 * POST /api/council/vote
 * Body: { symbol, direction, context? }
 * Otomatik piyasa verisi çeker → 4 ajan paralel oy kullanır → konsensüs karar döner
 */
router.post("/council/vote", requirePlan("ELITE"), async (req, res) => {
  const { symbol, direction, context = {} } = req.body ?? {};

  if (!symbol || !direction) {
    res.status(400).json({
      error: "missing_fields",
      required: ["symbol", "direction"],
      hint: '{ "symbol": "BTC/USDT", "direction": "LONG", "context": { "price": 95000 } }',
    });
    return;
  }

  const dir = String(direction).toUpperCase();
  if (dir !== "LONG" && dir !== "SHORT") {
    res.status(400).json({ error: "invalid_direction", valid: ["LONG", "SHORT"] });
    return;
  }

  const sym = String(symbol).toUpperCase();

  try {
    req.log.info({ symbol: sym, direction: dir }, "council vote started — enriching context");

    // Otomatik piyasa verisi çek
    const enrichedContext = await enrichContext(sym, context as Record<string, unknown>);

    req.log.info(
      { symbol: sym, price: enrichedContext["price"], rsi14: enrichedContext["rsi14"], trend: enrichedContext["trend_bias"] },
      "council context enriched",
    );

    const decision = await runCouncil(sym, dir as "LONG" | "SHORT", enrichedContext);
    res.json(decision);
  } catch (err) {
    logger.error({ err }, "council vote failed");
    res.status(502).json({ error: "council_failed", detail: String(err) });
  }
});

/**
 * GET /api/council/history?symbol=BTC/USDT&limit=20
 * Son council kararlarını listeler
 */
router.get("/council/history", async (req, res) => {
  const limit = Math.min(50, Number(req.query["limit"] ?? 20));
  try {
    const rows = await db
      .select()
      .from(councilVotesTable)
      .orderBy(desc(councilVotesTable.createdAt))
      .limit(limit * 4); // 4 agents per session

    // Group by session
    const sessions: Record<string, typeof rows> = {};
    for (const r of rows) {
      if (!sessions[r.sessionId]) sessions[r.sessionId] = [];
      sessions[r.sessionId]!.push(r);
    }

    const summaries = Object.entries(sessions)
      .slice(0, limit)
      .map(([sessionId, votes]) => {
        const approve = votes.filter((v) => v.vote === "APPROVE").length;
        const reject = votes.filter((v) => v.vote === "REJECT").length;
        const first = votes[0];
        return {
          sessionId,
          symbol: first?.symbol ?? "",
          direction: first?.direction ?? "",
          approve,
          reject,
          approved: approve > reject,
          createdAt: first?.createdAt,
          votes: votes.map((v) => ({
            agentId: v.agentId,
            vote: v.vote,
            confidence: v.confidence,
            reason: v.reason,
            model: v.model,
          })),
        };
      });

    res.json({ sessions: summaries, total: summaries.length });
  } catch (err) {
    logger.error({ err }, "council history fetch failed");
    res.status(500).json({ error: "db_error" });
  }
});

export default router;
