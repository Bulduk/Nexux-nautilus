import {
  pgTable,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tier: text("tier").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  trialDays: integer("trial_days").notNull().default(0),
  priceUsdMonthly: numeric("price_usd_monthly", { precision: 10, scale: 2 }).notNull().default("0"),
  priceUsdYearly: numeric("price_usd_yearly", { precision: 10, scale: 2 }).notNull().default("0"),
  priceEurMonthly: numeric("price_eur_monthly", { precision: 10, scale: 2 }).notNull().default("0"),
  priceEurYearly: numeric("price_eur_yearly", { precision: 10, scale: 2 }).notNull().default("0"),
  priceTryMonthly: numeric("price_try_monthly", { precision: 12, scale: 2 }).notNull().default("0"),
  priceTryYearly: numeric("price_try_yearly", { precision: 12, scale: 2 }).notNull().default("0"),
  stripeProductId: text("stripe_product_id"),
  stripePriceUsdMonthly: text("stripe_price_usd_monthly"),
  stripePriceUsdYearly: text("stripe_price_usd_yearly"),
  stripePriceEurMonthly: text("stripe_price_eur_monthly"),
  stripePriceEurYearly: text("stripe_price_eur_yearly"),
  stripePriceTryMonthly: text("stripe_price_try_monthly"),
  stripePriceTryYearly: text("stripe_price_try_yearly"),
  features: jsonb("features").notNull().default({}),
  limits: jsonb("limits").notNull().default({}),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPlanSchema = createInsertSchema(subscriptionPlansTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;

export const subscriptionsTable = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    planId: text("plan_id").notNull().references(() => subscriptionPlansTable.id),
    status: text("status").notNull().default("trialing"),
    billingInterval: text("billing_interval").notNull().default("monthly"),
    currency: text("currency").notNull().default("USD"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    userIdx: index("subscriptions_user_idx").on(t.userId),
    statusIdx: index("subscriptions_status_idx").on(t.status),
    stripeSubIdx: uniqueIndex("subscriptions_stripe_sub_idx").on(t.stripeSubscriptionId),
  }),
);
export type Subscription = typeof subscriptionsTable.$inferSelect;

export const usageMeterTable = pgTable(
  "usage_meter",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    aiMessageCount: integer("ai_message_count").notNull().default(0),
    aiInputTokens: bigint("ai_input_tokens", { mode: "number" }).notNull().default(0),
    aiOutputTokens: bigint("ai_output_tokens", { mode: "number" }).notNull().default(0),
    councilVoteCount: integer("council_vote_count").notNull().default(0),
    signalCount: integer("signal_count").notNull().default(0),
    paperTradeCount: integer("paper_trade_count").notNull().default(0),
    liveTradeCount: integer("live_trade_count").notNull().default(0),
    backtestRunCount: integer("backtest_run_count").notNull().default(0),
    apiCallCount: integer("api_call_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    userPeriodIdx: index("usage_meter_user_period_idx").on(t.userId, t.periodStart),
  }),
);
export type UsageMeter = typeof usageMeterTable.$inferSelect;

/**
 * Idempotency log for NOWPayments crypto webhooks (IPN). The unique index on
 * `paymentId` guarantees that a replay of the same `payment_id` (whether by
 * NOWPayments retry or attacker replay of a signed payload) cannot extend
 * the subscription period twice.
 */
export const cryptoPaymentEventsTable = pgTable(
  "crypto_payment_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    provider: text("provider").notNull().default("nowpayments"),
    paymentId: text("payment_id").notNull(),
    invoiceId: text("invoice_id"),
    orderId: text("order_id").notNull(),
    paymentStatus: text("payment_status").notNull(),
    planId: text("plan_id"),
    interval: text("interval"),
    priceAmount: numeric("price_amount", { precision: 12, scale: 2 }),
    priceCurrency: text("price_currency"),
    payAmount: numeric("pay_amount", { precision: 30, scale: 10 }),
    payCurrency: text("pay_currency"),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    paymentIdIdx: uniqueIndex("crypto_payment_events_payment_id_idx").on(t.provider, t.paymentId),
    userIdx: index("crypto_payment_events_user_idx").on(t.userId),
    orderIdx: index("crypto_payment_events_order_idx").on(t.orderId),
  }),
);
export type CryptoPaymentEvent = typeof cryptoPaymentEventsTable.$inferSelect;

export const billingEventsTable = pgTable(
  "billing_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    stripeEventId: text("stripe_event_id"),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("billing_events_user_idx").on(t.userId),
    typeIdx: index("billing_events_type_idx").on(t.type),
    stripeEventIdx: uniqueIndex("billing_events_stripe_event_idx").on(t.stripeEventId),
  }),
);
export type BillingEvent = typeof billingEventsTable.$inferSelect;
