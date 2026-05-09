import { useState, useEffect, useCallback, useMemo } from "react";
import { CreditCard, Check, ExternalLink, Loader2, Bitcoin, Sparkles } from "lucide-react";

interface BillingConfig {
  publishableKey: string;
  cryptoEnabled: boolean;
  currencies: ("USD" | "EUR" | "TRY")[];
  intervals: ("monthly" | "yearly")[];
}

interface StripePrice {
  id: string;
  unit_amount: number;
  currency: string;
  recurring: { interval: "month" | "year" } | null;
  metadata: Record<string, string>;
}

interface StripeProduct {
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, string>;
  prices: StripePrice[];
}

interface SubscriptionState {
  subscription: {
    planId: string;
    status: string;
    billingInterval: string;
    currency: string;
    amount: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    stripeSubscriptionId: string | null;
  } | null;
}

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$",
  EUR: "€",
  TRY: "₺",
};

const FEATURES_BY_TIER: Record<string, string[]> = {
  PRO: [
    "5 borsa anahtarı",
    "Sınırsız sinyal feed'i",
    "Gelişmiş AI agent erişimi",
    "Backtest motoru",
    "E-posta destek",
  ],
  ELITE: [
    "Sınırsız borsa anahtarı",
    "Council voting (multi-agent)",
    "OCO + reconciliation",
    "Webhook bildirimleri",
    "Öncelikli destek",
    "API erişimi",
  ],
  ENTERPRISE: [
    "Beyaz etiket lisans",
    "Self-host Docker paketi",
    "Dedicated SLA + destek",
    "Özel entegrasyonlar",
    "On-prem kurulum yardımı",
    "İmtiyazlı yol haritası",
  ],
};

