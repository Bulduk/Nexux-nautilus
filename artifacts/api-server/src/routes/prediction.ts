import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { requirePlan } from "../middlewares/requirePlan";

const router = Router();
const GAMMA_API = "https://gamma-api.polymarket.com";

let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 60_000; // 1 min

router.get("/prediction/markets", async (req, res) => {
  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      res.json(cache.data);
      return;
    }

    const resp = await fetch(
      `${GAMMA_API}/markets?tag_slug=crypto&active=true&limit=25&order=volume&ascending=false`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!resp.ok) throw new Error(`Polymarket HTTP ${resp.status}`);

    const raw = (await resp.json()) as any[];

    const markets = raw
      .filter((m: any) => m.active && Array.isArray(m.outcomePrices) && m.outcomePrices.length >= 2)
      .map((m: any) => ({
        id: m.id,
        question: m.question,
        description: m.description ?? "",
        endDate: m.endDate ?? null,
        outcomes: m.outcomes ?? ["Yes", "No"],
        outcomePrices: (m.outcomePrices as string[]).map((p) => parseFloat(p)),
        volumeUsd: parseFloat(m.volume ?? "0"),
        slug: m.slug ?? "",
        active: true,
      }))
      .slice(0, 20);

    const payload = { markets, count: markets.length, fetchedAt: Date.now() };
    cache = { data: payload, ts: Date.now() };
    res.json(payload);
  } catch (err: any) {
    req.log.error({ err }, "prediction/markets fetch error");
    // Return cached stale data if available
    if (cache) { res.json({ ...(cache.data as object), stale: true }); return; }
    res.status(502).json({ error: "Polymarket API unreachable", detail: err.message });
  }
});

router.post("/prediction/interpret", requirePlan("PRO"), async (req, res) => {
  const { markets } = req.body as { markets?: any[] };
  if (!Array.isArray(markets) || markets.length === 0) {
    res.status(400).json({ error: "markets array required" });
    return;
  }

  try {
    const anthropic = new Anthropic({
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? "placeholder",
    });

    const topMarkets = markets.slice(0, 10);
    const marketText = topMarkets
      .map(
        (m: any) =>
          `• "${m.question}" → EVET: %${(m.outcomePrices[0] * 100).toFixed(1)} | Hacim: $${(m.volumeUsd / 1000).toFixed(0)}K | Bitiş: ${m.endDate ?? "?"}`
      )
      .join("\n");

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 450,
      messages: [
        {
          role: "user",
          content: `Aşağıdaki Polymarket kripto tahmin piyasalarını analiz et (Türkçe yanıt, 4-5 cümle):

${marketText}

Bu tahminler piyasa beklentilerini nasıl yansıtıyor? Hangi coinler öne çıkıyor ve trader'lar için ne anlam ifade ediyor? Olasılıkları trading sinyaline dönüştür (örn. %73 EVET → güçlü boğa beklentisi).`,
        },
      ],
    });

    const content = msg.content[0];
    const interpretation = content.type === "text" ? content.text : "";
    res.json({ interpretation, model: "claude-sonnet-4-20250514", analyzedCount: topMarkets.length });
  } catch (err: any) {
    req.log.error({ err }, "prediction/interpret error");
    res.status(500).json({ error: "AI interpretation failed", detail: err.message });
  }
});

export default router;
