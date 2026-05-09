/**
 * Agent Configs — DB-backed, her ajana ayrı model ve sistem promptu
 */
import { db } from "./db";
import { agentConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export interface AgentConfig {
  agentId: string;
  name: string;
  source: string;
  role: string;
  model: string;
  systemPrompt?: string;
  enabled: boolean;
  riskLevel: string;
  confidenceThreshold: number;
  capabilities: string[];
  apiEndpoint?: string;
  repoUrl?: string;
  extra: Record<string, unknown>;
}

// Default agent definitions
const DEFAULTS: AgentConfig[] = [
  {
    agentId: "openclaw",
    name: "OpenClaw",
    source: "core",
    role: "executor",
    model: "claude-haiku-4-5",
    systemPrompt:
      "Sen OpenClaw'sun — execution & order routing uzmanısın. Likidite, spread, slippage ve emir doluş riski konularında karar ver. Teknik analiz değil, execution kalitesine odaklan.",
    enabled: true,
    riskLevel: "medium",
    confidenceThreshold: 70,
    capabilities: ["order_routing", "position_management", "execution"],
    extra: {},
  },
  {
    agentId: "mirofish",
    name: "Mirofish",
    source: "core",
    role: "signal",
    model: "claude-sonnet-4-5",
    systemPrompt:
      "Sen Mirofish'sin — multi-timeframe teknik analiz uzmanısın. RSI, MACD, EMA, ATR, Bollinger Bands kullanarak trend ve momentum sinyalleri üret. Confluence skoru hesapla.",
    enabled: true,
    riskLevel: "medium",
    confidenceThreshold: 70,
    capabilities: ["momentum", "structure", "divergence", "multi_timeframe"],
    extra: {},
  },
  {
    agentId: "betafish",
    name: "Betafish",
    source: "core",
    role: "arbitrage",
    model: "claude-haiku-4-5",
    systemPrompt:
      "Sen Betafish'sin — arbitraj ve türev piyasası uzmanısın. Funding rate, open interest, CVD, basis ve cross-exchange spread analizi yap.",
    enabled: true,
    riskLevel: "medium",
    confidenceThreshold: 70,
    capabilities: ["arbitrage", "funding_rate", "derivatives", "cvd"],
    extra: {},
  },
  {
    agentId: "onyx",
    name: "Onyx",
    source: "core",
    role: "research",
    model: "claude-sonnet-4-5",
    systemPrompt:
      "Sen Onyx'sin — piyasa araştırma ve sentiment uzmanısın. Haber akışı, sosyal medya sentiment, makro faktörler ve döngüsel analiz yap. On-chain datayı değerlendir.",
    enabled: true,
    riskLevel: "high",
    confidenceThreshold: 70,
    capabilities: ["sentiment", "news", "research", "onchain", "macro"],
    extra: {},
  },
  {
    agentId: "nexus_prime",
    name: "Nexus Prime",
    source: "core",
    role: "supervisor",
    model: "claude-sonnet-4-5",
    systemPrompt:
      "Sen NEXUS PRIME'sın — tüm sistemin süpervizör ajanısın. Council kararlarını koordine et, patron ile iletişim kur, sistem durumunu raporla. Türkçe iletişim kurarsın.",
    enabled: true,
    riskLevel: "low",
    confidenceThreshold: 85,
    capabilities: ["supervision", "coordination", "reporting", "turkish"],
    extra: {},
  },
];

// In-memory cache
let configCache: Map<string, AgentConfig> | null = null;
let dbReady = false;

async function loadFromDB(): Promise<void> {
  try {
    const rows = await db.select().from(agentConfigsTable);
    if (rows.length === 0) {
      // First run — seed defaults
      await db
        .insert(agentConfigsTable)
        .values(
          DEFAULTS.map((a) => ({
            agentId: a.agentId,
            name: a.name,
            source: a.source,
            role: a.role,
            model: a.model,
            systemPrompt: a.systemPrompt,
            enabled: a.enabled,
            riskLevel: a.riskLevel,
            confidenceThreshold: a.confidenceThreshold.toString(),
            capabilities: a.capabilities,
            extra: a.extra,
          })),
        )
        .onConflictDoNothing();
      configCache = new Map(DEFAULTS.map((a) => [a.agentId, a]));
    } else {
      configCache = new Map(
        rows.map((r) => [
          r.agentId,
          {
            agentId: r.agentId,
            name: r.name,
            source: r.source,
            role: r.role,
            model: r.model,
            systemPrompt: r.systemPrompt ?? undefined,
            enabled: r.enabled,
            riskLevel: r.riskLevel,
            confidenceThreshold: Number(r.confidenceThreshold),
            capabilities: r.capabilities ?? [],
            apiEndpoint: r.apiEndpoint ?? undefined,
            repoUrl: r.repoUrl ?? undefined,
            extra: (r.extra as Record<string, unknown>) ?? {},
          },
        ]),
      );
    }
    dbReady = true;
    logger.info({ count: configCache.size }, "agent configs loaded from DB");
  } catch (err) {
    logger.warn({ err }, "agent configs DB load failed, using defaults");
    configCache = new Map(DEFAULTS.map((a) => [a.agentId, a]));
  }
}

// Bootstrap
loadFromDB().catch(() => {
  configCache = new Map(DEFAULTS.map((a) => [a.agentId, a]));
});

function getCache(): Map<string, AgentConfig> {
  if (!configCache) {
    configCache = new Map(DEFAULTS.map((a) => [a.agentId, a]));
  }
  return configCache;
}

export function getAgentModel(agentId: string, fallback = "claude-haiku-4-5"): string {
  return getCache().get(agentId)?.model ?? fallback;
}

export function getAgentSystemPrompt(agentId: string): string | undefined {
  return getCache().get(agentId)?.systemPrompt;
}

export function listAgentConfigs(): AgentConfig[] {
  return Array.from(getCache().values());
}

export function getAgentConfig(agentId: string): AgentConfig | undefined {
  return getCache().get(agentId);
}

export async function updateAgentConfig(
  agentId: string,
  updates: Partial<Omit<AgentConfig, "agentId">>,
): Promise<AgentConfig> {
  const cache = getCache();
  const current = cache.get(agentId);
  const base = current ?? DEFAULTS.find((d) => d.agentId === agentId) ?? {
    agentId,
    name: agentId,
    source: "custom",
    role: "worker",
    model: "claude-haiku-4-5",
    enabled: true,
    riskLevel: "medium",
    confidenceThreshold: 70,
    capabilities: [],
    extra: {},
  };

  const next: AgentConfig = { ...base, ...updates };
  cache.set(agentId, next);

  if (dbReady) {
    await db
      .insert(agentConfigsTable)
      .values({
        agentId: next.agentId,
        name: next.name,
        source: next.source,
        role: next.role,
        model: next.model,
        systemPrompt: next.systemPrompt,
        enabled: next.enabled,
        riskLevel: next.riskLevel,
        confidenceThreshold: next.confidenceThreshold.toString(),
        capabilities: next.capabilities,
        apiEndpoint: next.apiEndpoint,
        repoUrl: next.repoUrl,
        extra: next.extra,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: agentConfigsTable.agentId,
        set: {
          name: next.name,
          model: next.model,
          systemPrompt: next.systemPrompt,
          enabled: next.enabled,
          riskLevel: next.riskLevel,
          confidenceThreshold: next.confidenceThreshold.toString(),
          capabilities: next.capabilities,
          extra: next.extra,
          updatedAt: new Date(),
        },
      });
  }

  return next;
}
