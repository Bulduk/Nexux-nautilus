/**
 * Council Agent — Ortak Akıl Sistemi
 *
 * 4 ajan (OpenClaw, Mirofish, Betafish, Onyx) bağımsız olarak bir sinyal hakkında
 * oy kullanır. Sonuç, çoğunluk oyu + ortalama güven ile belirlenir.
 * Her ajana farklı model atanabilir (DB'den okunur).
 */
import { anthropic } from "./anthropic";
import { getAgentModel } from "./agentConfigs";
import { db } from "./db";
import { councilVotesTable } from "@workspace/db";
import { logger } from "./logger";

export interface CouncilVote {
  agentId: string;
  agentName: string;
  vote: "APPROVE" | "REJECT" | "ABSTAIN";
  confidence: number;
  reason: string;
  model: string;
}

export interface CouncilDecision {
  sessionId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  approved: boolean;
  voteCount: { approve: number; reject: number; abstain: number };
  avgConfidence: number;
  consensus: "STRONG" | "MAJORITY" | "SPLIT" | "REJECTED";
  votes: CouncilVote[];
  finalReason: string;
  durationMs: number;
}

interface AgentPersona {
  id: string;
  name: string;
  role: string;
  votingFocus: string;
}

const AGENTS: AgentPersona[] = [
  {
    id: "openclaw",
    name: "OpenClaw",
    role: "Execution & Order Routing Specialist",
    votingFocus:
      "Likidite, spread, emir doluş riski, slippage tahmini ve execution zamanlaması.",
  },
  {
    id: "mirofish",
    name: "Mirofish",
    role: "Multi-Timeframe Signal Analyst",
    votingFocus:
      "Teknik göstergeler (RSI, MACD, EMA, ATR), trend yapısı ve confluence skoru.",
  },
  {
    id: "betafish",
    name: "Betafish",
    role: "Arbitrage & Funding Rate Analyst",
    votingFocus:
      "Funding rate, open interest, CVD (cumulative volume delta) ve arbitraj fırsatları.",
  },
  {
    id: "onyx",
    name: "Onyx",
    role: "Market Research & Sentiment Analyst",
    votingFocus:
      "Haber akışı, sosyal sentiment, makro piyasa bağlamı ve döngüsel pozisyon.",
  },
];

function makeSessionId(): string {
  return `council_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

async function askAgent(
  agent: AgentPersona,
  symbol: string,
  direction: "LONG" | "SHORT",
  context: Record<string, unknown>,
  model: string,
): Promise<CouncilVote> {
  const prompt = `Sen ${agent.name}'sın — ${agent.role}.

Aşağıdaki trade teklifini değerlendirmeni istiyorum. Sadece KENDİ UZMANLIK ALANINA odaklan: ${agent.votingFocus}

## Trade Teklifi
- Sembol: ${symbol}
- Yön: ${direction}
- Piyasa Verileri: ${JSON.stringify(context, null, 2)}

## Görev
Yukarıdaki trade için OY VER. Cevabın şu formatta olmalı (JSON):
{
  "vote": "APPROVE" | "REJECT" | "ABSTAIN",
  "confidence": <50-95 arası sayı>,
  "reason": "<tek cümle, kendi uzmanlık açısından gerekçe>"
}

Sadece JSON döndür, başka hiçbir şey yazma.`;

  try {
    const result = await anthropic.messages.create({
      model,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const text = result.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no JSON in response");

    const parsed = JSON.parse(jsonMatch[0]) as {
      vote: "APPROVE" | "REJECT" | "ABSTAIN";
      confidence: number;
      reason: string;
    };

    return {
      agentId: agent.id,
      agentName: agent.name,
      vote: parsed.vote ?? "ABSTAIN",
      confidence: Math.max(50, Math.min(95, Number(parsed.confidence) || 65)),
      reason: String(parsed.reason ?? ""),
      model,
    };
  } catch (err) {
    logger.warn({ err, agentId: agent.id }, "council agent vote failed");
    return {
      agentId: agent.id,
      agentName: agent.name,
      vote: "ABSTAIN",
      confidence: 50,
      reason: `${agent.name} yanıt veremedi — ABSTAIN.`,
      model,
    };
  }
}

export async function runCouncil(
  symbol: string,
  direction: "LONG" | "SHORT",
  context: Record<string, unknown>,
  options: { parallelVoting?: boolean } = {},
): Promise<CouncilDecision> {
  const sessionId = makeSessionId();
  const startMs = Date.now();
  const { parallelVoting = true } = options;

  // Get model for each agent from DB/config
  const votePromises = AGENTS.map((agent) => {
    const model = getAgentModel(agent.id, "claude-haiku-4-5");
    return askAgent(agent, symbol, direction, context, model);
  });

  const votes = parallelVoting
    ? await Promise.all(votePromises)
    : await votePromises.reduce<Promise<CouncilVote[]>>(async (acc, p) => {
        const arr = await acc;
        arr.push(await p);
        return arr;
      }, Promise.resolve([]));

  const approve = votes.filter((v) => v.vote === "APPROVE").length;
  const reject = votes.filter((v) => v.vote === "REJECT").length;
  const abstain = votes.filter((v) => v.vote === "ABSTAIN").length;

  const approvers = votes.filter((v) => v.vote === "APPROVE");
  const avgConfidence =
    approvers.length > 0
      ? approvers.reduce((s, v) => s + v.confidence, 0) / approvers.length
      : 50;

  const approved = approve > reject;
  let consensus: CouncilDecision["consensus"];
  if (approve === AGENTS.length) consensus = "STRONG";
  else if (approve > reject && approve >= 3) consensus = "MAJORITY";
  else if (approve === reject) consensus = "SPLIT";
  else consensus = "REJECTED";

  const finalReason =
    consensus === "STRONG"
      ? `4/4 ajan ONAYLADI — güçlü konsensüs (ort. güven: ${avgConfidence.toFixed(0)}%)`
      : consensus === "MAJORITY"
        ? `${approve}/4 ajan ONAYLADI — çoğunluk kararı (ort. güven: ${avgConfidence.toFixed(0)}%)`
        : consensus === "SPLIT"
          ? `2/4 ajan ONAYLADI, 2/4 REDDETTİ — karar bölündü → REDDEDİLDİ`
          : `${reject}/4 ajan REDDETTİ — ${symbol} ${direction} için yetersiz konsensüs`;

  const decision: CouncilDecision = {
    sessionId,
    symbol,
    direction,
    approved,
    voteCount: { approve, reject, abstain },
    avgConfidence: Number(avgConfidence.toFixed(1)),
    consensus,
    votes,
    finalReason,
    durationMs: Date.now() - startMs,
  };

  // Persist votes to DB
  try {
    await db.insert(councilVotesTable).values(
      votes.map((v) => ({
        sessionId,
        symbol,
        direction,
        agentId: v.agentId,
        vote: v.vote,
        confidence: v.confidence.toString(),
        reason: v.reason,
        model: v.model,
      })),
    );
  } catch (err) {
    logger.warn({ err }, "council votes DB persist failed");
  }

  logger.info(
    { sessionId, symbol, direction, consensus, approve, reject, avgConfidence },
    "council decision",
  );

  return decision;
}
