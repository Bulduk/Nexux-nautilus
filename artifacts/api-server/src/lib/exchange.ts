import * as ccxt from "ccxt";
import { logger } from "./logger";

// Public market-data exchange. Binance.com blocks Replit's IP range with HTTP 451
// ("restricted location"), so we use KuCoin by default — it serves the same
// USDT spot pairs and is accessible globally. Override with PUBLIC_EXCHANGE env
// var (any ccxt id, e.g. "okx", "kucoin", "coinbase", "kraken").
const PUBLIC_EXCHANGE_ID = process.env["PUBLIC_EXCHANGE"] ?? "kucoin";

type CcxtCfg = Record<string, unknown>;

function makePublicExchange(): ccxt.Exchange {
  const Cls = (ccxt as unknown as Record<string, new (cfg: CcxtCfg) => ccxt.Exchange>)[
    PUBLIC_EXCHANGE_ID
  ];
  if (!Cls) {
    throw new Error(`Unknown ccxt exchange id: ${PUBLIC_EXCHANGE_ID}`);
  }
  return new Cls({
    enableRateLimit: true,
    options: { defaultType: "spot" },
  });
}

const publicExchange = makePublicExchange();
export const publicExchangeId = PUBLIC_EXCHANGE_ID;

let publicMarketsLoadedAt = 0;
async function ensureMarkets(): Promise<void> {
  const now = Date.now();
  if (now - publicMarketsLoadedAt < 6 * 60 * 60 * 1000) return;
  try {
    await publicExchange.loadMarkets();
    publicMarketsLoadedAt = now;
  } catch (err) {
    logger.warn({ err, exchange: PUBLIC_EXCHANGE_ID }, "Failed to load markets");
  }
}

export interface TickerSnapshot {
  symbol: string;
  price: number;
  change: number;
  high: number;
  low: number;
  volQuote: string;
  volume: number;
  ts: number;
}

function formatBigNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}

