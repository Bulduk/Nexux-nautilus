import { useToastStore, type Toast } from "../state/toastStore";
import { CheckCircle2, XCircle, AlertTriangle, Info, Zap, Users, X } from "lucide-react";
import { clsx } from "clsx";

const KIND_CONFIG: Record<Toast["kind"], { icon: React.ElementType; color: string; bg: string; border: string }> = {
  success:   { icon: CheckCircle2,  color: "#00C9A7", bg: "rgba(0,201,167,0.08)",  border: "rgba(0,201,167,0.25)" },
  error:     { icon: XCircle,       color: "#FF4D6D", bg: "rgba(255,77,109,0.08)", border: "rgba(255,77,109,0.25)" },
  warning:   { icon: AlertTriangle, color: "#F59E0B", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)" },
  info:      { icon: Info,          color: "#38BDF8", bg: "rgba(56,189,248,0.08)", border: "rgba(56,189,248,0.25)" },
  autoexec:  { icon: Zap,           color: "#00FFB2", bg: "rgba(0,255,178,0.08)",  border: "rgba(0,255,178,0.25)" },
  council:   { icon: Users,         color: "#A78BFA", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.25)" },
};

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const cfg = KIND_CONFIG[t.kind];
  const Icon = cfg.icon;
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-2xl border shadow-2xl font-mono min-w-[260px] max-w-[340px] animate-[slideInRight_0.25s_ease-out]"
      style={{ background: cfg.bg, borderColor: cfg.border, boxShadow: `0 4px 32px ${cfg.color}18` }}
    >
      <Icon size={14} className="shrink-0 mt-0.5" style={{ color: cfg.color }} />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold truncate" style={{ color: cfg.color }}>{t.title}</p>
        {t.body && (
          <p className="text-[10px] mt-0.5 leading-relaxed break-words" style={{ color: "var(--color-muted)" }}>
            {t.body}
          </p>
        )}
      </div>
      <button
        onClick={() => dismiss(t.id)}
        className="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:opacity-70 transition-opacity"
        style={{ color: "var(--color-muted)" }}
      >
        <X size={10} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 z-[100] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem t={t} />
        </div>
      ))}
    </div>
  );
}
