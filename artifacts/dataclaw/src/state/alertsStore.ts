import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { toast } from "./toastStore";

export type AlertCondition = "above" | "below";

export interface PriceAlert {
  id: string;
  symbol: string;
  condition: AlertCondition;
  targetPrice: number;
  createdAt: number;
  firedAt?: number;
}

interface AlertsState {
  alerts: PriceAlert[];
  addAlert: (symbol: string, condition: AlertCondition, targetPrice: number) => void;
  removeAlert: (id: string) => void;
  checkPrices: (prices: Record<string, number>) => void;
}

export const useAlertsStore = create<AlertsState>()(
  persist(
    (set, get) => ({
      alerts: [],

      addAlert: (symbol, condition, targetPrice) => {
        const id = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        set((s) => ({ alerts: [...s.alerts, { id, symbol, condition, targetPrice, createdAt: Date.now() }] }));
      },

      removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),

      checkPrices: (prices) => {
        const { alerts } = get();
        const updated: PriceAlert[] = [];
        let anyFired = false;

        for (const alert of alerts) {
          if (alert.firedAt) { updated.push(alert); continue; }
          const price = prices[alert.symbol];
          if (!price) { updated.push(alert); continue; }

          const triggered =
            (alert.condition === "above" && price >= alert.targetPrice) ||
            (alert.condition === "below" && price <= alert.targetPrice);

          if (triggered) {
            const fired: PriceAlert = { ...alert, firedAt: Date.now() };
            updated.push(fired);
            anyFired = true;

            toast({
              kind: "warning",
              title: `ALARM — ${alert.symbol}`,
              body: `${alert.symbol} $${price.toFixed(2)} — hedef ${alert.condition === "above" ? "≥" : "≤"} $${alert.targetPrice.toLocaleString()} tetiklendi`,
              durationMs: 10_000,
            });

            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(`${alert.symbol} Fiyat Alarmı`, {
                body: `${alert.symbol} $${price.toFixed(2)} hedef ${alert.condition === "above" ? "üzeri" : "altı"} $${alert.targetPrice.toLocaleString()} tetiklendi`,
                icon: "/favicon.ico",
              });
            }
          } else {
            updated.push(alert);
          }
        }

        if (anyFired) set({ alerts: updated });
      },
    }),
    {
      name: "nexus-price-alerts",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
