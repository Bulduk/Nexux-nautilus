import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { pushTokensTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

function uid(req: Request): string | null {
  return (req as Request & { currentUser?: { id: string } }).currentUser?.id ?? null;
}

const RegisterReq = z.object({
  token: z.string().min(10),
  platform: z.enum(["ios", "android", "web"]),
  deviceName: z.string().max(120).optional(),
  appVersion: z.string().max(40).optional(),
});

const PrefsReq = z.object({
  token: z.string().min(10),
  enabled: z.boolean().optional(),
  signalLevel: z.enum(["all", "high_grade_only"]).optional(),
  notifySignals: z.boolean().optional(),
  notifyFills: z.boolean().optional(),
  notifyCouncil: z.boolean().optional(),
});

/**
 * Cihazı kaydet veya günceller. Atomic upsert (token unique).
 */
router.post("/push/register", async (req, res) => {
  const userId = uid(req);
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const parsed = RegisterReq.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", detail: parsed.error.message });
    return;
  }
  const { token, platform, deviceName, appVersion } = parsed.data;

  try {
    await db
      .insert(pushTokensTable)
      .values({
        id: randomUUID(),
        userId,
        token,
        platform,
        deviceName,
        appVersion,
        enabled: true,
      })
      .onConflictDoUpdate({
        target: pushTokensTable.token,
        set: {
          userId,
          platform,
          deviceName,
          appVersion,
          enabled: true,
          lastSeenAt: sql`now()`,
          updatedAt: sql`now()`,
        },
      });

    // Geri dönüşte mevcut prefs'i de döndür ki client UI'ı senkronize etsin.
    const rows = await db
      .select({
        enabled: pushTokensTable.enabled,
        signalLevel: pushTokensTable.signalLevel,
        notifySignals: pushTokensTable.notifySignals,
        notifyFills: pushTokensTable.notifyFills,
        notifyCouncil: pushTokensTable.notifyCouncil,
      })
      .from(pushTokensTable)
      .where(eq(pushTokensTable.token, token))
      .limit(1);

    res.json({ ok: true, prefs: rows[0] ?? null });
  } catch (err) {
    req.log.error({ err }, "push register failed");
    res.status(500).json({ error: "register_failed" });
  }
});

/**
 * Tercihleri güncelle. POST kullanılır (mobile apiPost ile uyumlu).
 */
router.post("/push/prefs", async (req, res) => {
  const userId = uid(req);
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const parsed = PrefsReq.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_prefs", detail: parsed.error.message });
    return;
  }
  const { token, ...prefs } = parsed.data;
  if (Object.keys(prefs).length === 0) {
    res.json({ ok: true, noop: true });
    return;
  }
  try {
    await db
      .update(pushTokensTable)
      .set({ ...prefs, updatedAt: new Date() })
      .where(and(eq(pushTokensTable.token, token), eq(pushTokensTable.userId, userId)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "push prefs failed");
    res.status(500).json({ error: "prefs_failed" });
  }
});

router.post("/push/unregister", async (req, res) => {
  const userId = uid(req);
  const tokenStr = (req.body as { token?: string }).token;
  if (!userId || !tokenStr) {
    res.status(400).json({ error: "missing" });
    return;
  }
  try {
    await db
      .update(pushTokensTable)
      .set({ enabled: false, updatedAt: new Date() })
      .where(and(eq(pushTokensTable.token, tokenStr), eq(pushTokensTable.userId, userId)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "push unregister failed");
    res.status(500).json({ error: "unregister_failed" });
  }
});

router.post("/push/test", async (req, res) => {
  const userId = uid(req);
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const rows = await db
      .select({ token: pushTokensTable.token })
      .from(pushTokensTable)
      .where(and(eq(pushTokensTable.userId, userId), eq(pushTokensTable.enabled, true)));
    if (rows.length === 0) {
      res.json({ ok: false, reason: "no_devices" });
      return;
    }
    const sent = await sendExpoPush(
      rows.map((r) => r.token),
      {
        title: "Nexus Test",
        body: "Push bildirimleri çalışıyor ✓",
        data: { type: "test" },
      },
    );
    res.json({ ok: true, sent });
  } catch (err) {
    req.log.error({ err }, "push test failed");
    res.status(500).json({ error: "test_failed" });
  }
});

export interface ExpoPushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
}

/**
 * Expo Push API'sine direkt gönder — SDK gereksiz.
 */
export async function sendExpoPush(
  tokens: string[],
  payload: ExpoPushPayload,
): Promise<number> {
  const valid = tokens.filter(
    (t) => t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken["),
  );
  if (valid.length === 0) return 0;
  const messages = valid.map((to) => ({
    to,
    sound: payload.sound ?? "default",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  }));
  try {
    const r = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
    if (!r.ok) {
      logger.warn({ status: r.status }, "expo push http non-ok");
      return 0;
    }
    return valid.length;
  } catch (err) {
    logger.error({ err }, "expo push failed");
    return 0;
  }
}

export default router;
