import { useCallback, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  CalendarClock,
  Gavel,
  RotateCcw,
  ShoppingCart,
  SlidersHorizontal,
  Trophy,
  Undo2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  contractsApi,
  type LedgerEntryKind,
  type OwnLedgerEntry,
} from '../../services/api/contracts.api';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import Skeleton from '../ui/Skeleton';
import { formatMoney } from './wallet';
import './LedgerHistory.css';

export const LEDGER_PAGE_SIZE = 25;

const KIND_ICONS: Record<LedgerEntryKind, LucideIcon> = {
  perMatchPay: Banknote,
  winBonus: Trophy,
  salary: CalendarClock,
  fine: Gavel,
  fineRescinded: Undo2,
  purchase: ShoppingCart,
  refund: RotateCcw,
  gmAdjust: SlidersHorizontal,
  reversal: Undo2,
};

const KIND_LABELS: Record<LedgerEntryKind, string> = {
  perMatchPay: 'Match pay',
  winBonus: 'Win bonus',
  salary: 'Weekly salary',
  fine: 'Fine',
  fineRescinded: 'Fine cancelled',
  purchase: 'Shop purchase',
  refund: 'Refund',
  gmAdjust: 'Balance correction',
  reversal: 'Match pay reversed',
};

export interface LedgerHistoryProps {
  currencySymbol: string;
}

/** The player's own wallet history, newest first, a page at a time (ECO-13). */
export default function LedgerHistory({ currencySymbol }: LedgerHistoryProps) {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<OwnLedgerEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const page = await contractsApi.getMyLedger({ limit: LEDGER_PAGE_SIZE }, controller.signal);
        if (controller.signal.aborted) return;
        setEntries(page.items);
        setNextCursor(page.nextCursor);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : t('wallet.ledger.loadFailed', 'Could not load your wallet history.'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [t]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await contractsApi.getMyLedger({ cursor: nextCursor, limit: LEDGER_PAGE_SIZE });
      setEntries((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('wallet.ledger.loadFailed', 'Could not load your wallet history.'));
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, t]);

  if (loading) return <Skeleton variant="block" count={3} />;
  if (error && entries.length === 0) return <EmptyState title={error} />;
  if (entries.length === 0) {
    return <EmptyState title={t('wallet.ledger.empty', 'No money has moved yet. Pay, bonuses and fines will show up here.')} />;
  }

  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  return (
    <div className="ledger-history">
      <ul className="ledger-history__list">
        {entries.map((entry) => {
          const Icon = KIND_ICONS[entry.kind] ?? SlidersHorizontal;
          const tone = entry.amount < 0 ? 'out' : 'in';
          return (
            <li key={entry.entryId} className="ledger-history__row">
              <span className={`ledger-history__icon ledger-history__icon--${tone}`} aria-hidden="true">
                <Icon size={18} />
              </span>
              <span className="ledger-history__main">
                <span className="ledger-history__kind">
                  {t(`wallet.kinds.${entry.kind}`, KIND_LABELS[entry.kind] ?? entry.kind)}
                </span>
                {entry.note && <span className="ledger-history__note">{entry.note}</span>}
                <time className="ledger-history__date" dateTime={entry.createdAt}>
                  {dateFormat.format(new Date(entry.createdAt))}
                </time>
              </span>
              <span className="ledger-history__amounts">
                <span className={`ledger-history__amount ledger-history__amount--${tone}`}>
                  {formatMoney(entry.amount, currencySymbol, i18n.language, true)}
                </span>
                <span className="ledger-history__after">
                  {t('wallet.ledger.balanceAfter', {
                    defaultValue: 'Balance {{amount}}',
                    amount: formatMoney(entry.balanceAfter, currencySymbol, i18n.language),
                  })}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {error && <p className="ledger-history__error" role="alert">{error}</p>}
      {nextCursor && (
        <Button variant="secondary" size="sm" loading={loadingMore} onClick={() => void loadMore()}>
          {t('wallet.ledger.loadMore', 'Show older entries')}
        </Button>
      )}
    </div>
  );
}
