import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger";
import { db } from "./db";
import { riskProfileTable, dailyPnlTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type ExecutionMode = "paper" | "semi" | "auto_confirm" | "full_auto";

export interface RiskProfile {
  maxLeverage: number;
  maxPositionSizeUsd: number;
  maxGrossExposureUsd: number;
  maxOpenPositions: number;
  dailyLossLimitUsd: number;
  maxDrawdownPct: number;
  minConfidenceCore: number;
  minConfidenceExternal: number;
  cooldownSecPerSymbol: number;
  maxAtrPct: number;
  killSwitchEngaged: boolean;
  liveTradingArmed: boolean;
  executionMode: ExecutionMode;
  updatedAt: number;
}

const DEFAULT_PROFILE: RiskProfile = {
  maxLeverage: 3,
  maxPositionSizeUsd: 250,
  maxGrossExposureUsd: 1000,
  maxOpenPositions: 4,
  dailyLossLimitUsd: 100,
  maxDrawdownPct: 15,
  minConfidenceCore: 70,
  minConfidenceExternal: 85,
  cooldownSecPerSymbol: 60,
  maxAtrPct: 4.0,
  killSwitchEngaged: false,
  liveTradingArmed: false,
  executionMode: "paper",
  updatedAt: Date.now(),
};

const DATA_DIR = path.resolve(process.cwd(), "data");
const RISK_FILE = path.join(DATA_DIR, "risk-profile.json");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

let cachedProfile: RiskProfile | null = null;
let dbReady = false;

async function loadFromDB(): Promise<void> {
  try {
    const rows = await db.select().from(riskProfileTable).where(eq(riskProfileTable.id, 1));
    if (rows.length > 0 && rows[0]) {
      const r = rows[0];
      cachedProfile = {
        maxLeverage: Number(r.maxLeverage),
        maxPositionSizeUsd: Number(r.maxPositionSizeUsd),
        maxGrossExposureUsd: Number(r.maxGrossExposureUsd),
        maxOpenPositions: r.maxOpenPositions,
        dailyLossLimitUsd: Number(r.dailyLossLimitUsd),
        maxDrawdownPct: Number(r.maxDrawdownPct),
        minConfidenceCore: Number(r.minConfidenceCore),
        minConfidenceExternal: Number(r.minConfidenceExternal),
        cooldownSecPerSymbol: r.cooldownSecPerSymbol,
        maxAtrPct: Number(r.maxAtrPct),
        killSwitchEngaged: r.killSwitchEngaged,
        liveTradingArmed: r.liveTradingArmed,
        executionMode: (r.executionMode as ExecutionMode) ?? "paper",
        updatedAt: r.updatedAt ? new Date(r.updatedAt).getTime() : Date.now(),
      };
      dbReady = true;
      logger.info({ executionMode: cachedProfile.executionMode }, "risk profile loaded from DB");
    }
  } catch (err) {
    logger.warn({ err }, "risk profile DB load failed, using file/defaults");
    loadFromFile();
  }
}

function loadFromFile(): void {
  try {
    if (fs.existsSync(RISK_FILE)) {
      const raw = JSON.parse(fs.readFileSync(RISK_FILE, "utf8")) as Partial<RiskProfile>;
      cachedProfile = { ...DEFAULT_PROFILE, ...raw };
      return;
    }
  } catch (err) {
    logger.warn({ err }, "risk profile file load failed; using defaults");
  }
  cachedProfile = { ...DEFAULT_PROFILE };
}

// Bootstrap
loadFromDB().catch(() => loadFromFile());

export function loadRiskProfile(): RiskProfile {
  if (cachedProfile) return cachedProfile;
  loadFromFile();
  return cachedProfile ?? { ...DEFAULT_PROFILE };
}

export function saveRiskProfile(updates: Partial<RiskProfile>): RiskProfile {
  ensureDataDir();
  const current = loadRiskProfile();
  const next: RiskProfile = { ...current, ...updates, updatedAt: Date.now() };
  // Clamp values
  next.maxLeverage = Math.max(1, Math.min(20, next.maxLeverage));
  next.maxPositionSizeUsd = Math.max(0, next.maxPositionSizeUsd);
  next.maxGrossExposureUsd = Math.max(next.maxPositionSizeUsd, next.maxGrossExposureUsd);
  next.maxOpenPositions = Math.max(1, Math.min(50, Math.floor(next.maxOpenPositions)));
  next.dailyLossLimitUsd = Math.max(0, next.dailyLossLimitUsd);
  next.maxDrawdownPct = Math.max(0, Math.min(100, next.maxDrawdownPct));
  next.minConfidenceCore = Math.max(50, Math.min(100, next.minConfidenceCore));
  next.minConfidenceExternal = Math.max(60, Math.min(100, next.minConfidenceExternal));
  next.cooldownSecPerSymbol = Math.max(0, next.cooldownSecPerSymbol);
  next.maxAtrPct = Math.max(0.1, Math.min(20, next.maxAtrPct));
  cachedProfile = next;

  // Persist to file
  fs.writeFileSync(RISK_FILE, JSON.stringify(next, null, 2));

  // Persist to DB async
  if (dbReady) {
    db.update(riskProfileTable)
      .set({
        maxLeverage: next.maxLeverage.toString(),
        maxPositionSizeUsd: next.maxPositionSizeUsd.toString(),
        maxGrossExposureUsd: next.maxGrossExposureUsd.toString(),
        maxOpenPositions: next.maxOpenPositions,
        dailyLossLimitUsd: next.dailyLossLimitUsd.toString(),
        maxDrawdownPct: next.maxDrawdownPct.toString(),
        minConfidenceCore: next.minConfidenceCore.toString(),
        minConfidenceExternal: next.minConfidenceExternal.toString(),
        cooldownSecPerSymbol: next.cooldownSecPerSymbol,
        maxAtrPct: next.maxAtrPct.toString(),
        killSwitchEngaged: next.killSwitchEngaged,
        liveTradingArmed: next.liveTradingArmed,
        executionMode: next.executionMode,
        updatedAt: new Date(),
      })
      .where(eq(riskProfileTable.id, 1))
      .catch((err) => logger.warn({ err }, "risk profile DB update failed"));
  }
  return next;
}

export function setKillSwitch(engaged: boolean): RiskProfile {
  return saveRiskProfile({ killSwitchEngaged: engaged });
}

export function armLiveTrading(armed: boolean): RiskProfile {
  return saveRiskProfile({ liveTradingArmed: armed });
}

export function setExecutionMode(mode: ExecutionMode): RiskProfile {
  // Auto-arm live trading when switching to real modes
  const armed = mode !== "paper";
  return saveRiskProfile({ executionMode: mode, liveTradingArmed: armed });
}

// --- Position sizing — fractional Kelly ---
export interface SizingInput {
  equityUsd: number;
  confidencePct: number;
  atrPct: number | null;
  edgePct?: number;
  price: number;
}

export interface SizingResult {
  notionalUsd: number;
  qty: number;
  kellyFraction: number;
  reason: string;
}

export function computePositionSize(input: SizingInput, profile: RiskProfile): SizingResult {
  const { equityUsd, confidencePct, atrPct, price } = input;
  const conf = Math.max(0, Math.min(100, confidencePct)) / 100;
  const winProb = 0.5 + (conf - 0.5) * 0.6;
  const winLossRatio = 1.6;
  const kellyRaw = winProb - (1 - winProb) / winLossRatio;
  const kelly = Math.max(0, kellyRaw) * 0.25;

  let volScalar = 1;
  if (atrPct !== null) {
    if (atrPct >= 4) volScalar = 0.25;
    else if (atrPct >= 2) volScalar = 0.5;
    else if (atrPct >= 1) volScalar = 0.8;
  }

  const proposedNotional = equityUsd * kelly * volScalar;
  const cappedByPosition = Math.min(proposedNotional, profile.maxPositionSizeUsd);
  const finalNotional = Math.max(0, cappedByPosition);
  const qty = price > 0 ? finalNotional / price : 0;

  const reason =
    `kelly·0.25 = ${(kelly * 100).toFixed(2)}% of equity ($${equityUsd.toFixed(0)}) ` +
    `× vol_scalar ${volScalar.toFixed(2)} (ATR% ${atrPct?.toFixed(2) ?? "n/a"}) ` +
    `→ $${proposedNotional.toFixed(2)}; capped at user max $${profile.maxPositionSizeUsd}.`;

  return { notionalUsd: finalNotional, qty, kellyFraction: kelly * volScalar, reason };
}

// --- Daily PnL tracking (DB-backed, in-memory cache) ---
interface DailyStats {
  isoDate: string;
  realizedPnlUsd: number;
  tradeCount: number;
  highWaterEquity: number;
}

let dailyStats: DailyStats = {
  isoDate: new Date().toISOString().slice(0, 10),
  realizedPnlUsd: 0,
  tradeCount: 0,
  highWaterEquity: 0,
};

// Load today's stats from DB on startup
async function loadDailyStats(): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await db.select().from(dailyPnlTable).where(eq(dailyPnlTable.isoDate, today));
    if (rows.length > 0 && rows[0]) {
      const r = rows[0];
      dailyStats = {
        isoDate: today,
        realizedPnlUsd: Number(r.realizedPnlUsd),
        tradeCount: r.tradeCount,
        highWaterEquity: Number(r.highWaterEquity),
      };
      logger.info({ dailyStats }, "daily PnL loaded from DB");
    }
  } catch (err) {
    logger.warn({ err }, "daily PnL DB load failed");
  }
}
loadDailyStats().catch(() => {});

