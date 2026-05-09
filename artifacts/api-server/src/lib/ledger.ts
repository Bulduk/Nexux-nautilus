import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger";
import { db } from "./db";
import { ledgerTable, positionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

export type LedgerEntryType =
  | "signal"
  | "intent"
  | "guard"
  | "order_submitted"
  | "order_rejected"
  | "fill"
  | "close"
  | "kill"
  | "note";

export interface LedgerEntry {
  id: string;
  ts: number;
  type: LedgerEntryType;
  intentId?: string;
  symbol?: string;
  side?: "BUY" | "SELL";
  notionalUsd?: number;
  qty?: number;
  price?: number;
  exchange?: string;
  mode?: "paper" | "live";
  agent?: string;
  detail: string;
  data?: Record<string, unknown>;
}

export interface OpenPosition {
  intentId: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  entryPrice: number;
  notionalUsd: number;
  stopLoss?: number;
  takeProfit?: number;
  exchange: string;
  mode: "paper" | "live";
  openedAt: number;
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const LEDGER_FILE = path.join(DATA_DIR, "ledger.jsonl");
const POSITIONS_FILE = path.join(DATA_DIR, "positions.json");
const MAX_IN_MEMORY = 500;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory buffer for fast reads (DB is authoritative)
const buffer: LedgerEntry[] = [];
let positions: OpenPosition[] = [];
let dbReady = false;

async function loadFromDB(): Promise<void> {
  try {
    // Load recent ledger entries
    const rows = await db
      .select()
      .from(ledgerTable)
      .orderBy(desc(ledgerTable.ts))
      .limit(MAX_IN_MEMORY);

    buffer.length = 0;
    for (const r of rows.reverse()) {
      buffer.push({
        id: r.id,
        ts: r.ts,
        type: r.type as LedgerEntryType,
        intentId: r.intentId ?? undefined,
        symbol: r.symbol ?? undefined,
        side: r.side as "BUY" | "SELL" | undefined,
        notionalUsd: r.notionalUsd ? Number(r.notionalUsd) : undefined,
        qty: r.qty ? Number(r.qty) : undefined,
        price: r.price ? Number(r.price) : undefined,
        exchange: r.exchange ?? undefined,
        mode: (r.mode as "paper" | "live") ?? undefined,
        agent: r.agent ?? undefined,
        detail: r.detail,
        data: (r.data as Record<string, unknown>) ?? undefined,
      });
    }

    // Load open positions
    const posRows = await db.select().from(positionsTable);
    positions = posRows.map((r) => ({
      intentId: r.intentId,
      symbol: r.symbol,
      side: r.side as "BUY" | "SELL",
      qty: Number(r.qty),
      entryPrice: Number(r.entryPrice),
      notionalUsd: Number(r.notionalUsd),
      stopLoss: r.stopLoss ? Number(r.stopLoss) : undefined,
      takeProfit: r.takeProfit ? Number(r.takeProfit) : undefined,
      exchange: r.exchange,
      mode: r.mode as "paper" | "live",
      openedAt: r.openedAt,
    }));

    dbReady = true;
    logger.info({ ledgerCount: buffer.length, posCount: positions.length }, "ledger loaded from DB");
  } catch (err) {
    logger.warn({ err }, "DB ledger load failed, falling back to files");
    loadFromFiles();
  }
}

function loadFromFiles(): void {
  ensureDataDir();
  try {
    if (fs.existsSync(LEDGER_FILE)) {
      const lines = fs.readFileSync(LEDGER_FILE, "utf8").split("\n").filter(Boolean);
      const recent = lines.slice(-MAX_IN_MEMORY);
      for (const ln of recent) {
        try { buffer.push(JSON.parse(ln) as LedgerEntry); } catch { /* skip */ }
      }
    }
  } catch (err) {
    logger.warn({ err }, "ledger file load failed");
  }
  try {
    if (fs.existsSync(POSITIONS_FILE)) {
      positions = JSON.parse(fs.readFileSync(POSITIONS_FILE, "utf8")) as OpenPosition[];
    }
  } catch (err) {
    logger.warn({ err }, "positions file load failed");
  }
}

// Bootstrap load
loadFromDB().catch(() => loadFromFiles());

let counter = 0;
function nextId(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}`;
}

function persistEntryFile(entry: LedgerEntry): void {
  try {
    ensureDataDir();
    fs.appendFileSync(LEDGER_FILE, JSON.stringify(entry) + "\n");
  } catch { /* ignore */ }
}

function persistPositionsFile(): void {
  try {
    ensureDataDir();
    fs.writeFileSync(POSITIONS_FILE, JSON.stringify(positions, null, 2));
  } catch { /* ignore */ }
}

export function appendEntry(
  entry: Omit<LedgerEntry, "id" | "ts"> & { ts?: number },
): LedgerEntry {
  const full: LedgerEntry = {
    id: nextId(),
    ts: entry.ts ?? Date.now(),
    ...entry,
  };
  buffer.push(full);
  if (buffer.length > MAX_IN_MEMORY) buffer.splice(0, buffer.length - MAX_IN_MEMORY);

  // Write to DB async (non-blocking)
  if (dbReady) {
    db.insert(ledgerTable).values({
      id: full.id,
      ts: full.ts,
      type: full.type,
      intentId: full.intentId,
      symbol: full.symbol,
      side: full.side,
      notionalUsd: full.notionalUsd?.toString(),
      qty: full.qty?.toString(),
      price: full.price?.toString(),
      exchange: full.exchange,
      mode: full.mode,
      agent: full.agent,
      detail: full.detail,
      data: full.data as Record<string, unknown> | undefined,
    }).catch((err) => logger.warn({ err }, "ledger DB insert failed"));
  }
  // Always write file as backup
  persistEntryFile(full);
  return full;
}

export function listEntries(limit = 100, type?: LedgerEntryType): LedgerEntry[] {
  const filtered = type ? buffer.filter((e) => e.type === type) : buffer;
  return filtered.slice(-limit).reverse();
}

export function openPosition(p: OpenPosition): void {
  positions.push(p);
  persistPositionsFile();
  if (dbReady) {
    db.insert(positionsTable).values({
      intentId: p.intentId,
      symbol: p.symbol,
      side: p.side,
      qty: p.qty.toString(),
      entryPrice: p.entryPrice.toString(),
      notionalUsd: p.notionalUsd.toString(),
      stopLoss: p.stopLoss?.toString(),
      takeProfit: p.takeProfit?.toString(),
      exchange: p.exchange,
      mode: p.mode,
      openedAt: p.openedAt,
    }).onConflictDoNothing().catch((err) => logger.warn({ err }, "position DB insert failed"));
  }
}

export function listOpenPositions(): OpenPosition[] {
  return positions.slice();
}

export function findPositionByIntent(intentId: string): OpenPosition | undefined {
  return positions.find((p) => p.intentId === intentId);
}

export function closePositionByIntent(intentId: string): OpenPosition | undefined {
  const idx = positions.findIndex((p) => p.intentId === intentId);
  if (idx === -1) return undefined;
  const removed = positions[idx]!;
  positions.splice(idx, 1);
  persistPositionsFile();
  if (dbReady) {
    db.delete(positionsTable)
      .where(eq(positionsTable.intentId, intentId))
      .catch((err) => logger.warn({ err }, "position DB delete failed"));
  }
  return removed;
}

export function closeAllPositions(): OpenPosition[] {
  const removed = positions.slice();
  positions = [];
  persistPositionsFile();
  if (dbReady) {
    db.delete(positionsTable).catch((err) => logger.warn({ err }, "positions DB clear failed"));
  }
  return removed;
}
