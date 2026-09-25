import { useEffect } from 'react';
import { api } from '../api/client';
import { isTerminal, Withdrawal } from '../api/types';

/**
 * Refreshes a withdrawal from the backend every two seconds until nothing can
 * change it. That includes `completed`: a bank return arrives after it.
 */
export function useWithdrawalPolling(current: Withdrawal | null, onUpdate: (w: Withdrawal) => void): void {
  useEffect(() => {
    if (!current || isTerminal(current.status)) return undefined;
    const id = current.id;
    const timer = setInterval(async () => {
      try {
        onUpdate(await api.withdrawal(id));
      } catch {
        // next tick
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [current, onUpdate]);
}