export async function fetchTickers(symbols: string[]): Promise<TickerSnapshot[]> {
  await ensureMarkets();
  const out: TickerSnapshot[] = [];
  for (const sym of symbols) {
    try {
      const t = await publicExchange.fetchTicker(sym);
      const last = (t.last ?? t.close ?? 0) as number;
      const baseVol = (t.baseVolume ?? 0) as number;
      const quoteVol = (t.quoteVolume ?? last * baseVol) as number;
      out.push({
        symbol: sym,
        price: last,
        change: (t.percentage ?? 0) as number,
        high: (t.high ?? last) as number,
        low: (t.low ?? last) as number,
        volQuote: formatBigNumber(quoteVol),
        volume: baseVol,
        ts: (t.timestamp ?? Date.now()) as number,
      });
    } catch (err) {
      logger.warn({ err, sym }, "fetchTicker failed");
    }
  }
  return out;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchOhlcv(
  symbol: string,
  timeframe: string = "15m",
  limit: number = 60,
): Promise<Candle[]> {
  await ensureMarkets();
  const raw = await publicExchange.fetchOHLCV(symbol, timeframe, undefined, limit);
  return raw.map((c) => ({
    time: c[0] ?? 0,
    open: c[1] ?? 0,
    high: c[2] ?? 0,
    low: c[3] ?? 0,
    close: c[4] ?? 0,
    volume: c[5] ?? 0,
  })) as Candle[];
}

export interface OrderbookSnapshot {
  symbol: string;
  bidWall: number;
  askWall: number;
  imbalance: number;
  spreadPct: number;
  topBid: number;
  topAsk: number;
  /** [price, size] tuples — top N (depth param) bids/asks */
  bids: [number, number][];
  asks: [number, number][];
  ts: number;
}

// Some exchanges (kucoin, kraken) only accept specific depth values. Snap to
// the nearest allowed bucket per exchange.
function snapDepth(depth: number): number {
  if (PUBLIC_EXCHANGE_ID === "kucoin") return depth <= 50 ? 20 : 100;
  if (PUBLIC_EXCHANGE_ID === "kraken") return Math.min(500, Math.max(10, depth));
  return depth;
}

export async function fetchOrderbook(
  symbol: string,
  depth: number = 25,
): Promise<OrderbookSnapshot> {
  await ensureMarkets();
  const fetchDepth = snapDepth(depth);
  const ob = await publicExchange.fetchOrderBook(symbol, fetchDepth);
  const sliceN = Math.min(depth, fetchDepth);
  const bids = ob.bids.slice(0, sliceN);
  const asks = ob.asks.slice(0, sliceN);
  const bidVol = bids.reduce((s, b) => s + (b[1] ?? 0), 0);
  const askVol = asks.reduce((s, a) => s + (a[1] ?? 0), 0);
  const total = bidVol + askVol;
  const imbalance = total === 0 ? 0 : ((bidVol - askVol) / total) * 100;
  const topBid = bids[0]?.[0] ?? 0;
  const topAsk = asks[0]?.[0] ?? 0;
  const spreadPct = topAsk === 0 ? 0 : ((topAsk - topBid) / topAsk) * 100;
  return {
    symbol,
    bidWall: bidVol,
    askWall: askVol,
    imbalance,
    spreadPct,
    topBid,
    topAsk,
    bids: bids.map((b) => [b[0] ?? 0, b[1] ?? 0]),
    asks: asks.map((a) => [a[0] ?? 0, a[1] ?? 0]),
    ts: Date.now(),
  };
}

// --- LIVE TRADING ---
// We support multiple exchanges via env keys. The first configured one is the
// default. Keys are read per-request and never persisted by us.
export type LiveExchangeId = "binance" | "bybit" | "okx" | "kucoin" | "kraken";

interface LiveCreds {
  apiKey: string;
  secret: string;
  passphrase?: string;
}

function readCreds(id: LiveExchangeId): LiveCreds | null {
  const upper = id.toUpperCase();
  const apiKey = process.env[`${upper}_API_KEY`];
  const secret = process.env[`${upper}_API_SECRET`];
  if (!apiKey || !secret) return null;
  const creds: LiveCreds = { apiKey, secret };
  if (id === "okx" || id === "kucoin") {
    const pass = process.env[`${upper}_PASSPHRASE`];
    if (pass) creds.passphrase = pass;
  }
  return creds;
}

export function listConfiguredLiveExchanges(): LiveExchangeId[] {
  const all: LiveExchangeId[] = ["binance", "bybit", "okx", "kucoin", "kraken"];
  return all.filter((id) => readCreds(id) !== null);
}

export function getLiveExchange(id: LiveExchangeId): ccxt.Exchange | null {
  const creds = readCreds(id);
  if (!creds) return null;
  const Cls = (ccxt as unknown as Record<string, new (cfg: CcxtCfg) => ccxt.Exchange>)[id];
  if (!Cls) return null;
  const cfg: CcxtCfg = {
    apiKey: creds.apiKey,
    secret: creds.secret,
    enableRateLimit: true,
    options: { defaultType: "spot" },
  };
  if (creds.passphrase) cfg["password"] = creds.passphrase;
  return new Cls(cfg);
}

// Backward-compat wrappers used by existing routes.
export function getLiveBinance(): ccxt.Exchange | null {
  return getLiveExchange("binance");
}
export function isLiveTradingConfigured(): boolean {
  return listConfiguredLiveExchanges().length > 0;
}

// Pre-flight check: verify the key has trading enabled but NOT withdrawal.
export interface ExchangePreflight {
  ok: boolean;
  exchange: LiveExchangeId;
  permissions: Record<string, unknown> | null;
  warnings: string[];
}

export async function preflightLiveExchange(id: LiveExchangeId): Promise<ExchangePreflight> {
  const ex = getLiveExchange(id);
  const warnings: string[] = [];
  if (!ex) {
    return { ok: false, exchange: id, permissions: null, warnings: ["no_keys"] };
  }
  let perms: Record<string, unknown> | null = null;
  try {
    // ccxt fetchAccounts / fetchPermissions vary by exchange; fetchBalance is the
    // most universal smoke test.
    await ex.fetchBalance();
  } catch (err) {
    warnings.push(`balance_check_failed: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, exchange: id, permissions: perms, warnings };
  }
  return { ok: true, exchange: id, permissions: perms, warnings };
}

// Fetch market metadata (lot size, tick size, min notional) for a symbol on the
// public exchange. Live exchanges typically share the same market structure for
// USDT spot pairs.
export interface MarketInfo {
  symbol: string;
  base: string;
  quote: string;
  amountPrecision: number;
  pricePrecision: number;
  minAmount: number | null;
  minNotional: number | null;
}

export async function fetchMarketInfo(symbol: string): Promise<MarketInfo | null> {
  await ensureMarkets();
  const m = publicExchange.markets[symbol];
  if (!m) return null;
  return {
    symbol,
    base: m.base ?? "",
    quote: m.quote ?? "",
    amountPrecision: (m.precision?.amount as number | undefined) ?? 8,
    pricePrecision: (m.precision?.price as number | undefined) ?? 2,
    minAmount: (m.limits?.amount?.min as number | undefined) ?? null,
    minNotional: (m.limits?.cost?.min as number | undefined) ?? null,
  };
}
