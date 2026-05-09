import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import * as ccxt from "ccxt";
import { db, exchangeKeysTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { encryptField, decryptField, maskKey } from "../lib/crypto";

const router: IRouter = Router();

const SUPPORTED_EXCHANGES = ["binance", "bybit", "okx", "kucoin"] as const;

const upsertSchema = z.object({
  exchange: z.enum(SUPPORTED_EXCHANGES),
  label: z.string().min(1).max(40).default("default"),
  apiKey: z.string().min(8).max(256),
  apiSecret: z.string().min(8).max(512),
  apiPassphrase: z.string().max(128).optional(),
  isTestnet: z.boolean().default(false),
});

router.get("/vault/keys", requireAuth, async (req, res) => {
  const userId = req.currentUser!.id;
  const rows = await db
    .select({
      id: exchangeKeysTable.id,
      exchange: exchangeKeysTable.exchange,
      label: exchangeKeysTable.label,
      isTestnet: exchangeKeysTable.isTestnet,
      isActive: exchangeKeysTable.isActive,
      lastVerifiedAt: exchangeKeysTable.lastVerifiedAt,
      lastErrorAt: exchangeKeysTable.lastErrorAt,
      lastError: exchangeKeysTable.lastError,
      apiKeyEncrypted: exchangeKeysTable.apiKeyEncrypted,
      apiKeyIv: exchangeKeysTable.apiKeyIv,
      apiKeyTag: exchangeKeysTable.apiKeyTag,
      createdAt: exchangeKeysTable.createdAt,
      updatedAt: exchangeKeysTable.updatedAt,
    })
    .from(exchangeKeysTable)
    .where(eq(exchangeKeysTable.userId, userId));

  const keys = rows.map((r) => {
    let masked = "****";
    try {
      const apiKey = decryptField({
        ciphertext: r.apiKeyEncrypted,
        iv: r.apiKeyIv,
        tag: r.apiKeyTag,
      });
      masked = maskKey(apiKey);
    } catch {
      masked = "DECRYPT_FAIL";
    }
    return {
      id: r.id,
      exchange: r.exchange,
      label: r.label,
      isTestnet: r.isTestnet,
      isActive: r.isActive,
      apiKeyMasked: masked,
      lastVerifiedAt: r.lastVerifiedAt,
      lastErrorAt: r.lastErrorAt,
      lastError: r.lastError,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });

  res.json({ keys });
});

router.post("/vault/keys", requireAuth, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    return;
  }
  const { exchange, label, apiKey, apiSecret, apiPassphrase, isTestnet } =
    parsed.data;
  const userId = req.currentUser!.id;

  const apiKeyEnc = encryptField(apiKey);
  const apiSecretEnc = encryptField(apiSecret);
  const apiPassEnc = apiPassphrase ? encryptField(apiPassphrase) : null;

  const existing = await db
    .select({ id: exchangeKeysTable.id })
    .from(exchangeKeysTable)
    .where(
      and(
        eq(exchangeKeysTable.userId, userId),
        eq(exchangeKeysTable.exchange, exchange),
        eq(exchangeKeysTable.label, label),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(exchangeKeysTable)
      .set({
        apiKeyEncrypted: apiKeyEnc.ciphertext,
        apiKeyIv: apiKeyEnc.iv,
        apiKeyTag: apiKeyEnc.tag,
        apiSecretEncrypted: apiSecretEnc.ciphertext,
        apiSecretIv: apiSecretEnc.iv,
        apiSecretTag: apiSecretEnc.tag,
        apiPassphraseEncrypted: apiPassEnc?.ciphertext ?? null,
        apiPassphraseIv: apiPassEnc?.iv ?? null,
        apiPassphraseTag: apiPassEnc?.tag ?? null,
        isTestnet,
        isActive: true,
        lastError: null,
        lastErrorAt: null,
      })
      .where(eq(exchangeKeysTable.id, existing[0]!.id));
    res.json({ id: existing[0]!.id, action: "updated" });
    return;
  }

  const id = randomUUID();
  await db.insert(exchangeKeysTable).values({
    id,
    userId,
    exchange,
    label,
    apiKeyEncrypted: apiKeyEnc.ciphertext,
    apiKeyIv: apiKeyEnc.iv,
    apiKeyTag: apiKeyEnc.tag,
    apiSecretEncrypted: apiSecretEnc.ciphertext,
    apiSecretIv: apiSecretEnc.iv,
    apiSecretTag: apiSecretEnc.tag,
    apiPassphraseEncrypted: apiPassEnc?.ciphertext ?? null,
    apiPassphraseIv: apiPassEnc?.iv ?? null,
    apiPassphraseTag: apiPassEnc?.tag ?? null,
    isTestnet,
    isActive: true,
  });
  res.json({ id, action: "created" });
});

router.delete("/vault/keys/:id", requireAuth, async (req, res) => {
  const userId = req.currentUser!.id;
  const id = String(req.params.id ?? "");
  if (!id) { res.status(400).json({ error: "Missing id" }); return; }
  const result = await db
    .delete(exchangeKeysTable)
    .where(
      and(eq(exchangeKeysTable.id, id), eq(exchangeKeysTable.userId, userId)),
    )
    .returning({ id: exchangeKeysTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ id, deleted: true });
});

const verifyCooldown = new Map<string, number>();
const VERIFY_COOLDOWN_MS = 15_000;
const VERIFY_USER_WINDOW_MS = 60_000;
const VERIFY_USER_LIMIT = 6;
const verifyUserHits = new Map<string, number[]>();

router.post("/vault/keys/:id/verify", requireAuth, async (req, res) => {
  const userId = req.currentUser!.id;
  const id = String(req.params.id ?? "");
  if (!id) { res.status(400).json({ error: "Missing id" }); return; }

  const now = Date.now();
  const lastHit = verifyCooldown.get(id) ?? 0;
  if (now - lastHit < VERIFY_COOLDOWN_MS) {
    const retryIn = Math.ceil((VERIFY_COOLDOWN_MS - (now - lastHit)) / 1000);
    res.status(429).json({
      error: `Çok hızlı doğrulama denemesi. ${retryIn}s sonra tekrar dene.`,
      retryAfter: retryIn,
    });
    return;
  }
  const userHits = (verifyUserHits.get(userId) ?? []).filter(
    (t) => now - t < VERIFY_USER_WINDOW_MS,
  );
  if (userHits.length >= VERIFY_USER_LIMIT) {
    res.status(429).json({
      error: `Dakikada en fazla ${VERIFY_USER_LIMIT} doğrulama yapabilirsin.`,
      retryAfter: 60,
    });
    return;
  }
  verifyCooldown.set(id, now);
  userHits.push(now);
  verifyUserHits.set(userId, userHits);
  const rows = await db
    .select()
    .from(exchangeKeysTable)
    .where(
      and(eq(exchangeKeysTable.id, id), eq(exchangeKeysTable.userId, userId)),
    )
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const row = rows[0]!;
  let apiKey: string;
  let apiSecret: string;
  let passphrase: string | undefined;
  try {
    apiKey = decryptField({
      ciphertext: row.apiKeyEncrypted,
      iv: row.apiKeyIv,
      tag: row.apiKeyTag,
    });
    apiSecret = decryptField({
      ciphertext: row.apiSecretEncrypted,
      iv: row.apiSecretIv,
      tag: row.apiSecretTag,
    });
    if (row.apiPassphraseEncrypted && row.apiPassphraseIv && row.apiPassphraseTag) {
      passphrase = decryptField({
        ciphertext: row.apiPassphraseEncrypted,
        iv: row.apiPassphraseIv,
        tag: row.apiPassphraseTag,
      });
    }
  } catch (err) {
    res.status(500).json({ error: "Decrypt failed" });
    return;
  }

  try {
    const ExchangeClass = (ccxt as any)[row.exchange];
    if (!ExchangeClass) {
      res.status(400).json({ error: `Unsupported exchange: ${row.exchange}` });
      return;
    }
    const cfg: any = {
      apiKey,
      secret: apiSecret,
      enableRateLimit: true,
      timeout: 10_000,
    };
    if (passphrase) cfg.password = passphrase;
    const exchange = new ExchangeClass(cfg);
    if (row.isTestnet && typeof exchange.setSandboxMode === "function") {
      exchange.setSandboxMode(true);
    }
    const balance = await exchange.fetchBalance();
    const totals = balance.total ?? {};
    const nonZero: Record<string, number> = {};
    for (const [coin, amt] of Object.entries(totals)) {
      if (typeof amt === "number" && amt > 0) nonZero[coin] = amt;
    }
    await db
      .update(exchangeKeysTable)
      .set({
        lastVerifiedAt: new Date(),
        lastError: null,
        lastErrorAt: null,
      })
      .where(eq(exchangeKeysTable.id, id));
    res.json({
      ok: true,
      verifiedAt: new Date().toISOString(),
      balanceCoins: Object.keys(nonZero).length,
      preview: nonZero,
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    await db
      .update(exchangeKeysTable)
      .set({ lastErrorAt: new Date(), lastError: msg.slice(0, 500) })
      .where(eq(exchangeKeysTable.id, id));
    res.status(400).json({ ok: false, error: msg });
  }
});

export async function getDecryptedUserKey(
  userId: string,
  exchange: string,
): Promise<{ apiKey: string; apiSecret: string; passphrase?: string; isTestnet: boolean } | null> {
  const rows = await db
    .select()
    .from(exchangeKeysTable)
    .where(
      and(
        eq(exchangeKeysTable.userId, userId),
        eq(exchangeKeysTable.exchange, exchange),
        eq(exchangeKeysTable.isActive, true),
      ),
    )
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0]!;
  try {
    const apiKey = decryptField({
      ciphertext: row.apiKeyEncrypted,
      iv: row.apiKeyIv,
      tag: row.apiKeyTag,
    });
    const apiSecret = decryptField({
      ciphertext: row.apiSecretEncrypted,
      iv: row.apiSecretIv,
      tag: row.apiSecretTag,
    });
    let passphrase: string | undefined;
    if (row.apiPassphraseEncrypted && row.apiPassphraseIv && row.apiPassphraseTag) {
      passphrase = decryptField({
        ciphertext: row.apiPassphraseEncrypted,
        iv: row.apiPassphraseIv,
        tag: row.apiPassphraseTag,
      });
    }
    return { apiKey, apiSecret, passphrase, isTestnet: row.isTestnet };
  } catch {
    return null;
  }
}

export default router;
