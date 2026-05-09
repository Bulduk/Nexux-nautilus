import { Router, type IRouter } from "express";
import { anthropic, anthropicConfigured } from "../lib/anthropic";
import { getAgentModel, getAgentSystemPrompt } from "../lib/agentConfigs";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const NEXUS_PRIME_SYSTEM = `Sen NEXUS PRIME'sın — Dataclaw / Nexus OS kurumsal kripto trading platformunun süpervizör ajanısın.

Patron ile Türkçe iletişim kuruyorsun. Sistemin parçaları:
- OpenClaw (executor) — execution & order routing
- Mirofish (signal generator) — teknik analiz, multi-timeframe
- Betafish (arbitrage) — funding rate, CVD, türev piyasalar
- Onyx (research) — sentiment, haber, makro

Yeni özellikler:
- Council sistemi: 4 ajan konsensüs kararı (/api/council/vote)
- Execution modları: paper / semi / auto_confirm / full_auto (/api/risk/mode)
- Dinamik watchlist: her coini ekleyebilirsin (/api/watchlist)
- PostgreSQL: tüm geçmiş kalıcı

[SCAN], [ROUTE], [REPORT], [COUNCIL], [RISK] etiketleri kullan. Kısa, teknik, kurumsal ton.`;

interface ChatMessageInput {
  role?: string;
  sender?: string;
  content?: string;
  text?: string;
}

router.post("/chat", async (req, res) => {
  if (!anthropicConfigured) {
    res.status(503).json({
      error: "ai_not_configured",
      message:
        "Anthropic AI integration is not configured on the server. Please contact the administrator.",
    });
    return;
  }

  const body = req.body ?? {};
  const rawMessages: ChatMessageInput[] = Array.isArray(body.messages)
    ? body.messages
    : [];

  const messages = rawMessages
    .map((m) => {
      const sender = m.role ?? m.sender ?? "user";
      const role: "user" | "assistant" =
        sender === "assistant" || sender === "nexus" ? "assistant" : "user";
      const content = m.content ?? m.text ?? "";
      return { role, content: String(content) };
    })
    .filter((m) => m.content.trim().length > 0);

  if (messages.length === 0) {
    res.status(400).json({ error: "no_messages" });
    return;
  }

  // Agent override: farklı ajan kimliğiyle çalıştır
  const agentId = (body.agent_id as string | undefined) ?? "nexus_prime";
  const model = getAgentModel(agentId, "claude-sonnet-4-5");
  const systemFromDB = getAgentSystemPrompt(agentId);
  const systemPrompt = systemFromDB ?? NEXUS_PRIME_SYSTEM;

  try {
    const result = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const text = result.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    res.json({
      content: [{ text }],
      model: result.model,
      usage: result.usage,
    });
  } catch (err) {
    logger.error({ err }, "anthropic chat failed");
    const detail = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "chat_failed", detail });
  }
});

export default router;
