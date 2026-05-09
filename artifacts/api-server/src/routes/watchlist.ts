import { Router, type IRouter } from "express";
import { db } from "../lib/db";
import { watchlistTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fetchMarketInfo, fetchTickers } from "../lib/exchange";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /api/watchlist — liste tüm aktif coinler
router.get("/watchlist", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(watchlistTable)
      .orderBy(watchlistTable.createdAt);
    res.json({ symbols: rows });
  } catch (err) {
    logger.error({ err }, "watchlist fetch failed");
    res.status(500).json({ error: "db_error" });
  }
});

// GET /api/watchlist/prices — tüm aktif coinlerin canlı fiyatları
router.get("/watchlist/prices", async (_req, res) => {
  try {
    const rows = await db
      .select({ symbol: watchlistTable.symbol })
      .from(watchlistTable)
      .where(eq(watchlistTable.enabled, true))
      .orderBy(watchlistTable.createdAt);

    const symbols = rows.map((r) => r.symbol);
    if (symbols.length === 0) {
      res.json({ prices: {} });
      return;
    }

    const tickers = await fetchTickers(symbols);
    const prices: Record<string, { price: number; change: number; volume: string; high: number; low: number }> = {};
    for (const t of tickers) {
      prices[t.symbol] = {
        price: t.price,
        change: t.change,
        volume: t.volQuote,
        high: t.high,
        low: t.low,
      };
    }
    res.json({ prices, symbols });
  } catch (err) {
    logger.error({ err }, "watchlist prices fetch failed");
    res.status(500).json({ error: "prices_fetch_failed", detail: String(err) });
  }
});

// GET /api/watchlist/symbols — sadece symbol listesi (signals için)
router.get("/watchlist/symbols", async (_req, res) => {
  try {
    const rows = await db
      .select({ symbol: watchlistTable.symbol })
      .from(watchlistTable)
      .where(eq(watchlistTable.enabled, true))
      .orderBy(watchlistTable.createdAt);
    res.json({ symbols: rows.map((r) => r.symbol) });
  } catch (err) {
    logger.error({ err }, "watchlist symbols fetch failed");
    // Fallback to defaults
    res.json({ symbols: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"] });
  }
});

// POST /api/watchlist — coin ekle (örn: { symbol: "PEPE/USDT" })
router.post("/watchlist", async (req, res) => {
  const rawSymbol = String(req.body?.symbol ?? "").trim().toUpperCase();
  if (!rawSymbol) {
    res.status(400).json({ error: "symbol_required", hint: 'Örnek: { "symbol": "PEPE/USDT" }' });
    return;
  }

  // Normalize: "PEPE" → "PEPE/USDT", "PEPEUSDT" → "PEPE/USDT"
  let symbol = rawSymbol;
  if (!symbol.includes("/")) {
    // Try to detect quote currency
    const quotes = ["USDT", "USDC", "BTC", "ETH", "BNB"];
    let matched = false;
    for (const q of quotes) {
      if (symbol.endsWith(q)) {
        symbol = `${symbol.slice(0, -q.length)}/${q}`;
        matched = true;
        break;
      }
    }
    if (!matched) symbol = `${symbol}/USDT`;
  }

  const [base, quote] = symbol.split("/");
  if (!base || !quote) {
    res.status(400).json({ error: "invalid_symbol_format", parsed: symbol });
    return;
  }

  // Verify symbol exists on exchange (optional, non-blocking)
  const exchange = (req.body?.exchange as string) ?? "binance";
  let verified = false;
  try {
    const info = await fetchMarketInfo(symbol);
    verified = info !== null;
  } catch {
    verified = false;
  }

  try {
    const [inserted] = await db
      .insert(watchlistTable)
      .values({
        symbol,
        base,
        quote,
        exchange,
        enabled: true,
        addedBy: "user",
        tags: req.body?.tags ?? [],
      })
      .onConflictDoUpdate({
        target: watchlistTable.symbol,
        set: { enabled: true, updatedAt: new Date() },
      })
      .returning();

    req.log.info({ symbol, verified }, "watchlist symbol added");
    res.json({
      ok: true,
      symbol: inserted,
      verified,
      message: verified
        ? `${symbol} doğrulandı ve watchlist'e eklendi.`
        : `${symbol} eklendi (borsa doğrulaması yapılamadı — sembol adını kontrol edin).`,
    });
  } catch (err) {
    logger.error({ err, symbol }, "watchlist insert failed");
    res.status(500).json({ error: "db_error", detail: String(err) });
  }
});

// DELETE /api/watchlist/:symbol — coin sil
router.delete("/watchlist/:symbol", async (req, res) => {
  const symbol = decodeURIComponent(req.params["symbol"] ?? "").toUpperCase();
  if (!symbol) {
    res.status(400).json({ error: "symbol_required" });
    return;
  }
  try {
    const deleted = await db
      .delete(watchlistTable)
      .where(eq(watchlistTable.symbol, symbol))
      .returning();
    if (deleted.length === 0) {
      res.status(404).json({ error: "not_found", symbol });
      return;
    }
    res.json({ ok: true, deleted: deleted[0] });
  } catch (err) {
    logger.error({ err, symbol }, "watchlist delete failed");
    res.status(500).json({ error: "db_error" });
  }
});

// PATCH /api/watchlist/:symbol — enable/disable
router.patch("/watchlist/:symbol", async (req, res) => {
  const symbol = decodeURIComponent(req.params["symbol"] ?? "").toUpperCase();
  const enabled = req.body?.enabled !== false;
  try {
    const updated = await db
      .update(watchlistTable)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(watchlistTable.symbol, symbol))
      .returning();
    if (updated.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, symbol: updated[0] });
  } catch (err) {
    res.status(500).json({ error: "db_error" });
  }
});

export default router;
