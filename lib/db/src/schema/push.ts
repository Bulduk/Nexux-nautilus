import {
  pgTable,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Expo push tokens kaydı.
 * - Bir cihaz başına bir kayıt (unique on token).
 * - userId uygulama usersTable.id; çıkışta cihaz token'ı `disabled=true`'ya çekilir.
 * - `prefs`: hangi sinyal türleri için push istiyor.
 */
export const pushTokensTable = pgTable(
  "push_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    token: text("token").notNull(),
    platform: text("platform").notNull(),
    deviceName: text("device_name"),
    appVersion: text("app_version"),
    enabled: boolean("enabled").notNull().default(true),
    /** "all" | "high_grade_only" — varsayılan high_grade_only (A/A+ sinyaller). */
    signalLevel: text("signal_level").notNull().default("high_grade_only"),
    notifySignals: boolean("notify_signals").notNull().default(true),
    notifyFills: boolean("notify_fills").notNull().default(true),
    notifyCouncil: boolean("notify_council").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    tokenUq: uniqueIndex("push_tokens_token_uq").on(t.token),
    userIdx: index("push_tokens_user_idx").on(t.userId),
    enabledIdx: index("push_tokens_enabled_idx").on(t.enabled),
  }),
);

export type PushTokenRow = typeof pushTokensTable.$inferSelect;
export type NewPushTokenRow = typeof pushTokensTable.$inferInsert;
