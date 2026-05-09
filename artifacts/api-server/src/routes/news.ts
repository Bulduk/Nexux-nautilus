import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { fetchOhlcv } from "../lib/exchange";
import { rsi, macd, bollinger, atr } from "../lib/indicators";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const anthropic = new Anthropic();

const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"];

export interface SentimentItem {
  symbol: string;
  price: number;
  change1h: number;
  change24h: number;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  score: number;
  headline: string;
  analysis: string;
  signals: {
    rsi: number | null;
    macdBias: "BULL" | "BEAR" | "NEUTRAL";
    bbPosition: string;
    volatility: string;
  };
}

async function analyzeSymbol(symbol: string): Promise<SentimentItem | null> {
  try {
    const candles = await fetchOhlcv(symbol, "1h", 30);
    if (candles.length < 25) return null;

    const closes = candles.map((c) => c.close);
    const last = closes[closes.length - 1] ?? 0;
    const prev1h = closes[closes.length - 2] ?? last;
    const prev24h = closes[closes.length - 25] ?? closes[0] ?? last;

    const change1h = ((last - prev1h) / prev1h) * 100;
    const change24h = ((last - prev24h) / prev24h) * 100;

    const r = rsi(closes, 14);
    const m = macd(closes, 12, 26, 9);
    const bb = bollinger(closes, 20, 2);
    const a = atr(candles, 14);
    const atrPct = a ? (a / last) * 100 : 0;

    const macdBias: "BULL" | "BEAR" | "NEUTRAL" = m
      ? m.hist > 0 ? "BULL" : m.hist < 0 ? "BEAR" : "NEUTRAL"
      : "NEUTRAL";

    let bbPosition = "mid";
    if (bb) {
      if (bb.pct > 0.8) bbPosition = "upper band";
      else if (bb.pct < 0.2) bbPosition = "lower band";
      else if (bb.pct > 0.6) bbPosition = "upper-mid";
      else if (bb.pct < 0.4) bbPosition = "lower-mid";
    }

    const volatility = atrPct > 3 ? "EXTREME" : atrPct > 1.5 ? "HIGH" : atrPct > 0.4 ? "NORMAL" : "LOW";

    // Ask Claude for market analysis
    const dataPrompt = `Kripto piyasası analiz verisi — ${symbol}:
Fiyat: $${last.toFixed(2)}
1s Değişim: ${change1h >= 0 ? "+" : ""}${change1h.toFixed(2)}%
24s Değişim: ${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%
RSI(14): ${r?.toFixed(1) ?? "N/A"}
MACD Histogram: ${m?.hist?.toFixed(5) ?? "N/A"} (${macdBias})
Bollinger Band Pozisyonu: ${bbPosition}
Volatilite Rejimi: ${volatility} (ATR: ${atrPct.toFixed(2)}%)

Bu teknik verilere dayanarak kısa bir piyasa analizi yaz:
1. Bir satırlık headline (max 80 karakter)
2. 2-3 cümlelik analiz
3. Sentiment skoru: -100 (çok bearish) ile +100 (çok bullish) arası bir sayı

JSON formatında yanıt ver:
{"headline": "...", "analysis": "...", "score": 0}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: "Sen bir kripto para teknik analisti ve piyasa yorumcususun. Kısa, bilgilendirici analizler yazarsın. Her zaman JSON formatında yanıt ver.",
      messages: [{ role: "user", content: dataPrompt }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    let headline = `${symbol}: Teknik analiz güncelleniyor…`;
    let analysis = "Veri işleniyor.";
    let score = 0;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as { headline?: string; analysis?: string; score?: number };
        if (parsed.headline) headline = parsed.headline;
        if (parsed.analysis) analysis = parsed.analysis;
        if (typeof parsed.score === "number") score = Math.max(-100, Math.min(100, parsed.score));
      } catch { /* fallback */ }
    }

    const sentiment: SentimentItem["sentiment"] =
      score > 20 ? "BULLISH" : score < -20 ? "BEARISH" : "NEUTRAL";

    return {
      symbol,
      price: last,
      change1h,
      change24h,
      sentiment,
      score,
      headline,
      analysis,
      signals: { rsi: r, macdBias, bbPosition, volatility },
    };
  } catch (err) {
    logger.error({ err, symbol }, "news sentiment error");
    return null;
  }
}

// ── GET /news/sentiment — market sentiment for all symbols ──────────────────
router.get("/news/sentiment", async (_req, res) => {
  try {
    const results = await Promise.allSettled(SYMBOLS.map(analyzeSymbol));
    const items = results
      .map((r) => (r.status === "fulfilled" ? r.value : null))
      .filter(Boolean) as SentimentItem[];

    const overall = items.length > 0
      ? items.reduce((a, b) => a + b.score, 0) / items.length
      : 0;

    const marketMood = overall > 25 ? "BULLISH" : overall < -25 ? "BEARISH" : "NEUTRAL";

    res.json({
      items,
      overall: { score: Math.round(overall), mood: marketMood },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "news sentiment batch error");
    res.status(500).json({ error: String(err) });
  }
});

export default router;
