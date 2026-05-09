import { Router, type IRouter, type Request } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  db,
  subscriptionsTable,
  subscriptionPlansTable,
  cryptoPaymentEventsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { invalidatePlanCache } from "../middlewares/requirePlan";
import {
  isNowPaymentsConfigured,
  npCreateInvoice,
  npVerifyIpn,
  NP_COMPLETED_STATUSES,
} from "../lib/nowpayments";

const router: IRouter = Router();

function sameOrigin(req: Request): boolean {
  const allowed = new Set<string>();
  const host = req.get("host");
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }
  for (const d of (process.env.REPLIT_DOMAINS?.split(",") ?? [])) {
    const t = d.trim();
    if (t) allowed.add(`https://${t}`);
  }
  const origin = req.get("origin");
  const referer = req.get("referer");
  const candidate = origin ?? (referer ? new URL(referer).origin : undefined);
  return !!candidate && allowed.has(candidate);
}

function getPriceForPlan(
  plan: typeof subscriptionPlansTable.$inferSelect,
  currency: "USD" | "EUR" | "TRY",
  interval: "monthly" | "yearly",
): number {
  const map = {
    USD: { monthly: plan.priceUsdMonthly, yearly: plan.priceUsdYearly },
    EUR: { monthly: plan.priceEurMonthly, yearly: plan.priceEurYearly },
    TRY: { monthly: plan.priceTryMonthly, yearly: plan.priceTryYearly },
  } as const;
  return Number(map[currency][interval] ?? 0);
}

function periodEnd(interval: "monthly" | "yearly"): Date {
  const ms = interval === "yearly" ? 365 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
  return new Date(Date.now() + ms);
}

const invoiceSchema = z.object({
  planId: z.enum(["pro", "elite", "enterprise"]),
  interval: z.enum(["monthly", "yearly"]),
  currency: z.enum(["USD", "EUR", "TRY"]),
});

/**
 * POST /api/billing/crypto/invoice
 * Creates a NOWPayments invoice for a one-time crypto purchase of a plan period.
 * Crypto purchases are NOT recurring — they buy a fixed period (30d / 365d).
 */
router.post("/billing/crypto/invoice", requireAuth, async (req, res) => {
  if (!sameOrigin(req)) {
    res.status(403).json({ error: "Forbidden (CSRF)" });
    return;
  }
  if (!isNowPaymentsConfigured()) {
    res.status(503).json({
      error: "Crypto payment unavailable",
      detail: "NOWPAYMENTS_API_KEY not configured",
    });
    return;
  }
  const parsed = invoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    return;
  }
  const user = req.currentUser!;
  const { planId, interval, currency } = parsed.data;

  const planRows = await db
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.id, planId))
    .limit(1);
  const plan = planRows[0];
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const amount = getPriceForPlan(plan, currency, interval);
  if (!amount || amount <= 0) {
    res.status(400).json({ error: `Plan ${planId} has no price for ${currency}/${interval}` });
    return;
  }

  const origin = req.headers.origin || `${req.protocol}://${req.get("host")}`;
  const orderId = `np_${user.id}_${planId}_${interval}_${Date.now()}`;

  try {
    const invoice = await npCreateInvoice({
      priceAmount: amount,
      priceCurrency: currency,
      orderId,
      orderDescription: `${plan.name} (${interval}) — ${user.email}`,
      ipnCallbackUrl: `${origin}/api/billing/crypto/ipn`,
      successUrl: `${origin}/?billing=crypto-success`,
      cancelUrl: `${origin}/?billing=crypto-cancelled`,
    });
    res.json({
      url: invoice.invoice_url,
      invoiceId: invoice.id,
      orderId,
      amount,
      currency,
    });
  } catch (err: any) {
    req.log?.error({ err: err?.message, body: err?.body }, "NOWPayments invoice failed");
    res.status(502).json({ error: "Crypto invoice creation failed", detail: err?.message });
  }
});

/**
 * POST /api/billing/crypto/ipn
 * NOWPayments Instant Payment Notification webhook. Verifies HMAC-SHA512
 * signature against NOWPAYMENTS_IPN_SECRET, then on completed payment
 * activates / extends the user's subscription for the purchased period.
 *
 * IMPORTANT: This route is registered with express.raw() in app.ts BEFORE
 * express.json() so that we can verify the signature against the exact bytes.
 */