function rollIfNewDay(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyStats.isoDate !== today) {
    dailyStats = {
      isoDate: today,
      realizedPnlUsd: 0,
      tradeCount: 0,
      highWaterEquity: dailyStats.highWaterEquity,
    };
  }
}

function persistDailyStats(): void {
  if (!dbReady) return;
  db.insert(dailyPnlTable)
    .values({
      isoDate: dailyStats.isoDate,
      realizedPnlUsd: dailyStats.realizedPnlUsd.toString(),
      tradeCount: dailyStats.tradeCount,
      highWaterEquity: dailyStats.highWaterEquity.toString(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: dailyPnlTable.isoDate,
      set: {
        realizedPnlUsd: dailyStats.realizedPnlUsd.toString(),
        tradeCount: dailyStats.tradeCount,
        highWaterEquity: dailyStats.highWaterEquity.toString(),
        updatedAt: new Date(),
      },
    })
    .catch((err) => logger.warn({ err }, "daily PnL DB persist failed"));
}

export function recordTradePnl(pnlUsd: number): void {
  rollIfNewDay();
  dailyStats.realizedPnlUsd += pnlUsd;
  dailyStats.tradeCount += 1;
  persistDailyStats();
}

export function recordEquitySnapshot(equityUsd: number): void {
  if (equityUsd > dailyStats.highWaterEquity) {
    dailyStats.highWaterEquity = equityUsd;
    persistDailyStats();
  }
}

export function getDailyStats(): DailyStats & { drawdownPct: number } {
  rollIfNewDay();
  const dd =
    dailyStats.highWaterEquity > 0
      ? Math.max(
          0,
          (dailyStats.highWaterEquity -
            (dailyStats.highWaterEquity + dailyStats.realizedPnlUsd)) /
            dailyStats.highWaterEquity,
        ) * 100
      : 0;
  return { ...dailyStats, drawdownPct: dd };
}

// --- Cooldown tracking per symbol ---
const lastTradeAt = new Map<string, number>();
export function recordTradeAt(symbol: string): void {
  lastTradeAt.set(symbol, Date.now());
}
export function secondsSinceLastTrade(symbol: string): number {
  const t = lastTradeAt.get(symbol);
  if (!t) return Infinity;
  return (Date.now() - t) / 1000;
}
