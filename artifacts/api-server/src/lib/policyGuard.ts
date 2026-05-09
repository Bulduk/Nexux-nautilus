import {
  loadRiskProfile,
  secondsSinceLastTrade,
  getDailyStats,
  type RiskProfile,
} from "./risk";
import { listOpenPositions } from "./ledger";

export interface TradeIntent {
  intentId: string;
  agentSource: string;
  agentSourceKind: "core" | "external";
  symbol: string;
  direction: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT";
  notionalUsd: number;
  qty: number;
  price: number;
  leverage: number;
  confidencePct: number;
  atrPct: number | null;
  decisionTrace: string[];
  ttlSeconds: number;
  createdAt: number;
}

export interface GuardCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface GuardResult {
  ok: boolean;
  checks: GuardCheck[];
  rejectedBy?: string;
  profile: RiskProfile;
}

const recentIntentIds = new Map<string, number>(); // intentId -> ts
const INTENT_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

function cleanupDedupeCache(): void {
  const cutoff = Date.now() - INTENT_DEDUPE_WINDOW_MS;
  for (const [k, v] of recentIntentIds) {
    if (v < cutoff) recentIntentIds.delete(k);
  }
}

export type ExecMode = "live" | "paper" | "dryrun";

export function evaluateIntent(intent: TradeIntent, mode: ExecMode = "live"): GuardResult {
  cleanupDedupeCache();
  const profile = loadRiskProfile();
  const checks: GuardCheck[] = [];

  // 1. Kill-switch & live-armed (live_armed only enforced for real-money mode)
  checks.push({
    name: "kill_switch",
    passed: !profile.killSwitchEngaged,
    detail: profile.killSwitchEngaged
      ? "KILL SWITCH ENGAGED — all trades blocked."
      : "kill switch clear",
  });
  if (mode === "live") {
    checks.push({
      name: "live_armed",
      passed: profile.liveTradingArmed,
      detail: profile.liveTradingArmed
        ? "live trading explicitly armed"
        : "live trading NOT armed (toggle in Risk panel before sending real orders)",
    });
  } else {
    checks.push({
      name: "live_armed",
      passed: true,
      detail: `${mode} mode — live arm not required`,
    });
  }

  // 2. Idempotency
  const dupe = recentIntentIds.has(intent.intentId);
  checks.push({
    name: "idempotency",
    passed: !dupe,
    detail: dupe
      ? `duplicate intent_id ${intent.intentId} seen within 5min`
      : `intent_id ${intent.intentId} fresh`,
  });

  // 3. Confidence floor
  const minConf =
    intent.agentSourceKind === "core"
      ? profile.minConfidenceCore
      : profile.minConfidenceExternal;
  const confOk = intent.confidencePct >= minConf;
  checks.push({
    name: "confidence_floor",
    passed: confOk,
    detail: `conf ${intent.confidencePct.toFixed(1)}% vs floor ${minConf}% (${intent.agentSourceKind})`,
  });

  // 4. Hard leverage ceiling
  const levOk = intent.leverage <= profile.maxLeverage;
  checks.push({
    name: "leverage_ceiling",
    passed: levOk,
    detail: `requested ${intent.leverage}x vs hard cap ${profile.maxLeverage}x`,
  });

  // 5. Position size cap
  const sizeOk = intent.notionalUsd <= profile.maxPositionSizeUsd;
  checks.push({
    name: "position_size_cap",
    passed: sizeOk,
    detail: `notional $${intent.notionalUsd.toFixed(2)} vs cap $${profile.maxPositionSizeUsd}`,
  });

  // 6. Gross exposure cap
  const open = listOpenPositions();
  const grossExposure = open.reduce((s, p) => s + p.notionalUsd, 0);
  const exposureAfter = grossExposure + intent.notionalUsd;
  const expOk = exposureAfter <= profile.maxGrossExposureUsd;
  checks.push({
    name: "gross_exposure",
    passed: expOk,
    detail: `gross $${grossExposure.toFixed(0)} + new $${intent.notionalUsd.toFixed(0)} = $${exposureAfter.toFixed(0)} vs cap $${profile.maxGrossExposureUsd}`,
  });

  // 7. Open positions cap
  const openOk = open.length < profile.maxOpenPositions;
  checks.push({
    name: "open_positions_cap",
    passed: openOk,
    detail: `${open.length} open vs cap ${profile.maxOpenPositions}`,
  });

  // 8. Volatility circuit breaker (ATR%)
  const volOk = intent.atrPct === null || intent.atrPct <= profile.maxAtrPct;
  checks.push({
    name: "volatility_circuit",
    passed: volOk,
    detail: `ATR% ${intent.atrPct?.toFixed(2) ?? "n/a"} vs max ${profile.maxAtrPct.toFixed(2)}%`,
  });

  // 9. Cooldown per symbol
  const sec = secondsSinceLastTrade(intent.symbol);
  const cdOk = sec >= profile.cooldownSecPerSymbol;
  checks.push({
    name: "cooldown",
    passed: cdOk,
    detail: `${Number.isFinite(sec) ? sec.toFixed(0) : "∞"}s since last trade on ${intent.symbol} vs cooldown ${profile.cooldownSecPerSymbol}s`,
  });

  // 10. Daily loss limit & drawdown
  const stats = getDailyStats();
  const lossOk = -stats.realizedPnlUsd <= profile.dailyLossLimitUsd;
  checks.push({
    name: "daily_loss_limit",
    passed: lossOk,
    detail: `today realized PnL $${stats.realizedPnlUsd.toFixed(2)} vs daily loss limit -$${profile.dailyLossLimitUsd}`,
  });
  const ddOk = stats.drawdownPct <= profile.maxDrawdownPct;
  checks.push({
    name: "max_drawdown",
    passed: ddOk,
    detail: `intraday DD ${stats.drawdownPct.toFixed(2)}% vs max ${profile.maxDrawdownPct}%`,
  });

  // 11. TTL sanity
  const ageSec = (Date.now() - intent.createdAt) / 1000;
  const ttlOk = ageSec <= intent.ttlSeconds;
  checks.push({
    name: "intent_ttl",
    passed: ttlOk,
    detail: `intent age ${ageSec.toFixed(1)}s vs TTL ${intent.ttlSeconds}s`,
  });

  const failed = checks.find((c) => !c.passed);
  const ok = !failed;
  if (ok) {
    recentIntentIds.set(intent.intentId, Date.now());
  }

  return {
    ok,
    checks,
    rejectedBy: failed?.name,
    profile,
  };
}
