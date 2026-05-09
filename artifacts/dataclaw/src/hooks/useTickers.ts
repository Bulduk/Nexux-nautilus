import { useEffect, useRef, useState } from "react";
import { apiGet } from "../lib/api";

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

interface TickerResponse {
  tickers: TickerSnapshot[];
  cached?: boolean;
  stale?: boolean;
}

const DEFAULT_SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"];

// Client-side cache to avoid redundant re-renders across hook instances
const clientCache = new Map<string, { data: Record<string, TickerSnapshot>; ts: number }>();
const CLIENT_TTL = 12_000; // 12 s — slightly above server's 10 s TTL

export function useTickers(symbols: string[] = DEFAULT_SYMBOLS, refreshMs = 15_000) {
  const symbolsKey = symbols.join(",");

  // Seed from client-side cache on first render
  const [data, setData] = useState<Record<string, TickerSnapshot>>(() => {
    const hit = clientCache.get(symbolsKey);
    return hit ? hit.data : {};
  });
  const [loading, setLoading] = useState(() => !clientCache.has(symbolsKey));
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    const tick = async () => {
      // Skip if client cache is still fresh
      const hit = clientCache.get(symbolsKey);
      if (hit && Date.now() - hit.ts < CLIENT_TTL) {
        if (!cancelled) {
          setData(hit.data);
          setLoading(false);
        }
        return;
      }

      try {
        const res = await apiGet<TickerResponse>(
          `/markets/ticker?symbols=${encodeURIComponent(symbolsKey)}`,
        );
        if (cancelled) return;
        const map: Record<string, TickerSnapshot> = {};
        for (const t of res.tickers) map[t.symbol] = t;
        clientCache.set(symbolsKey, { data: map, ts: Date.now() });
        setData(map);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void tick();
    const i = setInterval(tick, refreshMs);
    return () => {
      cancelled = true;
      mounted.current = false;
      clearInterval(i);
    };
  }, [symbolsKey, refreshMs]);

  return { data, loading, error };
}
