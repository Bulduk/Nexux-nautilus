const getDomain = (): string =>
  (process.env["EXPO_PUBLIC_DOMAIN"] as string | undefined) ?? "localhost:8080";

const getBase = (): string => `https://${getDomain()}/api`;

// Auth token getter, wired in (tabs)/_layout from SecureStore (Replit Auth session token)
type TokenGetter = () => Promise<string | null | undefined>;
let tokenGetter: TokenGetter | null = null;
export function setAuthTokenGetter(getter: TokenGetter | null): void {
  tokenGetter = getter;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!tokenGetter) return {};
  try {
    const t = await tokenGetter();
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

// ── Paywall (402) global handler ─────────────────────────────────────────────
export interface PaywallDetail {
  currentTier: string;
  requiredTier: string;
  trialExpired: boolean;
  message: string;
}

export class PaywallError extends Error {
  detail: PaywallDetail;
  constructor(detail: PaywallDetail) {
    super(detail.message);
    this.name = "PaywallError";
    this.detail = detail;
  }
}

type PaywallListener = (d: PaywallDetail) => void;
const paywallListeners = new Set<PaywallListener>();
export function onPaywall(listener: PaywallListener): () => void {
  paywallListeners.add(listener);
  return () => paywallListeners.delete(listener);
}

function emitPaywall(d: PaywallDetail): void {
  for (const l of paywallListeners) {
    try { l(d); } catch { /* swallow */ }
  }
}

async function maybePaywall(res: Response): Promise<PaywallDetail | null> {
  if (res.status !== 402) return null;
  try {
    const data = await res.clone().json();
    if (data?.requiresUpgrade) {
      const detail: PaywallDetail = {
        currentTier: data.currentTier ?? "FREE",
        requiredTier: data.requiredTier ?? "PRO",
        trialExpired: !!data.trialExpired,
        message: data.message ?? "Plan upgrade required",
      };
      emitPaywall(detail);
      return detail;
    }
  } catch { /* parse error */ }
  return null;
}

export async function apiGet<T>(path: string): Promise<T> {
  const url = `${getBase()}${path}`;
  const headers = { Accept: "application/json", ...(await authHeaders()) };
  const res = await fetch(url, { headers });
  const pw = await maybePaywall(res);
  if (pw) throw new PaywallError(pw);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${path}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${getBase()}${path}`;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(await authHeaders()),
  };
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const pw = await maybePaywall(res);
  if (pw) throw new PaywallError(pw);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export interface Ticker {
  symbol: string;
  price: number;
  change: number;
  volQuote: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OhlcvResp {
  symbol: string;
  timeframe: string;
  candles: Candle[];
}

export interface OrderBookResp {
  symbol: string;
  /** [price, size] tuples */
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
  timestamp: number | null;
  nonce?: number | null;
}

export interface PushRegisterResult {
  ok: boolean;
}

export interface DecisionTrace {
  why_entry: string;
  why_size: string;
  why_stop: string;
  why_leverage: string;
  factors: Record<string, number | string | null>;
  grade: "A" | "B" | "C" | "D";
  confluence: number;
}

export interface Signal {
  type: string;
  source: string;
  agent_kind: "core" | "external";
  symbol: string;
  direction: "LONG" | "SHORT";
  confidence: number;
  reason: string;
  price: number;
  entry: number;
  stop_loss: number;
  take_profit: number;
  rr: number;
  suggested_leverage: number;
  trace: DecisionTrace;
  timestamp: string;
}

export type ExecutionMode = "paper" | "semi" | "auto_confirm" | "full_auto";

export interface RiskProfile {
  maxLeverage: number;
  maxPositionSizeUsd: number;
  maxGrossExposureUsd: number;
  maxOpenPositions: number;
  dailyLossLimitUsd: number;
  maxDrawdownPct: number;
  minConfidenceCore: number;
  minConfidenceExternal: number;
  cooldownSecPerSymbol: number;
  maxAtrPct: number;
  killSwitchEngaged: boolean;
  liveTradingArmed: boolean;
  executionMode: ExecutionMode;
  updatedAt: number;
}

export interface RiskStatus {
  profile: RiskProfile;
  stats: { isoDate: string; realizedPnlUsd: number; tradeCount: number; drawdownPct: number };
  open_positions: number;
  gross_exposure_usd: number;
  daily_loss_remaining_usd: number;
  capacity_remaining_usd: number;
  execution_mode: ExecutionMode;
  execution_mode_description: string;
}

export interface OpenPosition {
  intentId: string;
  symbol: string;
  side: string;
  qty: number;
  entryPrice: number;
  notionalUsd: number;
  exchange: string;
  mode: string;
  openedAt: number;
}

export interface LedgerEntry {
  id: string;
  ts: number;
  type: string;
  intentId?: string;
  symbol?: string;
  side?: string;
  notionalUsd?: number;
  qty?: number;
  price?: number;
  exchange?: string;
  mode?: string;
  agent?: string;
  detail: string;
}

export interface TradeStatus {
  live_trading_configured: boolean;
  configured_exchanges: string[];
  default_exchange: string | null;
  note: string;
}

export interface GuardCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface GuardResult {
  ok: boolean;
  rejectedBy?: string;
  checks: GuardCheck[];
}

export interface IntentEval {
  intent: {
    intentId: string;
    symbol: string;
    direction: string;
    notionalUsd: number;
    qty: number;
    price: number;
    leverage: number;
  };
  sizing: {
    notionalUsd: number;
    qty: number;
    kellyFraction: number;
    reason: string;
  };
  guard: GuardResult;
  dry_run: boolean;
}

export interface IntentSubmitResult {
  ok: boolean;
  mode?: string;
  intent?: IntentEval["intent"];
  guard?: GuardResult;
  order?: { id: string; filled: number; price: number };
  error?: string;
  detail?: string;
}

export interface ModeChangeResult {
  ok: boolean;
  mode: ExecutionMode;
  description: string;
  profile: RiskProfile;
}

export interface BillingProduct {
  id: string;
  name: string;
  tier: string;
  description: string | null;
  features: string[];
  prices: Array<{
    id: string;
    currency: string;
    interval: "monthly" | "yearly";
    unitAmount: number;
  }>;
}

export interface BillingSubscription {
  status: string;
  planId: string;
  currentPeriodEnd: number | null;
  trialEndsAt: number | null;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
}
