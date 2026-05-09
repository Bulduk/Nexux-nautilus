import { createHmac } from "node:crypto";

const NP_BASE = "https://api.nowpayments.io/v1";

export type NpPaymentStatus =
  | "waiting"
  | "confirming"
  | "confirmed"
  | "sending"
  | "partially_paid"
  | "finished"
  | "failed"
  | "refunded"
  | "expired";

export interface NpInvoice {
  id: string;
  invoice_url: string;
  order_id: string;
  order_description?: string;
  price_amount: number;
  price_currency: string;
  pay_currency?: string | null;
  ipn_callback_url?: string | null;
  success_url?: string | null;
  cancel_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface NpIpnPayload {
  payment_id: number | string;
  invoice_id?: number | string;
  payment_status: NpPaymentStatus;
  pay_address?: string;
  price_amount: number;
  price_currency: string;
  pay_amount?: number;
  pay_currency?: string;
  order_id: string;
  order_description?: string;
  outcome_amount?: number;
  outcome_currency?: string;
  actually_paid?: number;
}

export class NowPaymentsError extends Error {
  status?: number;
  body?: unknown;
  constructor(message: string, status?: number, body?: unknown) {
    super(message);
    this.name = "NowPaymentsError";
    this.status = status;
    this.body = body;
  }
}

export function isNowPaymentsConfigured(): boolean {
  return !!process.env.NOWPAYMENTS_API_KEY;
}

function getApiKey(): string {
  const key = process.env.NOWPAYMENTS_API_KEY;
  if (!key) throw new NowPaymentsError("NOWPAYMENTS_API_KEY is not set", 503);
  return key;
}

async function npFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${NP_BASE}${path}`, {
    ...init,
    headers: {
      "x-api-key": getApiKey(),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    throw new NowPaymentsError(
      `NOWPayments ${path} failed: ${res.status}`,
      res.status,
      body,
    );
  }
  return body;
}

export async function npStatus(): Promise<{ message: string }> {
  return (await npFetch("/status")) as { message: string };
}

export interface CreateInvoiceArgs {
  priceAmount: number;
  priceCurrency: string; // "usd" | "eur" | "try"
  orderId: string;
  orderDescription: string;
  ipnCallbackUrl: string;
  successUrl: string;
  cancelUrl: string;
}

export async function npCreateInvoice(args: CreateInvoiceArgs): Promise<NpInvoice> {
  const body = {
    price_amount: args.priceAmount,
    price_currency: args.priceCurrency.toLowerCase(),
    order_id: args.orderId,
    order_description: args.orderDescription,
    ipn_callback_url: args.ipnCallbackUrl,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    is_fee_paid_by_user: true,
  };
  const result = (await npFetch("/invoice", {
    method: "POST",
    body: JSON.stringify(body),
  })) as NpInvoice;
  return result;
}

/**
 * Verifies the NOWPayments IPN signature.
 *
 * NOWPayments signs the SORTED-by-key JSON of the request body with
 * HMAC-SHA512 using the IPN secret, and sends it in the `x-nowpayments-sig`
 * header.
 */
export function npVerifyIpn(
  rawBody: Buffer | string,
  signature: string | undefined,
): { ok: boolean; payload?: NpIpnPayload; reason?: string } {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) return { ok: false, reason: "NOWPAYMENTS_IPN_SECRET not set" };
  if (!signature) return { ok: false, reason: "missing signature header" };

  let parsed: NpIpnPayload;
  try {
    const text = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
    parsed = JSON.parse(text) as NpIpnPayload;
  } catch {
    return { ok: false, reason: "body is not valid JSON" };
  }

  // Recreate sorted-key JSON exactly as NOWPayments expects.
  const sortedJson = JSON.stringify(parsed, Object.keys(parsed).sort());
  const expected = createHmac("sha512", secret).update(sortedJson).digest("hex");
  if (expected.toLowerCase() !== signature.toLowerCase()) {
    return { ok: false, reason: "signature mismatch" };
  }
  return { ok: true, payload: parsed };
}

export const NP_COMPLETED_STATUSES: NpPaymentStatus[] = ["finished", "confirmed"];
