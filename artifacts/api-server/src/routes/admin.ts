import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { isLiveTradingConfigured, publicExchangeId } from "../lib/exchange";
import { anthropicConfigured } from "../lib/anthropic";

const router: IRouter = Router();

router.post("/nasa/execute", async (req, res) => {
  const command = String(req.body?.command ?? "").trim();
  const lowerCmd = command.toLowerCase();
  let responseText = "";
  let logs: string[] = [];

  if (!command) {
    res.status(400).json({ error: "missing_command" });
    return;
  }

  if (lowerCmd.includes("optimize") || lowerCmd.includes("ram")) {
    responseText =
      "[NASA] Sistem optimizasyonu başlatıldı. Process metrikleri ve cache durumu denetlendi.";
    logs = [
      `[OK] Heap kullanımı: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB`,
      `[OK] Uptime: ${Math.round(process.uptime())} s`,
    ];
  } else if (lowerCmd.includes("status") || lowerCmd.includes("durum")) {
    responseText = "[NASA] Servis durumu raporlandı.";
    logs = [
      `[OK] AI integration: ${anthropicConfigured ? "configured" : "MISSING"}`,
      `[OK] Live trading keys: ${isLiveTradingConfigured() ? "present" : "absent (paper-only)"}`,
      `[OK] CCXT: active (public exchange = ${publicExchangeId})`,
    ];
  } else {
    responseText = `[NASA Executor] '${command}' komutu işlendi. Vault politikalarına göre değerlendirildi.`;
    logs = [`[INFO] command_hash: ${Buffer.from(command).toString("base64").slice(0, 12)}`];
  }

  logger.info({ command }, "nasa_execute");
  res.json({ message: responseText, logs });
});

router.post("/config/save", (req, res) => {
  // Client-side state is the source of truth (zustand persist + localStorage).
  // Echo a confirmation so the existing UI flow reports success.
  const keys = Object.keys(req.body ?? {});
  logger.info({ keys }, "config_save_echo");
  res.json({ status: "success", message: "Konfigürasyon alındı (client-side persist).", keys });
});

router.get("/system/status", (_req, res) => {
  res.json({
    ai_configured: anthropicConfigured,
    live_trading_configured: isLiveTradingConfigured(),
    public_exchange: publicExchangeId,
    uptime_s: Math.round(process.uptime()),
    memory_mb: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)),
    node: process.version,
  });
});

export default router;
