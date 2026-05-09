import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { fetchOhlcv } from "../lib/exchange";
import {
  getAllStrategies,
  getStrategy,
  createStrategy,
  deleteStrategy,
  evaluateStrategy,
  type StrategyDef,
} from "../lib/strategies";
import { runBacktest } from "../lib/backtester";
import { logger } from "../lib/logger";
import { requirePlan } from "../middlewares/requirePlan";

const router: IRouter = Router();
const anthropic = new Anthropic();

// ── GET /strategy — list all strategies ──────────────────────────────────────
router.get("/strategy", (_req, res) => {
  res.json({ strategies: getAllStrategies() });
});

// ── POST /strategy — create custom strategy (PRO) ────────────────────────────
router.post("/strategy", requirePlan("PRO"), (req, res) => {
  const body = req.body as Partial<StrategyDef>;
  if (!body.id || !body.name || !body.type || !body.params) {
    res.status(400).json({ error: "id, name, type, params required" });
    return;
  }
  const strategy = createStrategy({
    id: body.id,
    name: body.name,
    type: body.type,
    description: body.description ?? "",
    tags: body.tags ?? [],
    params: body.params,
    naturalLanguage: body.naturalLanguage,
  });
  res.json({ strategy });
});

// ── DELETE /strategy/:id (PRO) ────────────────────────────────────────────────
router.delete("/strategy/:id", requirePlan("PRO"), (req, res) => {
  const ok = deleteStrategy((req.params["id"] as string) ?? "");
  if (!ok) { res.status(404).json({ error: "Strategy not found or is builtin" }); return; }
  res.json({ ok: true });
});

