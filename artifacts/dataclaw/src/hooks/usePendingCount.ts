import { useEffect, useRef, useState } from "react";
import { apiGet } from "../lib/api";

export function usePendingCount(pollMs = 5000): number {
  const [count, setCount] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const poll = async () => {
      try {
        const d = await apiGet<{ total: number }>("/signals/pending");
        if (mountedRef.current) setCount(d.total ?? 0);
      } catch { /* ignore */ }
    };
    void poll();
    const i = setInterval(poll, pollMs);
    return () => {
      mountedRef.current = false;
      clearInterval(i);
    };
  }, [pollMs]);

  return count;
}
