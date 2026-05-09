import { useEffect, useState } from "react";
import { apiSseUrl } from "../lib/api";

export interface Signal {
  id: string;
  source: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  confidence: number;
  timestamp: string;
}

// Subscribes to the api-server's SSE channel that emits signals derived from
// real Binance OHLCV + orderbook data.
export function useRealtimeSignals() {
  const [signals, setSignals] = useState<Signal[]>([]);

  useEffect(() => {
    const sse = new EventSource(apiSseUrl("/signals/stream"));
    sse.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type !== "signal") return;
        setSignals((current) =>
          [
            {
              id: `sse-${payload.timestamp}-${payload.symbol}`,
              source: payload.source,
              symbol: payload.symbol,
              direction: payload.direction,
              confidence: payload.confidence,
              timestamp: payload.timestamp,
            } as Signal,
            ...current,
          ].slice(0, 50),
        );
      } catch (e) {
        console.error("SSE parsing error", e);
      }
    };
    return () => sse.close();
  }, []);

  return signals;
}
