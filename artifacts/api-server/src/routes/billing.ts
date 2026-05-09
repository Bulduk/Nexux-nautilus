import { Router, type IRouter, type Request } from "express";
import { sql, eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  db,
  subscriptionsTable,
  subscriptionPlansTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  getUncachableStripeClient,
  getStripePublishableKey,
} from "../stripeClient";

const router: IRouter = Router();

// Same-origin CSRF guard: state-changing billing routes must originate from
// our own UI. Stripe never POSTs back to these — it uses /api/stripe/webhook.
function sameOrigin(req: Request): boolean {
  const allowed = new Set<string>();
  const host = req.get("host");
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }
  const domains = process.env.REPLIT_DOMAINS?.split(",") ?? [];
  for (const d of domains) {
    const t = d.trim();
    if (t) allowed.add(`https://${t}`);
  }
  const origin = req.get("origin");
  const referer = req.get("referer");
  const candidate =
    origin ?? (referer ? new URL(referer).origin : undefined);
  if (!candidate) return false;
  return allowed.has(candidate);
}

router.get("/billing/config", async (_req, res) => {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({
      publishableKey,
      cryptoEnabled: !!process.env.NOWPAYMENTS_API_KEY,
      currencies: ["USD", "EUR", "TRY"],
      intervals: ["monthly", "yearly"],
    });
  } catch (err: any) {
    res.status(503).json({ error: "Stripe not configured", detail: err?.message });
  }
});

router.get("/billing/plans", requireAuth, async (_req, res) => {
  const plans = await db
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.isActive, true))
    .orderBy(subscriptionPlansTable.sortOrder);
  res.json({ plans });
});

router.get("/billing/products", requireAuth, async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        p.id, p.name, p.description, p.metadata, p.active,
        pr.id AS price_id, pr.unit_amount, pr.currency,
        pr.recurring, pr.active AS price_active, pr.metadata AS price_metadata
      FROM stripe.products p
      LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true
      ORDER BY p.id, pr.unit_amount
    `);
    const productMap = new Map<string, any>();
    for (const row of result.rows as any[]) {
      const pid = row.id;
      if (!productMap.has(pid)) {
        productMap.set(pid, {
          id: pid,
          name: row.name,
          description: row.description,
          metadata: row.metadata ?? {},
          prices: [] as any[],
        });
      }
      if (row.price_id) {
        productMap.get(pid).prices.push({
          id: row.price_id,
          unit_amount: Number(row.unit_amount ?? 0),
          currency: String(row.currency ?? "").toUpperCase(),
          recurring: row.recurring,
          metadata: row.price_metadata ?? {},
        });
      }
    }
    res.json({ products: Array.from(productMap.values()) });
  } catch (err: any) {
    res.status(503).json({
      error: "Stripe not synced yet",
      detail: err?.message,
      hint: "Run scripts/seed-stripe-products.ts first",
    });
  }
});

const checkoutSchema = z.object({
  priceId: z.string().startsWith("price_"),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

router.post("/billing/checkout", requireAuth, async (req, res) => {
  if (!sameOrigin(req)) {
    res.status(403).json({ error: "Forbidden (CSRF)" });
    return;
  }
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    return;
  }
  const user = req.currentUser!;

  let stripe;
  try {
    stripe = await getUncachableStripeClient();
  } catch (err: any) {
    res.status(503).json({ error: "Stripe not configured", detail: err?.message });
    return;
  }

  // Find or create Stripe customer (idempotency key prevents duplicate
  // customers on rapid double-clicks). Always persist the customerId — if
  // no subscription row exists yet, create a placeholder FREE row.
  const subRows = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, user.id))
    .limit(1);
  let customerId = subRows[0]?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create(
      {
        email: user.email,
        name: user.fullName ?? undefined,
        metadata: { userId: user.id, replitUserId: user.replitUserId },
      },
      { idempotencyKey: `customer-${user.id}` },
    );
    customerId = customer.id;
    if (subRows[0]) {
      await db
        .update(subscriptionsTable)
        .set({ stripeCustomerId: customerId })
        .where(eq(subscriptionsTable.id, subRows[0].id));
    } else {
      // Bootstrap a FREE row so we never lose the Stripe customer linkage.
      await db.insert(subscriptionsTable).values({
        id: randomUUID(),
        userId: user.id,
        planId: "FREE",
        status: "trialing",
        billingInterval: "monthly",
        currency: "USD",
        amount: "0",
        stripeCustomerId: customerId,
      });
    }
  }

  const origin = req.headers.origin || `${req.protocol}://${req.get("host")}`;
  const successUrl = parsed.data.successUrl ?? `${origin}/?billing=success`;
  const cancelUrl = parsed.data.cancelUrl ?? `${origin}/?billing=cancelled`;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: parsed.data.priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    client_reference_id: user.id,
    subscription_data: {
      metadata: { userId: user.id, replitUserId: user.replitUserId },
    },
  });

  res.json({ url: session.url, sessionId: session.id });
});

router.post("/billing/portal", requireAuth, async (req, res) => {
  if (!sameOrigin(req)) {
    res.status(403).json({ error: "Forbidden (CSRF)" });
    return;
  }
  const user = req.currentUser!;
  const subRows = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, user.id))
    .limit(1);
  const customerId = subRows[0]?.stripeCustomerId;
  if (!customerId) {
    res.status(400).json({ error: "Henüz aktif aboneliğin yok." });
    return;
  }
  let stripe;
  try {
    stripe = await getUncachableStripeClient();
  } catch (err: any) {
    res.status(503).json({ error: "Stripe not configured", detail: err?.message });
    return;
  }
  const origin = req.headers.origin || `${req.protocol}://${req.get("host")}`;
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/?billing=return`,
  });
  res.json({ url: session.url });
});

router.get("/billing/subscription", requireAuth, async (req, res) => {
  const user = req.currentUser!;
  const localSub = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, user.id))
    .limit(1);
  if (!localSub[0]) {
    res.json({ subscription: null });
    return;
  }
  const stripeSubId = localSub[0].stripeSubscriptionId;
  let stripeSubscription = null;
  if (stripeSubId) {
    try {
      const result = await db.execute(sql`
        SELECT id, status, current_period_end, cancel_at_period_end
        FROM stripe.subscriptions WHERE id = ${stripeSubId} LIMIT 1
      `);
      stripeSubscription = (result.rows as any[])[0] ?? null;
    } catch {
      // Stripe schema not migrated yet
    }
  }
  res.json({ subscription: localSub[0], stripeSubscription });
});

export default router;
