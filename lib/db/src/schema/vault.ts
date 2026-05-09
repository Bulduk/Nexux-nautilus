import {
  pgTable,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const exchangeKeysTable = pgTable(
  "exchange_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    exchange: text("exchange").notNull(),
    label: text("label").notNull().default("default"),
    apiKeyEncrypted: text("api_key_encrypted").notNull(),
    apiKeyIv: text("api_key_iv").notNull(),
    apiKeyTag: text("api_key_tag").notNull(),
    apiSecretEncrypted: text("api_secret_encrypted").notNull(),
    apiSecretIv: text("api_secret_iv").notNull(),
    apiSecretTag: text("api_secret_tag").notNull(),
    apiPassphraseEncrypted: text("api_passphrase_encrypted"),
    apiPassphraseIv: text("api_passphrase_iv"),
    apiPassphraseTag: text("api_passphrase_tag"),
    permissions: jsonb("permissions").default({}),
    isTestnet: boolean("is_testnet").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    userExchangeIdx: uniqueIndex("exchange_keys_user_exchange_label_idx").on(
      t.userId,
      t.exchange,
      t.label,
    ),
    userIdx: index("exchange_keys_user_idx").on(t.userId),
  }),
);

export const insertExchangeKeySchema = createInsertSchema(exchangeKeysTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertExchangeKey = z.infer<typeof insertExchangeKeySchema>;
export type ExchangeKey = typeof exchangeKeysTable.$inferSelect;