// ── POST /strategy/backtest — run backtest (PRO) ─────────────────────────────
router.post("/strategy/backtest", requirePlan("PRO"), async (req, res) => {
  const { strategyId, symbol = "BTC/USDT", timeframe = "1h", limit = 500 } =
    req.body as { strategyId: string; symbol?: string; timeframe?: string; limit?: number };

  if (!strategyId) { res.status(400).json({ error: "strategyId required" }); return; }
  const strategy = getStrategy(strategyId);
  if (!strategy) { res.status(404).json({ error: "Strategy not found" }); return; }

  try {
    const candles = await fetchOhlcv(symbol, timeframe, Math.min(limit, 1000));
    if (candles.length < 70) {
      res.status(400).json({ error: "Not enough candle data" });
      return;
    }
    const result = await runBacktest(strategy, candles, symbol, timeframe);
    res.json({ result });
  } catch (err) {
    logger.error({ err }, "backtest error");
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /strategy/vibe — NLP → strategy via Claude (PRO) ───────────────────
router.post("/strategy/vibe", requirePlan("PRO"), async (req, res) => {
  const { message, history = [] } = req.body as {
    message: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!message) { res.status(400).json({ error: "message required" }); return; }

  const SYSTEM = `You are Nexus Vibe Agent — a quantitative trading strategy interpreter.
Your job: convert natural language trading ideas into structured strategy definitions.

Available strategy types: ema_cross, rsi_reversal, bb_squeeze, breakout, vwap_bounce, stoch_cross, macd_zero_cross, multi_factor, custom

When you have enough information to define a strategy, respond with BOTH:
1. A friendly explanation of your interpretation
2. A JSON block (wrapped in \`\`\`json ... \`\`\`) with this exact structure:
{
  "id": "vibe_<snake_case_name>",
  "name": "Human-readable name",
  "type": "strategy_type",
  "description": "1-2 sentence description",
  "tags": ["tag1", "tag2"],
  "params": {
    "stoploss": 0.02,
    "roi": 0.04,
    // strategy-specific params matching the type
  }
}

If you need more info, ask a clarifying question. Keep responses concise.

Examples of strategy-specific params:
- ema_cross: { "emaCross": { "fast": 12, "slow": 26 } }
- rsi_reversal: { "rsiReversal": { "oversold": 30, "overbought": 70, "period": 14 } }
- bb_squeeze: { "bbSqueeze": { "period": 20, "mult": 2 } }
- breakout: { "breakout": { "period": 20 } }
- stoch_cross: { "stochCross": { "kPeriod": 14, "dPeriod": 3, "oversold": 20, "overbought": 80 } }
- macd_zero_cross: { "macdZeroCross": { "fast": 12, "slow": 26, "signal": 9 } }`;

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: message },
  ];

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM,
      messages,
    });

    const reply = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    // Try to extract JSON strategy from reply
    let strategy: StrategyDef | null = null;
    const jsonMatch = reply.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch?.[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]) as Partial<StrategyDef>;
        if (parsed.id && parsed.name && parsed.type && parsed.params) {
          strategy = {
            id: parsed.id,
            name: parsed.name,
            type: parsed.type,
            description: parsed.description ?? "",
            tags: parsed.tags ?? [],
            params: parsed.params,
            naturalLanguage: message,
            createdAt: Date.now(),
            builtin: false,
          };
        }
      } catch {
        // Malformed JSON, that's ok
      }
    }

    res.json({ reply, strategy, ready: !!strategy });
  } catch (err) {
    logger.error({ err }, "vibe agent error");
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /strategy/swarm — run all 4 agents in parallel ──────────────────────
router.get("/strategy/swarm", async (req, res) => {
  const symbol = (req.query["symbol"] as string) ?? "BTC/USDT";

  try {
    const candles = await fetchOhlcv(symbol, "15m", 150);
    if (candles.length < 70) {
      res.status(400).json({ error: "Not enough candle data" });
      return;
    }

    const agentStrategies = [
      { agent: "mirofish", role: "Breakout Specialist", strategyId: "bb_squeeze_breakout" },
      { agent: "betafish", role: "Mean Reversion Specialist", strategyId: "rsi_mean_reversion" },
      { agent: "onyx", role: "Trend Follower", strategyId: "ema_cross_12_26" },
      { agent: "openclaw", role: "Momentum Hunter", strategyId: "donchian_breakout_20" },
    ];

    const signals = agentStrategies.map(({ agent, role, strategyId }) => {
      const strategy = getStrategy(strategyId);
      if (!strategy) return { agent, role, direction: "NEUTRAL" as const, confidence: 0, reason: "Strategy not found" };
      const sig = evaluateStrategy(strategy, candles);
      return { agent, role, ...sig };
    });

    // Consensus
    const longs = signals.filter((s) => s.direction === "LONG");
    const shorts = signals.filter((s) => s.direction === "SHORT");
    let consensus: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";
    let consensusConf = 0;
    if (longs.length > shorts.length) {
      consensus = "LONG";
      consensusConf = longs.reduce((a, s) => a + s.confidence, 0) / longs.length;
    } else if (shorts.length > longs.length) {
      consensus = "SHORT";
      consensusConf = shorts.reduce((a, s) => a + s.confidence, 0) / shorts.length;
    }

    const price = candles[candles.length - 1]?.close ?? 0;
    res.json({
      symbol,
      price,
      agents: signals,
      consensus: { direction: consensus, confidence: Math.round(consensusConf), longVotes: longs.length, shortVotes: shorts.length },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "swarm error");
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /strategy/evaluate — quick single-strategy eval ──────────────────────
router.get("/strategy/evaluate", async (req, res) => {
  const { strategyId, symbol = "BTC/USDT", timeframe = "15m" } = req.query as Record<string, string>;
  if (!strategyId) { res.status(400).json({ error: "strategyId required" }); return; }
  const strategy = getStrategy(strategyId);
  if (!strategy) { res.status(404).json({ error: "Strategy not found" }); return; }
  try {
    const candles = await fetchOhlcv(symbol, timeframe, 150);
    const signal = evaluateStrategy(strategy, candles);
    res.json({ strategyId, symbol, timeframe, signal, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
