import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { z } from "zod";
import { db, usersTable, refreshTokensTable, subscriptionsTable, subscriptionPlansTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  setAccessTokenCookie,
  setRefreshTokenCookie,
  clearAuthCookies,
  getRefreshToken,
  REFRESH_TOKEN_TTL_SEC,
} from "../lib/auth";
import { authMiddleware } from "../middlewares/authMiddleware";

const router: IRouter = Router();

// ── Schemas ─────────────────────────────────────────────────────────────────
const RegisterSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
  fullName: z.string().max(100).optional(),
});

const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const OWNER_EMAILS = (process.env.OWNER_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const SALT_ROUNDS = 12;

async function ensureFreeTrialSubscription(userId: string, trialEndsAt: Date): Promise<void> {
  const existing = await db
    .select({ id: subscriptionsTable.id })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId))
    .limit(1);
  if (existing.length > 0) return;

  const freePlan = await db
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.tier, "FREE"))
    .limit(1);
  if (freePlan.length === 0) return;

  await db.insert(subscriptionsTable).values({
    id: randomUUID(),
    userId,
    planId: freePlan[0]!.id,
    status: "trialing",
    billingInterval: "monthly",
    currency: "USD",
    amount: "0",
    trialEndsAt,
    currentPeriodStart: new Date(),
    currentPeriodEnd: trialEndsAt,
  });
}

function issueTokens(res: Response, userId: string, email: string, role: string, plan: string) {
  const accessToken = signAccessToken({ sub: userId, email, role, plan });
  const { token: refreshToken, hash } = generateRefreshToken();

  // Persist refresh token hash
  void db.insert(refreshTokensTable).values({
    id: randomUUID(),
    userId,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000),
  }).catch(() => {});

  setAccessTokenCookie(res, accessToken);
  setRefreshTokenCookie(res, refreshToken);
  return { accessToken, refreshToken };
}

// ── POST /api/auth/register ──────────────────────────────────────────────────
router.post("/auth/register", async (req: Request, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    return;
  }

  const { email, password, fullName } = parsed.data;
  const emailLower = email.toLowerCase();

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, emailLower))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const isOwner     = OWNER_EMAILS.includes(emailLower);
  const role        = isOwner ? "OWNER" : "BASIC_USER";
  const plan        = isOwner ? "ENTERPRISE" : "FREE";
  const planStatus  = isOwner ? "active" : "trialing";
  const trialEndsAt = isOwner ? null : new Date(Date.now() + 7 * 24 * 3600 * 1000);

  const userId = randomUUID();
  await db.insert(usersTable).values({
    id: userId,
    email: emailLower,
    passwordHash,
    fullName: fullName ?? null,
    role,
    plan,
    planStatus,
    trialEndsAt,
    lastSeenAt: new Date(),
  });

  if (!isOwner && trialEndsAt) {
    await ensureFreeTrialSubscription(userId, trialEndsAt);
  }

  issueTokens(res, userId, emailLower, role, plan);
  res.status(201).json({ ok: true });
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post("/auth/login", async (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const { email, password } = parsed.data;
  const emailLower = email.toLowerCase();

  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, emailLower))
    .limit(1);

  const user = rows[0];
  if (!user || !user.passwordHash) {
    // Constant-time guard
    await bcrypt.hash("guard", 1);
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ error: "Account suspended" });
    return;
  }

  void db.update(usersTable).set({ lastSeenAt: new Date() }).where(eq(usersTable.id, user.id)).catch(() => {});

  issueTokens(res, user.id, user.email, user.role, user.plan);
  res.json({ ok: true, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, plan: user.plan } });
});

// ── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post("/auth/refresh", async (req: Request, res: Response) => {
  const rawToken = getRefreshToken(req);
  if (!rawToken) {
    res.status(401).json({ error: "No refresh token" });
    return;
  }

  const hash = hashRefreshToken(rawToken);
  const now  = new Date();

  const tokenRows = await db
    .select()
    .from(refreshTokensTable)
    .where(
      and(
        eq(refreshTokensTable.tokenHash, hash),
        gt(refreshTokensTable.expiresAt, now),
      ),
    )
    .limit(1);

  if (tokenRows.length === 0) {
    clearAuthCookies(res);
    res.status(401).json({ error: "Refresh token invalid or expired" });
    return;
  }

  const tokenRow = tokenRows[0]!;

  // Rotate: delete old, issue new
  await db.delete(refreshTokensTable).where(eq(refreshTokensTable.id, tokenRow.id));

  const userRows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, tokenRow.userId))
    .limit(1);

  const user = userRows[0];
  if (!user || !user.isActive) {
    clearAuthCookies(res);
    res.status(401).json({ error: "User not found or suspended" });
    return;
  }

  issueTokens(res, user.id, user.email, user.role, user.plan);
  res.json({ ok: true });
});

// ── POST /api/auth/logout ────────────────────────────────────────────────────
router.post("/auth/logout", authMiddleware, async (req: Request, res: Response) => {
  const rawToken = getRefreshToken(req);
  if (rawToken) {
    const hash = hashRefreshToken(rawToken);
    await db.delete(refreshTokensTable).where(eq(refreshTokensTable.tokenHash, hash)).catch(() => {});
  }
  clearAuthCookies(res);
  res.json({ ok: true });
});

// ── GET /api/auth/user ───────────────────────────────────────────────────────
router.get("/auth/user", authMiddleware, async (req: Request, res: Response) => {
  if (!req.jwtUser) {
    res.json({ user: null });
    return;
  }

  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      fullName: usersTable.fullName,
      avatarUrl: usersTable.avatarUrl,
      role: usersTable.role,
      plan: usersTable.plan,
      planStatus: usersTable.planStatus,
      trialEndsAt: usersTable.trialEndsAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.jwtUser.sub))
    .limit(1);

  res.json({ user: rows[0] ?? null });
});

export default router;
