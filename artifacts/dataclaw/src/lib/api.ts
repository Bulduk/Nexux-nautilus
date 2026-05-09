// Helper to call the api-server. The api-server is a sibling artifact mounted at
// `/api` on the same Replit proxy host, so we can call it via root-relative URLs
// (these intentionally bypass this artifact's own base path).
const API_BASE = "/api";

export function apiUrl(path: string): string {
  if (path.startsWith("/")) return `${API_BASE}${path}`;
  return `${API_BASE}/${path}`;
}

export interface PaywallEventDetail {
  currentTier: string;
  requiredTier: string;
  trialExpired: boolean;
  message: string;
}

export class PaywallError extends Error {
  detail: PaywallEventDetail;
  constructor(detail: PaywallEventDetail) {
    super(detail.message);
    this.name = "PaywallError";
    this.detail = detail;
  }
}

async function handle402(res: Response, method: string, path: string): Promise<never> {
  let detail: PaywallEventDetail | null = null;
  try {
    const data = await res.clone().json();
    if (data?.requiresUpgrade) {
      detail = {
        currentTier: data.currentTier ?? "FREE",
        requiredTier: data.requiredTier ?? "PRO",
        trialExpired: !!data.trialExpired,
        message: data.message ?? "Plan upgrade required",
      };
      window.dispatchEvent(new CustomEvent<PaywallEventDetail>("nexus:paywall", { detail }));
    }
  } catch {
    /* ignore parse errors */
  }
  if (detail) throw new PaywallError(detail);
  throw new Error(`${method} ${path} failed: 402`);
}

export async function apiGet<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 402) await handle402(res, "GET", path);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET ${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

export async function apiPost<T = unknown>(
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(body),
  });
  if (res.status === 402) await handle402(res, "POST", path);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

export function apiSseUrl(path: string): string {
  return apiUrl(path);
}
