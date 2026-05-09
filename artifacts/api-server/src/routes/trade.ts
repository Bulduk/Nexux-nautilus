import { Router, type IRouter } from "express";
import {
  getLiveExchange,
  isLiveTradingConfigured,
  listConfiguredLiveExchanges,
  type LiveExchangeId,
} from "../lib/exchange";
import { logger } from "../lib/logger";
import { requirePlan } from "../middlewares/requirePlan";

const router: IRouter = Router();

router.get("/trade/status", (_req, res) => {
  const configured = listConfiguredLiveExchanges();
  res.json({
    live_trading_configured: configured.length > 0,
    configured_exchanges: configured,
    default_exchange: configured[0] ?? null,
    note:
      configured.length > 0
        ? `Server-side keys found for: ${configured.join(", ")}. LIVE mode can place real orders.`
        : "No exchange API keys present. Add BINANCE_API_KEY + BINANCE_API_SECRET (or other exchange keys) as Replit secrets to enable LIVE mode.",
  });
});

router.get("/account/balance", async (req, res) => {
  const exchangeId = (req.query["exchange"] as LiveExchangeId | undefined) ?? listConfiguredLiveExchanges()[0];

  if (!exchangeId || !isLiveTradingConfigured()) {
    res.json({
      live: false,
      message: "Live keys not set; use paper engine balance.",
    });
    return;
  }

  try {
    const ex = getLiveExchange(exchangeId);
    if (!ex) {
      res.json({ live: false, message: `live keys missing for ${exchangeId}` });
      return;
    }
    const bal = await ex.fetchBalance();
    const totals = bal.total ?? {};
    const trimmed: Record<string, number> = {};
    for (const [k, v] of Object.entries(totals)) {
      const num = Number(v);
      if (Number.isFinite(num) && num > 0) trimmed[k] = num;
    }
    res.json({ live: true, exchange: exchangeId, balances: trimmed });
  } catch (err) {
    logger.error({ err }, "balance fetch failed");
    res.status(502).json({ live: true, error: "balance_fetch_failed", detail: String(err) });
  }
});

router.post("/trade/order", requirePlan("PRO"), async (req, res) => {
  const {
    mode,
    symbol,
    side,
    type = "market",
    amount,
    price,
    confirm,
    exchange: exchangeParam,
  } = req.body ?? {};

  if (mode !== "live") {
    res.status(400).json({
      error: "wrong_mode",
      message: "Bu endpoint sadece LIVE modda kullanılabilir. Paper trading için /api/intent/submit kullanın.",
    });
    return;
  }
  if (confirm !== true) {
    res.status(400).json({
      error: "confirm_required",
      message: "LIVE emir için { confirm: true } parametresi gerekli.",
    });
    return;
  }
  if (!symbol || !side || !amount) {
    res.status(400).json({ error: "missing_fields", required: ["symbol", "side", "amount"] });
    return;
  }

  // Exchange seçimi: parametre → env'deki ilk exchange → hata
  const configured = listConfiguredLiveExchanges();
  const exchangeId: LiveExchangeId =
    (exchangeParam as LiveExchangeId | undefined) ?? configured[0] ?? "binance";

  if (!configured.includes(exchangeId)) {
    res.status(412).json({
      error: "exchange_not_configured",
      message: `${exchangeId.toUpperCase()} API keys not found. Configured: ${configured.join(", ") || "none"}`,
      hint: `Add ${exchangeId.toUpperCase()}_API_KEY and ${exchangeId.toUpperCase()}_API_SECRET as Replit secrets.`,
    });
    return;
  }

  const sideLc = String(side).toLowerCase();
  if (sideLc !== "buy" && sideLc !== "sell") {
    res.status(400).json({ error: "invalid_side" });
    return;
  }

  try {
    const ex = getLiveExchange(exchangeId);
    if (!ex) {
      res.status(412).json({ error: "live_not_configured" });
      return;
    }
    const order = await ex.createOrder(
      String(symbol),
      String(type),
      sideLc as "buy" | "sell",
      Number(amount),
      price !== undefined ? Number(price) : undefined,
    );
    logger.info({ orderId: order.id, symbol, side, amount, exchange: exchangeId }, "live order placed");
    res.json({ ok: true, order, exchange: exchangeId });
  } catch (err) {
    logger.error({ err, symbol, side }, "order placement failed");
    res.status(502).json({
      ok: false,
      error: "order_failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
