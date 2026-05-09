import { Router, type IRouter } from "express";
import { fetchTickers, fetchOhlcv, fetchOrderbook } from "../lib/exchange";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const DEFAULT_SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"];

// ── Server-side ticker cache ───────────────────────────────────────────────
// Absorbs burst traffic (multiple clients, frequent polls) into a single
// CCXT call. TTL of 10 s keeps data fresh enough for a trading dashboard.
const tickerCache = new Map<string, { data: unknown[]; ts: number }>();
const inFlight    = new Map<string, Promise<unknown[]>>();
const TICKER_TTL  = 10_000; // 10 seconds

async function getCachedTickers(symbols: string[]): Promise<unknown[]> {
  const key = symbols.sort().join(",");

  // Cache hit
  const cached = tickerCache.get(key);
  if (cached && Date.now() - cached.ts < TICKER_TTL) return cached.data;

  // Deduplicate concurrent requests (stampede protection)
  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = fetchTickers(symbols)
    .then((data) => {
      tickerCache.set(key, { data, ts: Date.now() });
      inFlight.delete(key);
      return data;
    })
    .catch((err) => {
      inFlight.delete(key);
      throw err;
    });

  inFlight.set(key, promise as Promise<unknown[]>);
  return promise;
}

// ── OHLCV cache (1 min TTL) ───────────────────────────────────────────────
const ohlcvCache = new Map<string, { data: unknown; ts: number }>();
const OHLCV_TTL = 60_000;

// ── ROUTES ────────────────────────────────────────────────────────────────

router.get("/markets/ticker", async (req, res) => {
  const raw = (req.query["symbols"] as string | undefined) ?? "";
  const symbols = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_SYMBOLS;

  try {
    const data = await getCachedTickers(symbols);
    res.json({ tickers: data });
  } catch (err) {
    logger.error({ err }, "ticker fetch failed");
    // Return stale data rather than an error if available
    const stale = tickerCache.get(symbols.sort().join(","));
    if (stale) {
      res.json({ tickers: stale.data, stale: true });
      return;
    }
    res.status(502).json({ error: "ticker_fetch_failed", detail: String(err) });
  }
});

router.get("/markets/ohlcv", async (req, res) => {
  const symbol    = (req.query["symbol"]    as string | undefined) ?? "BTC/USDT";
  const timeframe = (req.query["timeframe"] as string | undefined) ?? "15m";
  const limitStr  = (req.query["limit"]     as string | undefined) ?? "60";
  const limit     = Math.min(Math.max(parseInt(limitStr, 10) || 60, 1), 500);
  const cacheKey  = `${symbol}:${timeframe}:${limit}`;

  const hit = ohlcvCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < OHLCV_TTL) {
    res.json({ symbol, timeframe, candles: hit.data, cached: true });
    return;
  }

  try {
    const data = await fetchOhlcv(symbol, timeframe, limit);
    ohlcvCache.set(cacheKey, { data, ts: Date.now() });
    res.json({ symbol, timeframe, candles: data });
  } catch (err) {
    logger.error({ err, symbol, timeframe }, "ohlcv fetch failed");
    const stale = ohlcvCache.get(cacheKey);
    if (stale) { res.json({ symbol, timeframe, candles: stale.data, stale: true }); return; }
    res.status(502).json({ error: "ohlcv_fetch_failed", detail: String(err) });
  }
});

router.get("/markets/orderbook", async (req, res) => {
  const symbol   = (req.query["symbol"] as string | undefined) ?? "BTC/USDT";
  const depthStr = (req.query["depth"]  as string | undefined) ?? "25";
  const depth    = Math.min(Math.max(parseInt(depthStr, 10) || 25, 1), 100);
  try {
    const data = await fetchOrderbook(symbol, depth);
    res.json(data);
  } catch (err) {
    logger.error({ err, symbol }, "orderbook fetch failed");
    res.status(502).json({ error: "orderbook_fetch_failed", detail: String(err) });
  }
});

export default router;
