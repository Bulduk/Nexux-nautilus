import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db,
  usersTable,
  subscriptionsTable,
  subscriptionPlansTable,
  type User,
} from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      currentUser?: import("@workspace/db").User;
    }
  }
}

const userCache = new Map<string, { user: User; cachedAt: number }>();
const USER_CACHE_TTL_MS = 15_000;

const OWNER_EMAILS = (process.env.OWNER_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

async function ensureFreeTrialSubscription(
  userId: string,
  trialEndsAt: Date,
): Promise<void> {
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

async function upsertUserFromReplit(
  replitUserId: string,
  claims: { email?: string | null; fullName?: string | null; avatarUrl?: string | null },
): Promise<User | null> {
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.replitUserId, replitUserId))
    .limit(1);

  if (existing.length > 0) {
    const user = existing[0]!;
    void db
      .update(usersTable)
      .set({ lastSeenAt: new Date() })
      .where(eq(usersTable.id, user.id))
      .catch(() => {});
    return user;
  }

  const email = claims.email ?? `${replitUserId}@replit.local`;
  const isOwner = OWNER_EMAILS.includes(email.toLowerCase());
  const role = isOwner ? "OWNER" : "BASIC_USER";
  const plan = isOwner ? "ENTERPRISE" : "FREE";
  const planStatus = isOwner ? "active" : "trialing";

  const trialDays = 7;
  const trialEndsAt = new Date(Date.now() + trialDays * 24 * 3600 * 1000);

  const id = randomUUID();
  const inserted = await db
    .insert(usersTable)
    .values({
      id,
      replitUserId,
      email,
      fullName: claims.fullName ?? null,
      avatarUrl: claims.avatarUrl ?? null,
      role,
      plan,
      planStatus,
      trialEndsAt: isOwner ? null : trialEndsAt,
      lastSeenAt: new Date(),
    })
    .onConflictDoNothing({ target: usersTable.replitUserId })
    .returning();

  let user: User;
  if (inserted.length > 0) {
    user = inserted[0]!;
  } else {
    const refetch = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.replitUserId, replitUserId))
      .limit(1);
    if (refetch.length === 0) return null;
    user = refetch[0]!;
  }

  if (!isOwner) {
    await ensureFreeTrialSubscription(user.id, trialEndsAt);
  }

  return user;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const replitUserId = req.user.id;

    const cached = userCache.get(replitUserId);
    if (cached && Date.now() - cached.cachedAt < USER_CACHE_TTL_MS) {
      req.currentUser = cached.user;
      next();
      return;
    }

    const user = await upsertUserFromReplit(replitUserId, {
      email: req.user.email,
      fullName: [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") || null,
      avatarUrl: req.user.profileImageUrl,
    });

    if (!user) {
      res.status(401).json({ error: "User sync failed" });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: "Account suspended", reason: user.bannedReason });
      return;
    }

    userCache.set(replitUserId, { user, cachedAt: Date.now() });
    req.currentUser = user;
    next();
  } catch (err) {
    req.log?.error({ err }, "requireAuth failed");
    res.status(500).json({ error: "Auth middleware error" });
  }
}

export function requireOwner(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.currentUser?.role !== "OWNER") {
    res.status(403).json({ error: "Owner only" });
    return;
  }
  next();
}

export function requireProUser(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const role = req.currentUser?.role;
  if (role !== "OWNER" && role !== "ADMIN" && role !== "PRO_USER") {
    res.status(403).json({
      error: "Pro plan required",
      upgrade: true,
      message: "Bu özellik PRO veya üzeri abonelik gerektirir",
    });
    return;
  }
  next();
}

export function clearUserCache(replitUserId?: string): void {
  if (replitUserId) {
    userCache.delete(replitUserId);
  } else {
    userCache.clear();
  }
}
