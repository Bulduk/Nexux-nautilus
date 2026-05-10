import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      currentUser?: User;
    }
  }
}

const userCache = new Map<string, { user: User; cachedAt: number }>();
const USER_CACHE_TTL_MS = 15_000;

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.jwtUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userId = req.jwtUser.sub;

    const cached = userCache.get(userId);
    if (cached && Date.now() - cached.cachedAt < USER_CACHE_TTL_MS) {
      req.currentUser = cached.user;
      next();
      return;
    }

    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (rows.length === 0) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const user = rows[0]!;

    if (!user.isActive) {
      res.status(403).json({ error: "Account suspended", reason: user.bannedReason });
      return;
    }

    userCache.set(userId, { user, cachedAt: Date.now() });
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

export function clearUserCache(userId?: string): void {
  if (userId) {
    userCache.delete(userId);
  } else {
    userCache.clear();
  }
}
