import { useEffect, useState } from 'react';
import { economyApi } from '../../services/api/economy.api';

/**
 * The league's currency symbol from the public catalog (ECO-13). Empty while
 * loading, when `enabled` is false, or if the lookup fails, so amounts still
 * read as plain numbers.
 */
export function useCurrencySymbol(enabled = true): string {
  const [symbol, setSymbol] = useState('');

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const load = async () => {
      try {
        const catalog = await economyApi.getCatalog(controller.signal);
        if (!controller.signal.aborted) setSymbol(catalog.currencySymbol);
      } catch {
        // Amounts show without a symbol.
      }
    };
    void load();
    return () => controller.abort();
  }, [enabled]);

  return symbol;
}
