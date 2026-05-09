import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  subscriptionsTable,
  subscriptionPlansTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/me", requireAuth, async (req, res) => {
  const user = req.currentUser!;

  const subRows = await db
    .select({
      sub: subscriptionsTable,
      plan: subscriptionPlansTable,
    })
    .from(subscriptionsTable)
    .leftJoin(
      subscriptionPlansTable,
      eq(subscriptionsTable.planId, subscriptionPlansTable.id),
    )
    .where(eq(subscriptionsTable.userId, user.id))
    .limit(1);

  const subscription = subRows[0]?.sub ?? null;
  const plan = subRows[0]?.plan ?? null;

  res.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      plan: user.plan,
      planStatus: user.planStatus,
      trialEndsAt: user.trialEndsAt,
      currency: user.currency,
      locale: user.locale,
      timezone: user.timezone,
    },
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          billingInterval: subscription.billingInterval,
          currency: subscription.currency,
          amount: subscription.amount,
          trialEndsAt: subscription.trialEndsAt,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }
      : null,
    plan: plan
      ? {
          id: plan.id,
          name: plan.name,
          tier: plan.tier,
          features: plan.features,
          limits: plan.limits,
        }
      : null,
  });
});

export default router;
