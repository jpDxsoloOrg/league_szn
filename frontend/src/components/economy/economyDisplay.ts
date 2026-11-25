import type { GmInterferenceStatus, ShopLedgerEntry } from '../../services/api/shop.api';
import type { BadgeTone } from '../ui/Badge';

/** Badge tone per GM interference status, shared by the shop and the GM queue (ECO-14). */
export const GM_STATUS_TONES: Record<GmInterferenceStatus, BadgeTone> = {
  pending: 'warning',
  delivered: 'win',
  partial: 'primary',
  taken: 'loss',
  refunded: 'neutral',
};

/** Fines (`fine` entries) and the ids of the fines already rescinded. */
export function splitFines(entries: readonly ShopLedgerEntry[]): { fines: ShopLedgerEntry[]; rescinded: Set<string> } {
  const rescinded = new Set(
    entries
      .filter((entry) => entry.kind === 'fineRescinded' && entry.refType === 'ledgerEntry' && entry.refId)
      .map((entry) => entry.refId as string),
  );
  return { fines: entries.filter((entry) => entry.kind === 'fine'), rescinded };
}
