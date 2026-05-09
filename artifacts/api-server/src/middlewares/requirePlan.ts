import type { Request, Response, NextFunction, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  subscriptionsTable,
  subscriptionPlansTable,
  type Subscription,
  type SubscriptionPlan,
} from "@workspace/db";

export type Tier = "FREE" | "PRO" | "ELITE" | "ENTERPRISE";

const TIER_RANK: Record<Tier, number> = {
  FREE: 0,
  PRO: 1,
  ELITE: 2,
  ENTERPRISE: 3,
};

declare global {
  namespace Express {
    interface Request {
      activeTier?: Tier;
      activeSubscription?: Subscription | null;
      activePlan?: SubscriptionPlan | null;
    }
  }
}

type CacheEntry = {
  tier: Tier;
  subscription: Subscription | null;
  plan: SubscriptionPlan | null;
  cachedAt: number;
};

const planCache = new Map<string, CacheEntry>();
const PLAN_CACHE_TTL_MS = 15_000;

function isTrialExpired(sub: Subscription | null): boolean {
  if (!sub) return false;
  if (sub.status !== "trialing") return false;
  if (!sub.trialEndsAt) return false;
  return new Date(sub.trialEndsAt).getTime() < Date.now();
}

function isPeriodExpired(sub: Subscription | null): boolean {
  if (!sub) return false;
  // Trialing subscriptions are gated by trialEndsAt instead of currentPeriodEnd.
  if (sub.status === "trialing") return isTrialExpired(sub);
  // Active / past_due crypto and Stripe subs MUST have a non-expired period.
  if (!sub.currentPeriodEnd) return false; // no period set yet (e.g. just created) → don't expire
  return new Date(sub.currentPeriodEnd).getTime() < Date.now();
}

function isPaidActive(sub: Subscription | null): boolean {
  if (!sub) return false;
  if (!["active", "trialing", "past_due"].includes(sub.status)) return false;
  // Crypto buys a fixed period; once that ends, entitlement is revoked even
  // if status is still "active" (no recurring webhook to flip it).
  if (isPeriodExpired(sub)) return false;
  return true;
}

async function loadActivePlan(userId: string): Promise<CacheEntry> {
  const rows = await db
    .select({
      sub: subscriptionsTable,
      plan: subscriptionPlansTable,
    })
    .from(subscriptionsTable)
    .leftJoin(
      subscriptionPlansTable,
      eq(subscriptionsTable.planId, subscriptionPlansTable.id),
    )
    .where(eq(subscriptionsTable.userId, userId))
    .limit(1);

  const sub = rows[0]?.sub ?? null;
  const plan = rows[0]?.plan ?? null;

  // Effective tier: paid+active → plan.tier; trial-expired → FREE; no sub → FREE.
  let tier: Tier = "FREE";
  if (sub && plan && isPaidActive(sub) && !isTrialExpired(sub)) {
    tier = (plan.tier as Tier) ?? "FREE";
  }

  return { tier, subscription: sub, plan, cachedAt: Date.now() };
}

/**
 * Resolves the active tier for `req.currentUser` and attaches:
 *   req.activeTier, req.activeSubscription, req.activePlan
 *
 * Must be mounted AFTER `requireAuth`. OWNER role bypass is handled here so
 * downstream `requirePlan(...)` checks always succeed for owners.
 */
export const attachPlan: RequestHandler = async (req, res, next) => {
  try {
    const user = req.currentUser;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (user.role === "OWNER") {
      req.activeTier = "ENTERPRISE";
      req.activeSubscription = null;
      req.activePlan = null;
      next();
      return;
    }

    const cached = planCache.get(user.id);
    let entry: CacheEntry;
    if (cached && Date.now() - cached.cachedAt < PLAN_CACHE_TTL_MS) {
      entry = cached;
    } else {
      entry = await loadActivePlan(user.id);
      planCache.set(user.id, entry);
    }

    req.activeTier = entry.tier;
    req.activeSubscription = entry.subscription;
    req.activePlan = entry.plan;
    next();
  } catch (err) {
    req.log?.error({ err }, "attachPlan failed");
    res.status(500).json({ error: "Plan middleware error" });
  }
};

export function invalidatePlanCache(userId: string): void {
  planCache.delete(userId);
}

/**
 * Gate a route to a minimum tier. Owners always pass. Returns 402 with
 * upgrade context if the user's effective tier is below the required one.
 *
 * Usage: router.post("/strategy", requirePlan("PRO"), handler)
 *
 * Note: `attachPlan` must run earlier in the chain (or this middleware will
 * lazy-attach on first call).
 */
export function requirePlan(min: Tier): RequestHandler {
  const required = TIER_RANK[min];
  return async (req: Request, res: Response, next: NextFunction) => {
    // Lazy-attach if caller forgot to mount attachPlan upstream.
    if (req.activeTier === undefined) {
      await new Promise<void>((resolve) => {
        attachPlan(req, res, () => resolve());
      });
      if (res.headersSent) return;
    }
    const current = req.activeTier ?? "FREE";
    if (TIER_RANK[current] >= required) {
      next();
      return;
    }

    const trialExpired = isTrialExpired(req.activeSubscription ?? null);

    res.status(402).json({
      error: "Plan upgrade required",
      requiresUpgrade: true,
      currentTier: current,
      requiredTier: min,
      trialExpired,
      message: trialExpired
        ? "Deneme sürenin sonuna geldin. Devam etmek için bir plan seç."
        : `Bu özellik ${min} planı veya üzerini gerektirir.`,
    });
  };
}
