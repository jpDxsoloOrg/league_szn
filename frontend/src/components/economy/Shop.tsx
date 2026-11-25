import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShoppingBag, Wallet } from 'lucide-react';
import {
  economyApi,
  type CatalogItem,
  type EconomyCatalog,
  type ShopItemKey,
} from '../../services/api/economy.api';
import {
  shopApi,
  type OwnEconomyFields,
  type PlayerEffect,
  type PlayerGmInterferenceRequest,
  type PurchasableItem,
} from '../../services/api/shop.api';
import { matchesApi, playersApi, profileApi } from '../../services/api';
import type { Match } from '../../types';
import { formatCalendarDate } from '../../utils/dateUtils';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import Modal from '../ui/Modal';
import PageHeader from '../ui/PageHeader';
import Select from '../ui/Select';
import Skeleton from '../ui/Skeleton';
import { useToast } from '../ui/toastContext';
import { economyErrorMessage } from './economyErrors';
import GmInterferenceSection from './GmInterferenceSection';
import {
  boostableMatches,
  formatMoney,
  injuryWeeksLeft,
  PENDING_EFFECT_ITEMS,
  shopBlockReason,
  type ShopBlockReason,
} from './shopItems';
import './Shop.css';

interface ShopData {
  catalog: EconomyCatalog;
  playerId: string;
  balance: number;
  effects: PlayerEffect[];
  /** When the active injury ends (INJ-03 `currentInjury.returnsAt`); unset when not injured. */
  injuryReturnsAt?: string;
  matches: Match[];
  names: Map<string, string>;
  requests: PlayerGmInterferenceRequest[];
}

/** The effect line for each item, with its numbers from the settings. */
function effectText(item: CatalogItem, t: ReturnType<typeof useTranslation>['t']): string {
  switch (item.key) {
    case 'injuryShield':
      return t('economyShop.items.injuryShield.effect', {
        percent: Math.round(('chanceReduction' in item ? item.chanceReduction : 0) * 100),
        count: 'matches' in item ? item.matches : 0,
      });
    case 'rehab':
      return t('economyShop.items.rehab.effect', { count: 'weeksOff' in item ? item.weeksOff : 0 });
    case 'staminaTopUp':
      return t('economyShop.items.staminaTopUp.effect', { amount: 'amount' in item ? item.amount : 0 });
    case 'simInterference':
      return t('economyShop.items.simInterference.effect', { boost: 'ratingBoost' in item ? item.ratingBoost : 0 });
    case 'gmInterference':
      return t('economyShop.items.gmInterference.effect');
    default:
      return '';
  }
}

