import { Router, type IRouter } from "express";
import {
  listAgentConfigs,
  getAgentConfig,
  updateAgentConfig,
  getAgentModel,
} from "../lib/agentConfigs";

export { getAgentModel };

const router: IRouter = Router();

// GET /api/agents — tüm ajanlıarı listele
router.get("/agents", (_req, res) => {
  const agents = listAgentConfigs().map((a) => ({
    id: a.agentId,
    name: a.name,
    source: a.source,
    role: a.role,
    model: a.model,
    prompt: a.systemPrompt ?? "",
    enabled: a.enabled,
    risk_level: a.riskLevel,
    confidence_threshold: a.confidenceThreshold,
    capabilities: a.capabilities,
    api_endpoint: a.apiEndpoint,
    repo_url: a.repoUrl,
    extra: a.extra,
  }));
  res.json(agents);
});

// GET /api/agents/config — tüm ajan configlerini döndür
router.get("/agents/config", (_req, res) => {
  const agents = listAgentConfigs();
  res.json({ agents });
});

/**
 * POST /api/agents/config
 * Body: { agentId, model?, enabled?, systemPrompt?, confidenceThreshold?, ... }
 * Her ajana ayrı model, prompt ve threshold atanabilir.
 *
 * Desteklenen modeller:
 * - claude-haiku-4-5          (hızlı, ucuz — execution/arbitrage için)
 * - claude-sonnet-4-5         (dengeli — signal/research için)
 * - claude-sonnet-4-20250514  (en güçlü claude)
 * - claude-opus-4-5           (en kapsamlı, yavaş)
 */
router.post("/agents/config", async (req, res) => {
  const {
    agentId,
    model,
    enabled,
    systemPrompt,
    confidenceThreshold,
    riskLevel,
    capabilities,
    delegation,
    memory,
    backtesting,
    tasks,
    apiEndpoint,
    repoUrl,
  } = req.body ?? {};

  if (!agentId || typeof agentId !== "string") {
    res.status(400).json({ error: "agentId (string) required" });
    return;
  }

  const patch: Record<string, unknown> = {};
  if (model !== undefined) patch["model"] = String(model);
  if (enabled !== undefined) patch["enabled"] = Boolean(enabled);
  if (systemPrompt !== undefined) patch["systemPrompt"] = String(systemPrompt);
  if (confidenceThreshold !== undefined)
    patch["confidenceThreshold"] = Math.max(50, Math.min(100, Number(confidenceThreshold)));
  if (riskLevel !== undefined) patch["riskLevel"] = String(riskLevel);
  if (capabilities !== undefined && Array.isArray(capabilities))
    patch["capabilities"] = capabilities.map(String);
  if (apiEndpoint !== undefined) patch["apiEndpoint"] = String(apiEndpoint);
  if (repoUrl !== undefined) patch["repoUrl"] = String(repoUrl);

  // UI-only extras (delegation, memory, etc.)
  const currentExtra = getAgentConfig(agentId)?.extra ?? {};
  const extra = { ...currentExtra };
  if (delegation !== undefined) extra["delegation"] = Boolean(delegation);
  if (memory !== undefined) extra["memory"] = Boolean(memory);
  if (backtesting !== undefined) extra["backtesting"] = Boolean(backtesting);
  if (tasks !== undefined) extra["tasks"] = tasks;
  if (Object.keys(extra).length > 0) patch["extra"] = extra;

  try {
    const updated = await updateAgentConfig(agentId, patch as Parameters<typeof updateAgentConfig>[1]);
    req.log.info({ agentId, patch: Object.keys(patch) }, "agent config updated");
    res.json({
      agent: {
        id: updated.agentId,
        ...updated,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "update_failed", detail: String(err) });
  }
});

// POST /api/agents/add/repo — repo/plugin ekleme
router.post("/agents/add/repo", async (req, res) => {
  const {
    repo_url = "",
    name = "",
    role = "worker",
    confidence_threshold = 85,
    target_agent,
    preflight_only,
  } = req.body ?? {};

  const lowerUrl = String(repo_url).toLowerCase();
  const isModel =
    lowerUrl.includes("model") ||
    lowerUrl.includes("nim") ||
    lowerUrl.includes("vllm") ||
    lowerUrl.includes("llama") ||
    lowerUrl.includes("deepseek");
  const isTool =
    lowerUrl.includes("tool") ||
    lowerUrl.includes("plugin") ||
    lowerUrl.includes("freqtrade");
  const repoType = isModel ? "model" : isTool ? "tool" : "agent";
  const displayType = isModel
    ? "Local Inference Resource (Model)"
    : isTool
      ? "Tool/Plugin"
      : "Autonomous Agent";

  const threshold = Number(confidence_threshold) || 85;

  if (preflight_only) {
    if (threshold < 85 && !isModel) {
      res.json({
        status: "rejected",
        analysis: `[Pre-flight Check] PolicyGuard: Güven eşiği (%85) sağlanamadı. ${displayType} manuel inceleme gerektiriyor.`,
      });
      return;
    }
    res.json({
      status: "success",
      repo_type: repoType,
      display_type: displayType,
      analysis: `[Pre-flight Check] Repo: ${displayType}. Hedef Ajan: ${target_agent || "Tümü"}.`,
    });
    return;
  }

  if (threshold < 85 && !isModel) {
    res.status(403).json({
      status: "rejected",
      reason: "PolicyGuard: Minimum %85 güven sınırı aşılamadı.",
      rollback: true,
    });
    return;
  }

  if (!name) {
    res.status(400).json({ status: "error", reason: "name_required" });
    return;
  }

  const agentId =
    String(name).toLowerCase().replace(/[^a-z0-9]/g, "_") +
    "_" +
    Math.floor(Math.random() * 1000);

  try {
    const newAgent = await updateAgentConfig(agentId, {
      name: String(name),
      source: "plugin",
      role: String(role),
      model: "claude-haiku-4-5",
      enabled: true,
      riskLevel: "medium",
      confidenceThreshold: threshold,
      capabilities: ["multi-agent-automation"],
      repoUrl: String(repo_url),
    });

    res.json({
      status: "success",
      message: `UnifiedInstallerService: ${displayType} kaydedildi.`,
      entity: newAgent,
      repoType,
    });
  } catch (err) {
    res.status(500).json({ status: "error", detail: String(err) });
  }
});

export default router;
