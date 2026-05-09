import {
  pgTable,
  serial,
  text,
  boolean,
  numeric,
  bigint,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const watchlistTable = pgTable(
  "watchlist",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id"),
    symbol: text("symbol").notNull(),
    base: text("base").notNull(),
    quote: text("quote").notNull().default("USDT"),
    exchange: text("exchange").notNull().default("binance"),
    enabled: boolean("enabled").notNull().default(true),
    tags: text("tags").array().default([]),
    addedBy: text("added_by").default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userIdx: index("watchlist_user_idx").on(t.userId),
    userSymbolIdx: index("watchlist_user_symbol_idx").on(t.userId, t.symbol),
  }),
);

export const ledgerTable = pgTable(
  "ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    ts: bigint("ts", { mode: "number" }).notNull(),
    type: text("type").notNull(),
    intentId: text("intent_id"),
    symbol: text("symbol"),
    side: text("side"),
    notionalUsd: numeric("notional_usd", { precision: 20, scale: 8 }),
    qty: numeric("qty", { precision: 20, scale: 8 }),
    price: numeric("price", { precision: 20, scale: 8 }),
    exchange: text("exchange"),
    mode: text("mode").default("paper"),
    agent: text("agent"),
    detail: text("detail").notNull(),
    data: jsonb("data"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userIdx: index("ledger_user_idx").on(t.userId),
    userTsIdx: index("ledger_user_ts_idx").on(t.userId, t.ts),
  }),
);

export const positionsTable = pgTable(
  "positions",
  {
    intentId: text("intent_id").primaryKey(),
    userId: text("user_id"),
    symbol: text("symbol").notNull(),
    side: text("side").notNull(),
    qty: numeric("qty", { precision: 20, scale: 8 }).notNull(),
    entryPrice: numeric("entry_price", { precision: 20, scale: 8 }).notNull(),
    notionalUsd: numeric("notional_usd", { precision: 20, scale: 8 }).notNull(),
    stopLoss: numeric("stop_loss", { precision: 20, scale: 8 }),
    takeProfit: numeric("take_profit", { precision: 20, scale: 8 }),
    exchange: text("exchange").notNull(),
    mode: text("mode").notNull().default("paper"),
    openedAt: bigint("opened_at", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userIdx: index("positions_user_idx").on(t.userId),
  }),
);

export const riskProfileTable = pgTable(
  "risk_profile",
  {
    id: integer("id").primaryKey().default(1),
    userId: text("user_id"),
    maxLeverage: numeric("max_leverage", { precision: 5, scale: 2 }).notNull().default("3"),
    maxPositionSizeUsd: numeric("max_position_size_usd", { precision: 20, scale: 2 }).notNull().default("250"),
    maxGrossExposureUsd: numeric("max_gross_exposure_usd", { precision: 20, scale: 2 }).notNull().default("1000"),
    maxOpenPositions: integer("max_open_positions").notNull().default(4),
    dailyLossLimitUsd: numeric("daily_loss_limit_usd", { precision: 20, scale: 2 }).notNull().default("100"),
    maxDrawdownPct: numeric("max_drawdown_pct", { precision: 5, scale: 2 }).notNull().default("15"),
    minConfidenceCore: numeric("min_confidence_core", { precision: 5, scale: 2 }).notNull().default("70"),
    minConfidenceExternal: numeric("min_confidence_external", { precision: 5, scale: 2 }).notNull().default("85"),
    cooldownSecPerSymbol: integer("cooldown_sec_per_symbol").notNull().default(60),
    maxAtrPct: numeric("max_atr_pct", { precision: 5, scale: 2 }).notNull().default("4.0"),
    killSwitchEngaged: boolean("kill_switch_engaged").notNull().default(false),
    liveTradingArmed: boolean("live_trading_armed").notNull().default(false),
    executionMode: text("execution_mode").notNull().default("paper"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userIdx: index("risk_profile_user_idx").on(t.userId),
  }),
);

export const dailyPnlTable = pgTable(
  "daily_pnl",
  {
    isoDate: text("iso_date").primaryKey(),
    userId: text("user_id"),
    realizedPnlUsd: numeric("realized_pnl_usd", { precision: 20, scale: 2 }).notNull().default("0"),
    tradeCount: integer("trade_count").notNull().default(0),
    highWaterEquity: numeric("high_water_equity", { precision: 20, scale: 2 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userDateIdx: index("daily_pnl_user_date_idx").on(t.userId, t.isoDate),
  }),
);

export const agentConfigsTable = pgTable("agent_configs", {
  agentId: text("agent_id").primaryKey(),
  name: text("name").notNull(),
  source: text("source").notNull().default("core"),
  role: text("role").notNull(),
  model: text("model").notNull().default("claude-sonnet-4-6"),
  systemPrompt: text("system_prompt"),
  enabled: boolean("enabled").notNull().default(true),
  riskLevel: text("risk_level").notNull().default("medium"),
  confidenceThreshold: numeric("confidence_threshold", { precision: 5, scale: 2 }).notNull().default("70"),
  capabilities: text("capabilities").array().default([]),
  apiEndpoint: text("api_endpoint"),
  repoUrl: text("repo_url"),
  extra: jsonb("extra").default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const councilVotesTable = pgTable(
  "council_votes",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id"),
    sessionId: text("session_id").notNull(),
    symbol: text("symbol").notNull(),
    direction: text("direction").notNull(),
    agentId: text("agent_id").notNull(),
    vote: text("vote").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 2 }),
    reason: text("reason"),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userIdx: index("council_votes_user_idx").on(t.userId),
    sessionIdx: index("council_votes_session_idx").on(t.sessionId),
  }),
);

export const pendingSignalsTable = pgTable(
  "pending_signals",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id"),
    signalId: text("signal_id").notNull().unique(),
    symbol: text("symbol").notNull(),
    direction: text("direction").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull(),
    reason: text("reason"),
    price: numeric("price", { precision: 20, scale: 8 }).notNull(),
    entry: numeric("entry", { precision: 20, scale: 8 }),
    stopLoss: numeric("stop_loss", { precision: 20, scale: 8 }),
    takeProfit: numeric("take_profit", { precision: 20, scale: 8 }),
    rr: numeric("rr", { precision: 8, scale: 4 }),
    suggestedLeverage: integer("suggested_leverage").default(1),
    source: text("source").notNull().default("signal_engine"),
    status: text("status").notNull().default("pending"),
    trace: jsonb("trace"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userIdx: index("pending_signals_user_idx").on(t.userId),
    userStatusIdx: index("pending_signals_user_status_idx").on(t.userId, t.status),
  }),
);

export const signalsTable = pgTable(
  "signals",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id"),
    source: text("source").notNull(),
    agentKind: text("agent_kind").notNull().default("core"),
    symbol: text("symbol").notNull(),
    direction: text("direction").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull(),
    reason: text("reason"),
    price: numeric("price", { precision: 20, scale: 8 }).notNull(),
    entry: numeric("entry", { precision: 20, scale: 8 }),
    stopLoss: numeric("stop_loss", { precision: 20, scale: 8 }),
    takeProfit: numeric("take_profit", { precision: 20, scale: 8 }),
    rr: numeric("rr", { precision: 8, scale: 4 }),
    suggestedLeverage: integer("suggested_leverage").default(1),
    trace: jsonb("trace"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userIdx: index("signals_user_idx").on(t.userId),
  }),
);
