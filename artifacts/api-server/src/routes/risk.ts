import { Router, type IRouter } from "express";
import {
  loadRiskProfile,
  saveRiskProfile,
  setKillSwitch,
  armLiveTrading,
  getDailyStats,
  recordEquitySnapshot,
  setExecutionMode,
  type ExecutionMode,
} from "../lib/risk";
import { listOpenPositions, appendEntry } from "../lib/ledger";

const router: IRouter = Router();

router.get("/risk/profile", (_req, res) => {
  res.json(loadRiskProfile());
});

router.post("/risk/profile", (req, res) => {
  const body = req.body ?? {};
  const next = saveRiskProfile(body);
  appendEntry({ type: "note", detail: "risk profile updated", data: { ...body } });
  res.json(next);
});

router.post("/risk/kill", (req, res) => {
  const engaged = Boolean(req.body?.engaged ?? true);
  const next = setKillSwitch(engaged);
  appendEntry({
    type: "kill",
    detail: engaged ? "KILL SWITCH engaged — all live orders blocked" : "kill switch released",
  });
  res.json(next);
});

router.post("/risk/arm", (req, res) => {
  const armed = Boolean(req.body?.armed ?? true);
  const next = armLiveTrading(armed);
  appendEntry({
    type: "note",
    detail: armed ? "live trading ARMED" : "live trading disarmed",
  });
  res.json(next);
});

/**
 * POST /api/risk/mode
 * Body: { mode: "paper" | "semi" | "auto_confirm" | "full_auto" }
 *
 * Mod açıklamaları:
 *   paper        — Tüm emirler simülasyon, gerçek para harcanmaz
 *   semi         — Sinyaller üretilir, kullanıcı manuel onaylar
 *   auto_confirm — Sinyal üretilir, 10sn onay penceresi açılır, iptal etmezsen gönderilir
 *   full_auto    — Tam otonom, her şeyi sistem yapar
 */
router.post("/risk/mode", (req, res) => {
  const mode = req.body?.mode as ExecutionMode | undefined;
  const validModes: ExecutionMode[] = ["paper", "semi", "auto_confirm", "full_auto"];

  if (!mode || !validModes.includes(mode)) {
    res.status(400).json({
      error: "invalid_mode",
      valid: validModes,
      current: loadRiskProfile().executionMode,
    });
    return;
  }

  const next = setExecutionMode(mode);
  appendEntry({
    type: "note",
    detail: `execution mode changed → ${mode}`,
    data: { mode },
  });

  const modeDescriptions: Record<ExecutionMode, string> = {
    paper: "Paper trading — tüm emirler simülasyon",
    semi: "Semi-auto — sinyaller üretilir, manuel onay gerekir",
    auto_confirm: "Auto-confirm — 10sn onay penceresi, sessiz kalırsan emir gönderilir",
    full_auto: "Full-auto — tam otonom execution",
  };

  res.json({
    ok: true,
    mode,
    description: modeDescriptions[mode],
    profile: next,
  });
});

router.get("/risk/status", (_req, res) => {
  const profile = loadRiskProfile();
  const stats = getDailyStats();
  const open = listOpenPositions();
  const grossExposure = open.reduce((s, p) => s + p.notionalUsd, 0);

  const modeDescriptions: Record<string, string> = {
    paper: "Paper trading",
    semi: "Semi-auto (manuel onay)",
    auto_confirm: "Auto-confirm (10sn pencere)",
    full_auto: "Tam otonom",
  };

  res.json({
    profile,
    stats,
    open_positions: open.length,
    gross_exposure_usd: Number(grossExposure.toFixed(2)),
    daily_loss_remaining_usd: Math.max(0, profile.dailyLossLimitUsd + stats.realizedPnlUsd),
    capacity_remaining_usd: Math.max(0, profile.maxGrossExposureUsd - grossExposure),
    execution_mode: profile.executionMode,
    execution_mode_description: modeDescriptions[profile.executionMode] ?? profile.executionMode,
  });
});

router.post("/risk/equity-snapshot", (req, res) => {
  const equity = Number(req.body?.equity_usd ?? 0);
  if (Number.isFinite(equity) && equity > 0) recordEquitySnapshot(equity);
  res.json({ ok: true });
});

export default router;