router.post("/billing/crypto/ipn", async (req, res) => {
  const signature = req.header("x-nowpayments-sig");
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));

  const verified = npVerifyIpn(raw, signature);
  if (!verified.ok || !verified.payload) {
    req.log?.warn({ reason: verified.reason }, "NOWPayments IPN rejected");
    res.status(400).json({ error: "Invalid IPN", reason: verified.reason });
    return;
  }

  const payload = verified.payload;
  // order_id format: "np_<userId>_<planId>_<interval>_<ts>"
  const parts = String(payload.order_id ?? "").split("_");
  if (parts.length < 5 || parts[0] !== "np") {
    res.status(200).json({ received: true, ignored: "unknown order_id format" });
    return;
  }
  const userId = parts[1]!;
  const planId = parts[2]!;
  const interval = parts[3] as "monthly" | "yearly";

  // Always durably record the IPN event for audit (and as the source of
  // idempotency). The unique (provider, payment_id) index ensures replays
  // of the same NOWPayments payment cannot extend the period twice.
  const paymentIdStr = String(payload.payment_id ?? "");
  if (!paymentIdStr) {
    res.status(400).json({ error: "Missing payment_id" });
    return;
  }

  // Activate / extend subscription INSIDE a transaction with the idempotency
  // insert. If the unique index trips, we treat the event as a duplicate and
  // return 200 (NOWPayments expects 200 to stop retries).
  let activated = false;
  let duplicate = false;
  try {
    await db.transaction(async (tx) => {
      try {
        await tx.insert(cryptoPaymentEventsTable).values({
          id: randomUUID(),
          userId,
          provider: "nowpayments",
          paymentId: paymentIdStr,
          invoiceId: payload.invoice_id ? String(payload.invoice_id) : null,
          orderId: String(payload.order_id),
          paymentStatus: payload.payment_status,
          planId,
          interval,
          priceAmount: payload.price_amount != null ? String(payload.price_amount) : null,
          priceCurrency: payload.price_currency ?? null,
          payAmount: payload.actually_paid != null
            ? String(payload.actually_paid)
            : payload.pay_amount != null
              ? String(payload.pay_amount)
              : null,
          payCurrency: payload.pay_currency ?? null,
          payload: payload as unknown as object,
        });
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        if (msg.includes("crypto_payment_events_payment_id_idx") || err?.code === "23505") {
          duplicate = true;
          return; // exit transaction without mutating subscription
        }
        throw err;
      }

      if (!NP_COMPLETED_STATUSES.includes(payload.payment_status)) {
        // Logged for visibility but not entitlement-affecting.
        return;
      }

      const planRows = await tx
        .select()
        .from(subscriptionPlansTable)
        .where(eq(subscriptionPlansTable.id, planId))
        .limit(1);
      if (!planRows[0]) return;

      const existing = await tx
        .select()
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.userId, userId))
        .limit(1);

      // Anchor extension on the GREATER of (now, existing currentPeriodEnd)
      // so consecutive crypto purchases stack instead of overwriting.
      const now = Date.now();
      const existingEnd = existing[0]?.currentPeriodEnd
        ? new Date(existing[0].currentPeriodEnd).getTime()
        : 0;
      const anchor = Math.max(now, existingEnd);
      const intervalMs =
        interval === "yearly" ? 365 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
      const newPeriodEnd =
        existingEnd > now && existing[0]?.planId === planId
          ? new Date(anchor + intervalMs) // stack same-plan renewal
          : periodEnd(interval); // fresh purchase / plan change

      const metadata = {
        ...((existing[0]?.metadata as Record<string, unknown> | null) ?? {}),
        crypto: {
          provider: "nowpayments",
          lastInvoiceId: String(payload.invoice_id ?? ""),
          lastPaymentId: paymentIdStr,
          lastPaidAt: new Date().toISOString(),
          lastAmount: payload.actually_paid ?? payload.pay_amount ?? null,
          lastCurrency: payload.pay_currency ?? null,
        },
      };

      if (existing[0]) {
        await tx
          .update(subscriptionsTable)
          .set({
            planId,
            status: "active",
            billingInterval: interval,
            currency: String(payload.price_currency ?? "USD").toUpperCase(),
            amount: String(payload.price_amount ?? "0"),
            currentPeriodStart: new Date(),
            currentPeriodEnd: newPeriodEnd,
            cancelAtPeriodEnd: false,
            canceledAt: null,
            metadata,
          })
          .where(eq(subscriptionsTable.id, existing[0].id));
      } else {
        await tx.insert(subscriptionsTable).values({
          id: randomUUID(),
          userId,
          planId,
          status: "active",
          billingInterval: interval,
          currency: String(payload.price_currency ?? "USD").toUpperCase(),
          amount: String(payload.price_amount ?? "0"),
          currentPeriodStart: new Date(),
          currentPeriodEnd: newPeriodEnd,
          metadata,
        });
      }

      activated = true;
    });
  } catch (err: any) {
    req.log?.error({ err: err?.message, orderId: payload.order_id }, "NOWPayments IPN tx failed");
    res.status(500).json({ error: "IPN processing failed" });
    return;
  }

  if (duplicate) {
    req.log?.info({ paymentId: paymentIdStr }, "NOWPayments IPN duplicate, ignored");
    res.status(200).json({ received: true, duplicate: true });
    return;
  }

  if (activated) {
    invalidatePlanCache(userId);
    req.log?.info(
      { userId, planId, interval, orderId: payload.order_id },
      "NOWPayments crypto subscription activated",
    );
  }

  res.status(200).json({ received: true, activated, status: payload.payment_status });
});

export default router;
