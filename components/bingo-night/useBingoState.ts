"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicState } from "@/lib/bingo-night/server";

/** Polls the live game every `everyMs` (2s): the whole state each time, so a dropped connection catches up at once. */
export function useBingoState(everyMs = 2000) {
  const [state, setState] = useState<PublicState | null>(null);
  const [offline, setOffline] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/bingo-night/state", { cache: "no-store" });
        if (res.ok) {
          const s = (await res.json()) as PublicState;
          if (!stop) {
            setState(s);
            setOffline(false);
          }
        } else if (!stop) setOffline(true);
      } catch {
        if (!stop) setOffline(true);
      }
      if (!stop) timer.current = setTimeout(tick, document.hidden ? everyMs * 3 : everyMs);
    };
    void tick();
    return () => {
      stop = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [everyMs]);

  return { state, offline };
}
