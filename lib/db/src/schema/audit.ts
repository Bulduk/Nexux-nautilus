import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  bigserial,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const auditLogTable = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    target: text("target"),
    targetId: text("target_id"),
    severity: text("severity").notNull().default("info"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    details: jsonb("details").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("audit_log_user_idx").on(t.userId),
    actionIdx: index("audit_log_action_idx").on(t.action),
    createdIdx: index("audit_log_created_idx").on(t.createdAt),
  }),
);

export type AuditLog = typeof auditLogTable.$inferSelect;