/** The player shop (ECO-14): buy items, sim interference and GM interference. */
export default function Shop() {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();

  const [data, setData] = useState<ShopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [buying, setBuying] = useState<CatalogItem | null>(null);
  const [boostMatchId, setBoostMatchId] = useState('');
  const [requestId, setRequestId] = useState('');
  const [busy, setBusy] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [catalog, profile, mine] = await Promise.all([
        economyApi.getCatalog(signal),
        profileApi.getMyProfile(signal),
        shopApi.listMyGmInterference(signal),
      ]);
      const [matches, directory] = await Promise.all([
        matchesApi.getAll({ status: 'scheduled', playerId: profile.playerId }, signal),
        playersApi.getDirectory(signal),
      ]);
      if (signal?.aborted) return;
      const own = profile as typeof profile & OwnEconomyFields & { currentInjury?: { returnsAt?: string } };
      setData({
        catalog,
        playerId: profile.playerId,
        balance: own.balance ?? 0,
        effects: own.effects ?? [],
        injuryReturnsAt: own.currentInjury?.returnsAt,
        matches,
        names: new Map(directory.map((entry) => [entry.playerId, entry.name])),
        requests: mine.requests,
      });
      setLoadFailed(false);
    } catch {
      if (!signal?.aborted) setLoadFailed(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const boostable = useMemo(
    () => (data ? boostableMatches(data.matches, data.playerId) : []),
    [data],
  );

  const symbol = data?.catalog.currencySymbol ?? '$';
  const money = (amount: number) => formatMoney(amount, symbol, i18n.language);

  const describeMatch = (match: Match): string => {
    const opponents = match.participants
      .filter((participantId) => participantId !== data?.playerId)
      .map((participantId) => data?.names.get(participantId) ?? t('common.unknown'));
    return t('economyShop.matchOption', {
      date: formatCalendarDate(match.date, i18n.language),
      opponents: opponents.join(', ') || t('common.unknown'),
    });
  };

  const openBuy = (item: CatalogItem) => {
    setBuying(item);
    setBuyError(null);
    setBoostMatchId(item.key === 'simInterference' ? boostable[0]?.matchId ?? '' : '');
    setRequestId(crypto.randomUUID());
  };

  const closeBuy = () => {
    if (busy) return;
    setBuying(null);
  };

  const confirmBuy = async () => {
    if (!buying || buying.key === 'gmInterference') return;
    const item = buying.key as PurchasableItem;
    setBusy(true);
    setBuyError(null);
    try {
      const result = await shopApi.purchase(
        item === 'simInterference' ? { item, target: boostMatchId } : { item, requestId },
      );
      showToast(t('economyShop.bought', { item: t(`economyShop.items.${item}.name`), balance: money(result.balance) }), 'success');
      setBuying(null);
      await load();
    } catch (err) {
      setBuyError(economyErrorMessage(err, t, t('economyShop.buyFailed')));
    } finally {
      setBusy(false);
    }
  };

  const title = t('economyShop.title');

  if (loading) {
    return (
      <div className="shop-page">
        <PageHeader title={title} />
        <Skeleton variant="cards" count={4} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="shop-page">
        <PageHeader title={title} />
        <EmptyState
          title={t('economyShop.loadFailed')}
          actionLabel={t('common.retry', 'Retry')}
          onAction={() => {
            setLoading(true);
            void load();
          }}
        />
      </div>
    );
  }

  const { catalog, balance, effects, requests } = data;
  const hasPendingRequest = requests.some((request) => request.status === 'pending');
  const reasonFor = (item: CatalogItem): ShopBlockReason | null => shopBlockReason(item.key, {
    balance,
    price: item.price,
    effects,
    boostableMatchCount: boostable.length,
    hasPendingRequest,
    injuryWeeksLeft: injuryWeeksLeft(data.injuryReturnsAt),
    pendingItems: PENDING_EFFECT_ITEMS,
  });
  const gmItem = catalog.items.find((item) => item.key === 'gmInterference');
  const buyItems = catalog.items.filter((item) => item.key !== 'gmInterference');
  const itemName = (key: ShopItemKey) => t(`economyShop.items.${key}.name`);

  return (
    <div className="shop-page">
      <PageHeader
        title={title}
        subtitle={t('economyShop.subtitle')}
        actions={(
          <span className={`shop-page__balance${balance < 0 ? ' shop-page__balance--debt' : ''}`}>
            <Wallet aria-hidden="true" size={18} />
            {t('economyShop.balance', { amount: money(balance) })}
          </span>
        )}
      />

      {loadFailed && <p className="shop-page__notice" role="status">{t('economyShop.staleData')}</p>}
      {balance < 0 && (
        <p className="shop-page__notice shop-page__notice--debt" role="alert">{t('economyShop.debtLocked')}</p>
      )}

      {catalog.items.length === 0 ? (
        <EmptyState icon={<ShoppingBag aria-hidden="true" size={32} />} title={t('economyShop.empty')} />
      ) : (
        <ul className="shop-page__grid" aria-label={t('economyShop.itemsLabel')}>
          {buyItems.map((item) => {
            const reason = reasonFor(item);
            return (
              <li key={item.key}>
                <Card className={`shop-item${reason ? ' shop-item--blocked' : ''}`}>
                  <div className="shop-item__head">
                    <h2 className="shop-item__name">{itemName(item.key)}</h2>
                    {reason === 'comingSoon' && <Badge tone="violet">{t('economyShop.comingSoon')}</Badge>}
                  </div>
                  <p className="shop-item__price">{money(item.price)}</p>
                  <p className="shop-item__effect">{effectText(item, t)}</p>
                  {reason && <p className="shop-item__reason">{t(`economyShop.blocked.${reason}`)}</p>}
                  <Button
                    size="sm"
                    disabled={reason !== null}
                    onClick={() => openBuy(item)}
                    aria-label={t('economyShop.buyItem', { item: itemName(item.key) })}
                  >
                    {t('economyShop.buy')}
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {gmItem && (
        <GmInterferenceSection
          price={gmItem.price}
          blockReason={reasonFor(gmItem)}
          requests={requests}
          matches={data.matches}
          describeMatch={describeMatch}
          formatAmount={money}
          onRequested={() => load()}
        />
      )}

      <Modal
        open={buying !== null}
        onClose={closeBuy}
        size="sm"
        title={buying ? t('economyShop.confirmTitle', { item: itemName(buying.key) }) : ''}
        footer={(
          <>
            <Button variant="ghost" onClick={closeBuy} disabled={busy}>{t('common.cancel', 'Cancel')}</Button>
            <Button
              onClick={() => void confirmBuy()}
              loading={busy}
              disabled={buying?.key === 'simInterference' && boostMatchId === ''}
            >
              {buying ? t('economyShop.confirmBuy', { price: money(buying.price) }) : ''}
            </Button>
          </>
        )}
      >
        {buying && (
          <div className="shop-confirm">
            {buyError && <p className="shop-confirm__error" role="alert">{buyError}</p>}
            <p>{effectText(buying, t)}</p>
            {buying.key === 'simInterference' && (
              <>
                <Select
                  label={t('economyShop.pickMatch')}
                  value={boostMatchId}
                  onValueChange={setBoostMatchId}
                  options={boostable.map((match) => ({ value: match.matchId, label: describeMatch(match) }))}
                />
                <p className="shop-confirm__hint">{t('economyShop.simRefundHint')}</p>
              </>
            )}
            <dl className="shop-confirm__sums">
              <div>
                <dt>{t('economyShop.price')}</dt>
                <dd>{money(buying.price)}</dd>
              </div>
              <div>
                <dt>{t('economyShop.balanceAfter')}</dt>
                <dd>{money(balance - buying.price)}</dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>
    </div>
  );
}
