import { useEffect, useState } from "react";
import type { PaywallEventDetail } from "../lib/api";

interface Props {
  onUpgrade: () => void;
}

export default function PaywallModal({ onUpgrade }: Props) {
  const [detail, setDetail] = useState<PaywallEventDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<PaywallEventDetail>;
      setDetail(ce.detail);
    };
    window.addEventListener("nexus:paywall", handler as EventListener);
    return () => window.removeEventListener("nexus:paywall", handler as EventListener);
  }, []);

  if (!detail) return null;

  const close = () => setDetail(null);
  const upgrade = () => { close(); onUpgrade(); };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ background: "rgba(2, 6, 12, 0.78)", backdropFilter: "blur(6px)" }}
      role="dialog"
      aria-modal="true"
      onClick={close}
    >
      <div
        className="relative max-w-md w-full p-6 rounded-lg border font-mono"
        style={{
          background: "var(--color-panel, #0b1326)",
          borderColor: "var(--color-accent, #00C9A7)",
          boxShadow: "0 0 40px rgba(0, 201, 167, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="text-[10px] tracking-widest uppercase mb-3"
          style={{ color: "var(--color-accent, #00C9A7)" }}
        >
          {detail.trialExpired ? "▲ Deneme Süresi Bitti" : "▲ Plan Yetersiz"}
        </div>

        <h2 className="text-xl mb-2" style={{ color: "var(--color-text, #e6edf3)" }}>
          {detail.trialExpired ? "Devam etmek için bir plan seç" : `${detail.requiredTier} planı gerekli`}
        </h2>

        <p
          className="text-sm leading-relaxed mb-4"
          style={{ color: "var(--color-muted, #8b95a8)" }}
        >
          {detail.message}
        </p>

        <div className="flex items-center gap-2 mb-5 text-xs">
          <span className="px-2 py-1 rounded border" style={{ borderColor: "var(--color-grid, #1a2438)" }}>
            Şu an: <span style={{ color: "var(--color-text, #e6edf3)" }}>{detail.currentTier}</span>
          </span>
          <span style={{ color: "var(--color-muted, #8b95a8)" }}>→</span>
          <span
            className="px-2 py-1 rounded border"
            style={{ borderColor: "var(--color-accent, #00C9A7)", color: "var(--color-accent, #00C9A7)" }}
          >
            Hedef: {detail.requiredTier}
          </span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={close}
            className="flex-1 py-2 rounded border text-xs uppercase tracking-widest transition-opacity hover:opacity-70"
            style={{ borderColor: "var(--color-grid, #1a2438)", color: "var(--color-muted, #8b95a8)" }}
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={upgrade}
            className="flex-1 py-2 rounded text-xs uppercase tracking-widest font-semibold transition-opacity hover:opacity-90"
            style={{ background: "var(--color-accent, #00C9A7)", color: "#0b1326" }}
          >
            Planları Gör
          </button>
        </div>
      </div>
    </div>
  );
}
