import { useEffect, useState, useRef } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { LogOut, Crown, Shield, Sparkles, ChevronDown } from "lucide-react";
import { apiGet } from "../lib/api";

interface MeResponse {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    role: string;
    plan: string;
    planStatus: string;
    trialEndsAt: string | null;
    currency: string;
  };
  plan: {
    name: string;
    tier: string;
  } | null;
  subscription: {
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  } | null;
}

const PLAN_COLORS: Record<string, { bg: string; text: string; icon: any }> = {
  FREE: { bg: "rgba(218,226,253,0.12)", text: "#dae2fd", icon: Sparkles },
  PRO: { bg: "rgba(0,255,178,0.18)", text: "#00FFB2", icon: Shield },
  ELITE: { bg: "rgba(168,85,247,0.18)", text: "#c4b5fd", icon: Crown },
  ENTERPRISE: { bg: "rgba(255,193,7,0.18)", text: "#fbbf24", icon: Crown },
};

function formatTrialDays(trialEndsAt: string | null): string | null {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  if (ms <= 0) return "Süresi doldu";
  const days = Math.ceil(ms / (24 * 3600 * 1000));
  return `${days} gün`;
}

export function UserBadge() {
  const { user, isAuthenticated, logout } = useAuth();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    apiGet<MeResponse>("/me")
      .then(setMe)
      .catch(() => {});
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!isAuthenticated || !user) return null;

  const planTier = me?.plan?.tier ?? me?.user.plan ?? "FREE";
  const planMeta = PLAN_COLORS[planTier] ?? PLAN_COLORS.FREE!;
  const PlanIcon = planMeta.icon;
  const trialLabel = formatTrialDays(me?.user.trialEndsAt ?? null);
  const isOwner = me?.user.role === "OWNER";

  const displayName = user.firstName ?? me?.user.email?.split("@")[0] ?? "?";
  const initials = (user.firstName?.[0] ?? me?.user.email?.[0] ?? "?").toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 py-1 rounded-md border transition-colors"
        style={{
          borderColor: "var(--color-header-border)",
          background: open ? "var(--color-card)" : "transparent",
        }}
        data-testid="user-badge"
      >
        {user.profileImageUrl ? (
          <img src={user.profileImageUrl} alt="" className="w-6 h-6 rounded-full" />
        ) : (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ background: "var(--color-accent)", color: "#0b1326" }}
          >
            {initials}
          </div>
        )}
        <span className="hidden lg:inline text-[11px] font-mono" style={{ color: "var(--color-text)" }}>
          {displayName}
        </span>
        <span
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
          style={{ background: planMeta.bg, color: planMeta.text }}
        >
          <PlanIcon size={9} />
          {planTier}
        </span>
        <ChevronDown size={12} style={{ color: "var(--color-muted)" }} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-72 rounded-lg border shadow-2xl z-50 font-mono"
          style={{ background: "var(--color-card)", borderColor: "var(--color-header-border)" }}
        >
          <div className="p-3 border-b" style={{ borderColor: "var(--color-header-border)" }}>
            <div className="text-[11px] font-bold" style={{ color: "var(--color-text)" }}>
              {me?.user.fullName ?? user.firstName ?? "Kullanıcı"}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--color-muted)" }}>
              {me?.user.email ?? user.email}
            </div>
            {isOwner && (
              <div
                className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                style={{ background: "rgba(255,193,7,0.18)", color: "#fbbf24" }}
              >
                <Crown size={9} /> OWNER
              </div>
            )}
          </div>

          <div className="p-3 border-b space-y-1.5" style={{ borderColor: "var(--color-header-border)" }}>
            <div className="flex items-center justify-between text-[10px]">
              <span style={{ color: "var(--color-muted)" }}>Plan</span>
              <span style={{ color: planMeta.text }} className="font-bold">
                {me?.plan?.name ?? planTier}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span style={{ color: "var(--color-muted)" }}>Durum</span>
              <span
                className="font-bold uppercase"
                style={{
                  color:
                    me?.user.planStatus === "active"
                      ? "#00FFB2"
                      : me?.user.planStatus === "trialing"
                      ? "#fbbf24"
                      : "#ff4d6d",
                }}
              >
                {me?.user.planStatus ?? "—"}
              </span>
            </div>
            {trialLabel && (
              <div className="flex items-center justify-between text-[10px]">
                <span style={{ color: "var(--color-muted)" }}>Deneme süresi</span>
                <span style={{ color: "#fbbf24" }} className="font-bold">
                  {trialLabel}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-[10px]">
              <span style={{ color: "var(--color-muted)" }}>Para birimi</span>
              <span style={{ color: "var(--color-text)" }} className="font-bold">
                {me?.user.currency ?? "USD"}
              </span>
            </div>
          </div>

          {planTier === "FREE" && (
            <div className="p-3 border-b" style={{ borderColor: "var(--color-header-border)" }}>
              <button
                type="button"
                className="w-full px-3 py-2 rounded text-[11px] font-bold uppercase tracking-wider transition-colors"
                style={{ background: "var(--color-accent)", color: "#0b1326" }}
                onClick={() => alert("Stripe entegrasyonu Faz 5'te eklenecek")}
                data-testid="upgrade-button"
              >
                ⚡ PRO'ya Yükselt
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 p-3 text-[11px] font-bold uppercase tracking-wider transition-colors hover:opacity-80"
            style={{ color: "#ff4d6d" }}
            data-testid="sign-out-button"
          >
            <LogOut size={12} /> Çıkış Yap
          </button>
        </div>
      )}
    </div>
  );
}
