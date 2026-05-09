import {
  pgTable,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const usersTable = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    replitUserId: text("replit_user_id").notNull(),
    email: text("email").notNull(),
    fullName: text("full_name"),
    avatarUrl: text("avatar_url"),
    role: text("role").notNull().default("BASIC_USER"),
    plan: text("plan").notNull().default("FREE"),
    planStatus: text("plan_status").notNull().default("trialing"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    locale: text("locale").notNull().default("tr"),
    countryCode: text("country_code"),
    currency: text("currency").notNull().default("USD"),
    timezone: text("timezone").notNull().default("Europe/Istanbul"),
    isActive: boolean("is_active").notNull().default(true),
    bannedReason: text("banned_reason"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    replitIdx: uniqueIndex("users_replit_user_id_idx").on(t.replitUserId),
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
    roleIdx: index("users_role_idx").on(t.role),
    planIdx: index("users_plan_idx").on(t.plan),
  }),
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const userSessionsTable = pgTable(
  "user_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    deviceKind: text("device_kind"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("user_sessions_user_idx").on(t.userId),
  }),
);
export type UserSession = typeof userSessionsTable.$inferSelect;

export const userInvitesTable = pgTable(
  "user_invites",
  {
    id: text("id").primaryKey(),
    invitedByUserId: text("invited_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("BASIC_USER"),
    plan: text("plan").notNull().default("FREE"),
    code: text("code").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    codeIdx: uniqueIndex("user_invites_code_idx").on(t.code),
    emailIdx: index("user_invites_email_idx").on(t.email),
  }),
);
export type UserInvite = typeof userInvitesTable.$inferSelect;
