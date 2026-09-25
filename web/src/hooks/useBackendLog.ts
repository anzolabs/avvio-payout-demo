import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { LogLine } from '../api/types';

/** Tails the backend's log. `clear` empties the view only; the backend keeps its log. */
export function useBackendLog(): { lines: LogLine[]; clear: () => void } {
  const [lines, setLines] = useState<LogLine[]>([]);
  const lastAt = useRef('');

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const fresh = await api.log(lastAt.current);
        if (fresh.length && !stopped) {
          lastAt.current = fresh[fresh.length - 1].at;
          setLines((prev) => [...prev, ...fresh].slice(-300));
        }
      } catch {
        // next tick
      }
      if (!stopped) setTimeout(poll, 3000);
    };
    void poll();
    return () => { stopped = true; };
  }, []);

  const clear = useCallback(() => setLines([]), []);
  return { lines, clear };
}
