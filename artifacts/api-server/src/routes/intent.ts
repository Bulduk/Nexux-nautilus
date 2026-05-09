import { Router, type IRouter } from "express";
import {
  getLiveExchange,
  fetchMarketInfo,
  listConfiguredLiveExchanges,
  type LiveExchangeId,
} from "../lib/exchange";
import {
  loadRiskProfile,
  computePositionSize,
  recordTradeAt,
  recordTradePnl,
} from "../lib/risk";
import { evaluateIntent, type TradeIntent } from "../lib/policyGuard";
import {
  appendEntry,
  openPosition,
  closePositionByIntent,
  closeAllPositions,
} from "../lib/ledger";
import { logger } from "../lib/logger";

const router: IRouter = Router();

interface IntentInput {
  intent_id?: string;
  agent_source?: string;
  agent_kind?: "core" | "external";
  symbol: string;
  direction: "LONG" | "SHORT";
  confidence_pct: number;
  atr_pct?: number | null;
  price: number;
  leverage?: number;
  notional_usd?: number;
  equity_usd?: number;
  decision_trace?: string[];
  ttl_seconds?: number;
  exchange?: LiveExchangeId;
  mode?: "paper" | "live";
  dry_run?: boolean;
}

function makeIntentId(): string {
  return `int_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

router.post("/intent/evaluate", async (req, res) => {
  const body = (req.body ?? {}) as IntentInput;
  if (!body.symbol || !body.direction || !body.price) {
    res.status(400).json({ error: "missing_fields", required: ["symbol", "direction", "price"] });
    return;
  }
  const profile = loadRiskProfile();
  const equity = body.equity_usd ?? 1000;
  const sized = body.notional_usd
    ? { notionalUsd: body.notional_usd, qty: body.notional_usd / body.price, kellyFraction: 0, reason: "user-supplied notional" }
    : computePositionSize(
        {
          equityUsd: equity,
          confidencePct: body.confidence_pct,
          atrPct: body.atr_pct ?? null,
          price: body.price,
        },
        profile,
      );

  const intent: TradeIntent = {
    intentId: body.intent_id ?? makeIntentId(),
    agentSource: body.agent_source ?? "user",
    agentSourceKind: body.agent_kind ?? "core",
    symbol: body.symbol,
    direction: body.direction === "LONG" ? "BUY" : "SELL",
    orderType: "MARKET",
    notionalUsd: sized.notionalUsd,
    qty: sized.qty,
    price: body.price,
    leverage: body.leverage ?? 1,
    confidencePct: body.confidence_pct,
    atrPct: body.atr_pct ?? null,
    decisionTrace: body.decision_trace ?? [],
    ttlSeconds: body.ttl_seconds ?? 60,
    createdAt: Date.now(),
  };

  const result = evaluateIntent(intent, "dryrun");
  res.json({ intent, sizing: sized, guard: result, dry_run: true });
});

router.post("/intent/submit", async (req, res) => {
  const body = (req.body ?? {}) as IntentInput;
  if (!body.symbol || !body.direction || !body.price) {
    res.status(400).json({ error: "missing_fields" });
    return;
  }
  const mode: "paper" | "live" = body.mode ?? "paper";
  const profile = loadRiskProfile();
  const equity = body.equity_usd ?? 1000;
  const sized = body.notional_usd
    ? { notionalUsd: body.notional_usd, qty: body.notional_usd / body.price, kellyFraction: 0, reason: "user-supplied notional" }
    : computePositionSize(
        {
          equityUsd: equity,
          confidencePct: body.confidence_pct,
          atrPct: body.atr_pct ?? null,
          price: body.price,
        },
        profile,
      );

  const intent: TradeIntent = {
    intentId: body.intent_id ?? makeIntentId(),
    agentSource: body.agent_source ?? "user",
    agentSourceKind: body.agent_kind ?? "core",
    symbol: body.symbol,
    direction: body.direction === "LONG" ? "BUY" : "SELL",
    orderType: "MARKET",
    notionalUsd: sized.notionalUsd,
    qty: sized.qty,
    price: body.price,
    leverage: body.leverage ?? 1,
    confidencePct: body.confidence_pct,
    atrPct: body.atr_pct ?? null,
    decisionTrace: body.decision_trace ?? [],
    ttlSeconds: body.ttl_seconds ?? 60,
    createdAt: Date.now(),
  };

  appendEntry({
    type: "intent",
    intentId: intent.intentId,
    symbol: intent.symbol,
    side: intent.direction,
    notionalUsd: intent.notionalUsd,
    qty: intent.qty,
    price: intent.price,
    mode,
    agent: intent.agentSource,
    detail: `intent created — ${intent.direction} ${intent.symbol} $${intent.notionalUsd.toFixed(2)} @ ${intent.price.toFixed(2)} (${intent.leverage}x)`,
  });

  const guard = evaluateIntent(intent, mode);
  appendEntry({
    type: "guard",
    intentId: intent.intentId,
    detail: guard.ok
      ? "PolicyGuard PASSED — all 11 checks green"
      : `PolicyGuard REJECTED at "${guard.rejectedBy}"`,
    data: { checks: guard.checks },
  });

  if (!guard.ok) {
    appendEntry({
      type: "order_rejected",
      intentId: intent.intentId,
      symbol: intent.symbol,
      detail: `rejected by ${guard.rejectedBy}`,
      data: { rejectedBy: guard.rejectedBy },
    });
    res.status(403).json({ ok: false, intent, guard, sizing: sized });
    return;
  }

  if (body.dry_run) {
    res.json({ ok: true, intent, guard, sizing: sized, dry_run: true });
    return;
  }

  // --- Execute ---
  if (mode === "paper") {
    // Simulate fill at requested price (assumed already mid-market).
    openPosition({
      intentId: intent.intentId,
      symbol: intent.symbol,
      side: intent.direction,
      qty: intent.qty,
      entryPrice: intent.price,
      notionalUsd: intent.notionalUsd,
      exchange: "paper-sim",
      mode: "paper",
      openedAt: Date.now(),
    });
    appendEntry({
      type: "fill",
      intentId: intent.intentId,
      symbol: intent.symbol,
      side: intent.direction,
      qty: intent.qty,
      price: intent.price,
      notionalUsd: intent.notionalUsd,
      mode: "paper",
      exchange: "paper-sim",
      detail: `PAPER fill ${intent.direction} ${intent.qty.toFixed(6)} ${intent.symbol} @ ${intent.price.toFixed(2)}`,
    });
    recordTradeAt(intent.symbol);
    res.json({ ok: true, intent, guard, sizing: sized, mode: "paper" });
    return;
  }

  // LIVE PATH
  const exchangeId: LiveExchangeId = body.exchange ?? listConfiguredLiveExchanges()[0] ?? "binance";
  const ex = getLiveExchange(exchangeId);
  if (!ex) {
    appendEntry({
      type: "order_rejected",
      intentId: intent.intentId,
      detail: `live keys missing for ${exchangeId}`,
    });
    res.status(412).json({
      ok: false,
      error: "live_keys_missing",
      message: `Set ${exchangeId.toUpperCase()}_API_KEY and ${exchangeId.toUpperCase()}_API_SECRET as Replit secrets to enable live mode on ${exchangeId}.`,
    });
    return;
  }

  // Round qty to exchange precision.
  const info = await fetchMarketInfo(intent.symbol).catch(() => null);
  let qty = intent.qty;
  if (info && info.amountPrecision !== null) {
    const factor = Math.pow(10, info.amountPrecision);
    qty = Math.floor(qty * factor) / factor;
    if (info.minAmount && qty < info.minAmount) {
      appendEntry({
        type: "order_rejected",
        intentId: intent.intentId,
        detail: `qty ${qty} below min ${info.minAmount}`,
      });
      res.status(400).json({ ok: false, error: "below_min_amount", min: info.minAmount, qty });
      return;
    }
    if (info.minNotional && qty * intent.price < info.minNotional) {
      appendEntry({
        type: "order_rejected",
        intentId: intent.intentId,
        detail: `notional ${qty * intent.price} below min ${info.minNotional}`,
      });
      res.status(400).json({ ok: false, error: "below_min_notional", min: info.minNotional });
      return;
    }
  }

  appendEntry({
    type: "order_submitted",
    intentId: intent.intentId,
    symbol: intent.symbol,
    side: intent.direction,
    qty,
    price: intent.price,
    notionalUsd: intent.notionalUsd,
    exchange: exchangeId,
    mode: "live",
    detail: `LIVE submit ${intent.direction} ${qty} ${intent.symbol} on ${exchangeId} (clientOrderId=${intent.intentId})`,
  });

  try {
    const sideLc: "buy" | "sell" = intent.direction === "BUY" ? "buy" : "sell";
    const order = await ex.createOrder(
      intent.symbol,
      "market",
      sideLc,
      qty,
      undefined,
      { clientOrderId: intent.intentId },
    );
    const filledPrice = (order.average ?? order.price ?? intent.price) as number;
    const filledQty = (order.filled ?? qty) as number;

    openPosition({
      intentId: intent.intentId,
      symbol: intent.symbol,
      side: intent.direction,
      qty: filledQty,
      entryPrice: filledPrice,
      notionalUsd: filledQty * filledPrice,
      exchange: exchangeId,
      mode: "live",
      openedAt: Date.now(),
    });

    appendEntry({
      type: "fill",
      intentId: intent.intentId,
      symbol: intent.symbol,
      side: intent.direction,
      qty: filledQty,
      price: filledPrice,
      notionalUsd: filledQty * filledPrice,
      exchange: exchangeId,
      mode: "live",
      detail: `LIVE fill ${intent.direction} ${filledQty} ${intent.symbol} @ ${filledPrice} (slippage ${(((filledPrice - intent.price) / intent.price) * 1e4).toFixed(2)} bps)`,
      data: { order_id: order.id, raw: order.info as Record<string, unknown> | undefined },
    });
    recordTradeAt(intent.symbol);
    res.json({
      ok: true,
      intent,
      guard,
      sizing: sized,
      mode: "live",
      order: { id: order.id, filled: filledQty, price: filledPrice },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, intentId: intent.intentId }, "live order failed");
    appendEntry({
      type: "order_rejected",
      intentId: intent.intentId,
      detail: `exchange error: ${msg}`,
    });
    res.status(502).json({ ok: false, error: "exchange_error", detail: msg });
  }
});

router.post("/intent/close", async (req, res) => {
  const intentId = String(req.body?.intent_id ?? "");
  const exitPrice = Number(req.body?.exit_price ?? 0);
  if (!intentId || !Number.isFinite(exitPrice) || exitPrice <= 0) {
    res.status(400).json({ error: "missing_fields" });
    return;
  }
  const removed = closePositionByIntent(intentId);
  if (!removed) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const sideMul = removed.side === "BUY" ? 1 : -1;
  const pnl = (exitPrice - removed.entryPrice) * removed.qty * sideMul;
  recordTradePnl(pnl);
  appendEntry({
    type: "close",
    intentId,
    symbol: removed.symbol,
    qty: removed.qty,
    price: exitPrice,
    notionalUsd: removed.qty * exitPrice,
    mode: removed.mode,
    exchange: removed.exchange,
    detail: `closed ${removed.symbol} @ ${exitPrice.toFixed(2)} — PnL $${pnl.toFixed(2)}`,
    data: { realized_pnl_usd: pnl },
  });
  res.json({ ok: true, removed, realized_pnl_usd: pnl });
});

router.post("/intent/flatten-all", (_req, res) => {
  const removed = closeAllPositions();
  appendEntry({
    type: "kill",
    detail: `flatten-all: ${removed.length} positions force-closed (no fills sent — local clear only)`,
  });
  res.json({ ok: true, count: removed.length });
});

export default router;