export default function BillingPanel() {
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [products, setProducts] = useState<StripeProduct[]>([]);
  const [sub, setSub] = useState<SubscriptionState | null>(null);
  const [currency, setCurrency] = useState<"USD" | "EUR" | "TRY">("USD");
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, prodRes, subRes] = await Promise.all([
        fetch("/api/billing/config"),
        fetch("/api/billing/products", { credentials: "include" }),
        fetch("/api/billing/subscription", { credentials: "include" }),
      ]);
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setConfig(cfg);
      }
      if (prodRes.ok) {
        const d = await prodRes.json();
        setProducts(d.products ?? []);
      } else {
        const e = await prodRes.json().catch(() => ({}));
        setError(e.detail || e.error || "Ürünler yüklenemedi");
      }
      if (subRes.ok) {
        const s = await subRes.json();
        setSub(s);
      }
    } catch (err: any) {
      setError(err?.message || "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Detect locale + region → default currency. Region beats language so a
  // Turkish user with EN browser still gets TRY.
  useEffect(() => {
    try {
      const lang = navigator.language?.toLowerCase() ?? "";
      const langs = navigator.languages?.map((l) => l.toLowerCase()) ?? [lang];
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
      if (
        tz === "Europe/Istanbul" ||
        langs.some((l) => l.includes("-tr") || l.startsWith("tr"))
      ) {
        setCurrency("TRY");
      } else if (
        langs.some((l) => /(de|fr|es|it|nl|pt|pl|fi|sv|da|el|cs|hu)/.test(l)) ||
        /(Europe|Atlantic\/Canary)/.test(tz)
      ) {
        setCurrency("EUR");
      }
    } catch {}
  }, []);

  const sortedProducts = useMemo(() => {
    const order = ["PRO", "ELITE", "ENTERPRISE"];
    return [...products].sort(
      (a, b) =>
        order.indexOf(a.metadata?.tier ?? "") - order.indexOf(b.metadata?.tier ?? ""),
    );
  }, [products]);

  const findPrice = (p: StripeProduct) => {
    const stripeInterval = interval === "monthly" ? "month" : "year";
    return p.prices.find(
      (pr) =>
        pr.currency.toUpperCase() === currency &&
        pr.recurring?.interval === stripeInterval,
    );
  };

  const checkout = async (priceId: string) => {
    setActioning(priceId);
    setError(null);
    try {
      const r = await fetch("/api/billing/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const d = await r.json();
      if (!r.ok || !d.url) {
        setError(d.error || "Checkout oluşturulamadı");
        return;
      }
      window.location.href = d.url;
    } catch (err: any) {
      setError(err?.message || "Checkout hatası");
    } finally {
      setActioning(null);
    }
  };

  const cryptoCheckout = async (tier: string) => {
    const planId = tier.toLowerCase();
    const key = `crypto-${planId}-${interval}`;
    setActioning(key);
    setError(null);
    try {
      const r = await fetch("/api/billing/crypto/invoice", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, interval, currency }),
      });
      const d = await r.json();
      if (!r.ok || !d.url) {
        setError(d.error || d.detail || "Kripto fatura oluşturulamadı");
        return;
      }
      window.location.href = d.url;
    } catch (err: any) {
      setError(err?.message || "Kripto fatura hatası");
    } finally {
      setActioning(null);
    }
  };

  const openPortal = async () => {
    setActioning("portal");
    try {
      const r = await fetch("/api/billing/portal", {
        method: "POST",
        credentials: "include",
      });
      const d = await r.json();
      if (!r.ok || !d.url) {
        setError(d.error || "Portal açılamadı");
        return;
      }
      window.location.href = d.url;
    } finally {
      setActioning(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="animate-spin" size={32} style={{ color: "var(--color-accent)" }} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6 gap-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight font-['Syne']"
            style={{ color: "var(--color-text)" }}
          >
            Abonelik & Faturalandırma
          </h1>
          <p className="text-xs font-mono mt-1" style={{ color: "var(--color-muted)" }}>
            Plan seç • Stripe ile öde {config?.cryptoEnabled && "• Kripto ödeme aktif"}
          </p>
        </div>

        {sub?.subscription?.stripeSubscriptionId && (
          <button
            onClick={openPortal}
            disabled={actioning === "portal"}
            className="px-4 py-2 rounded-lg font-mono text-xs flex items-center gap-2 border transition-colors hover:opacity-90"
            style={{
              borderColor: "var(--color-border)",
              background: "var(--color-card)",
              color: "var(--color-text)",
            }}
          >
            {actioning === "portal" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ExternalLink size={14} />
            )}
            Aboneliği Yönet
          </button>
        )}
      </div>

      {/* Current Subscription */}
      {sub?.subscription && (
        <div
          className="rounded-xl border p-4 flex items-center justify-between flex-wrap gap-3"
          style={{
            borderColor: "var(--color-border)",
            background: "var(--color-card)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(0,201,167,0.15)" }}
            >
              <Sparkles size={18} style={{ color: "var(--color-accent)" }} />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                Aktif Plan: {sub.subscription.planId.toUpperCase()}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>
                {sub.subscription.status} · {sub.subscription.billingInterval} · {sub.subscription.currency}{" "}
                {Number(sub.subscription.amount).toFixed(2)}
                {sub.subscription.cancelAtPeriodEnd && " · iptal kuyruğunda"}
              </div>
            </div>
          </div>
          {sub.subscription.currentPeriodEnd && (
            <div className="text-[10px] font-mono" style={{ color: "var(--color-muted)" }}>
              Yenileme: {new Date(sub.subscription.currentPeriodEnd).toLocaleDateString("tr-TR")}
            </div>
          )}
        </div>
      )}

      {/* Currency / Interval selectors */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: "var(--color-border)" }}>
          {(["USD", "EUR", "TRY"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className="px-3 py-1.5 text-xs font-mono rounded-md transition-colors"
              style={{
                background: currency === c ? "var(--color-accent)" : "transparent",
                color: currency === c ? "#000" : "var(--color-text)",
              }}
            >
              {CURRENCY_SYMBOL[c]} {c}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: "var(--color-border)" }}>
          {(["monthly", "yearly"] as const).map((i) => (
            <button
              key={i}
              onClick={() => setInterval(i)}
              className="px-3 py-1.5 text-xs font-mono rounded-md transition-colors"
              style={{
                background: interval === i ? "var(--color-accent)" : "transparent",
                color: interval === i ? "#000" : "var(--color-text)",
              }}
            >
              {i === "monthly" ? "Aylık" : "Yıllık"}
              {i === "yearly" && (
                <span className="ml-1 text-[9px] opacity-80">−17%</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          className="rounded-lg border p-3 text-xs font-mono"
          style={{
            borderColor: "rgba(255,77,109,0.4)",
            background: "rgba(255,77,109,0.08)",
            color: "#FF4D6D",
          }}
        >
          ⚠ {error}
          {error.includes("synced") && (
            <div className="mt-1 opacity-80">
              İpucu: <code>pnpm --filter @workspace/scripts run seed:stripe</code> çalıştırıldıktan sonra webhook senkronize etmesi 5–10 sn sürebilir.
            </div>
          )}
        </div>
      )}

      {/* Plans grid */}
      {sortedProducts.length === 0 && !error ? (
        <div
          className="rounded-xl border p-8 text-center font-mono text-sm"
          style={{ borderColor: "var(--color-border)", background: "var(--color-card)", color: "var(--color-muted)" }}
        >
          Henüz Stripe ürünleri DB'ye sync edilmedi.
          <div className="mt-2 text-xs opacity-70">Seed script çalıştır → webhook ürünleri çekecek.</div>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          {sortedProducts.map((p) => {
            const price = findPrice(p);
            const tier = p.metadata?.tier ?? "";
            const features = FEATURES_BY_TIER[tier] ?? [];
            const isCurrent = sub?.subscription?.planId?.toUpperCase() === tier;
            const isElite = tier === "ELITE";
            return (
              <div
                key={p.id}
                className="rounded-xl border p-5 flex flex-col gap-4 transition-all hover:scale-[1.01]"
                style={{
                  borderColor: isElite
                    ? "var(--color-accent)"
                    : "var(--color-border)",
                  background: "var(--color-card)",
                  boxShadow: isElite
                    ? "0 0 24px rgba(0,201,167,0.18)"
                    : "none",
                }}
              >
                {isElite && (
                  <div
                    className="text-[9px] font-mono tracking-widest uppercase px-2 py-0.5 rounded self-start"
                    style={{ background: "var(--color-accent)", color: "#000" }}
                  >
                    En Popüler
                  </div>
                )}

                <div>
                  <div className="text-lg font-bold" style={{ color: "var(--color-text)" }}>
                    {p.name}
                  </div>
                  <div className="text-[11px] font-mono mt-1" style={{ color: "var(--color-muted)" }}>
                    {p.description}
                  </div>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold" style={{ color: "var(--color-text)" }}>
                    {CURRENCY_SYMBOL[currency]}
                    {price ? (price.unit_amount / 100).toLocaleString("tr-TR") : "—"}
                  </span>
                  <span className="text-xs font-mono" style={{ color: "var(--color-muted)" }}>
                    /{interval === "monthly" ? "ay" : "yıl"}
                  </span>
                </div>

                <ul className="flex flex-col gap-2 flex-1">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs font-mono" style={{ color: "var(--color-text)" }}>
                      <Check size={14} className="shrink-0 mt-0.5" style={{ color: "var(--color-accent)" }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  disabled={!price || actioning === price?.id || isCurrent}
                  onClick={() => price && checkout(price.id)}
                  className="w-full py-2.5 rounded-lg font-mono text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  style={{
                    background: isElite ? "var(--color-accent)" : "transparent",
                    color: isElite ? "#000" : "var(--color-text)",
                    border: `1px solid ${isElite ? "var(--color-accent)" : "var(--color-border)"}`,
                  }}
                >
                  {actioning === price?.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : isCurrent ? (
                    "Mevcut Plan"
                  ) : (
                    <>
                      <CreditCard size={14} />
                      Stripe ile Öde
                    </>
                  )}
                </button>

                {config?.cryptoEnabled && !isCurrent && tier && (() => {
                  const cryptoKey = `crypto-${tier.toLowerCase()}-${interval}`;
                  const busy = actioning === cryptoKey;
                  return (
                    <button
                      onClick={() => cryptoCheckout(tier)}
                      disabled={busy}
                      className="w-full py-2 rounded-lg font-mono text-[10px] flex items-center justify-center gap-2 transition-all disabled:opacity-50 hover:opacity-90"
                      style={{
                        border: "1px solid var(--color-border)",
                        color: "var(--color-text)",
                        background: "rgba(247, 147, 26, 0.06)",
                      }}
                      title="NOWPayments ile BTC / USDT (TRC20) / ETH ile öde"
                    >
                      {busy ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <>
                          <Bitcoin size={12} />
                          Kripto ile Öde (BTC / USDT)
                        </>
                      )}
                    </button>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      <div className="text-[10px] font-mono opacity-60 text-center pt-4" style={{ color: "var(--color-muted)" }}>
        Stripe güvenli ödeme · KDV dahil · İstediğiniz an iptal · 7 gün ücretsiz deneme
      </div>
    </div>
  );
}
