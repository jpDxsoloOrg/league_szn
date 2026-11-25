import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  contractsApi,
  type Contract,
  type MyContractsResponse,
} from '../../services/api/contracts.api';
import { seasonsApi } from '../../services/api/seasons.api';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import Tabs from '../ui/Tabs';
import { useToast } from '../ui/toastContext';
import { contractLengthLabel } from './contractDisplay';
import LedgerHistory from './LedgerHistory';
import { useCurrencySymbol } from './useCurrencySymbol';
import { formatMoney, timeLeft } from './wallet';
import './MyContract.css';

type MyContractTab = 'contract' | 'wallet';

interface PageData {
  contracts: MyContractsResponse;
  seasonNames: Map<string, string>;
}

function offerTimeLeftLabel(offer: Contract, now: Date, t: TFunction): string {
  const left = timeLeft(offer.offerExpiresAt, now);
  if (left.unit === 'expired') return t('myContract.offers.expired', 'Expired');
  if (left.unit === 'days') {
    return t('myContract.offers.daysLeft', { defaultValue: '{{count}} days left', count: left.count });
  }
  return t('myContract.offers.hoursLeft', { defaultValue: '{{count}} hours left', count: left.count });
}

/** "2 of 5 matches played", or the season it runs through. */
function progressLabel(contract: Contract, seasonNames: ReadonlyMap<string, string>, t: TFunction): string {
  if (contract.matchesTotal !== undefined) {
    return t('myContract.progress', {
      defaultValue: '{{played}} of {{total}} matches played',
      played: contract.matchesPlayed,
      total: contract.matchesTotal,
    });
  }
  return contractLengthLabel(contract, seasonNames, t);
}

interface TermsProps {
  contract: Contract;
  money: (amount: number) => string;
}

function ContractTerms({ contract, money }: TermsProps) {
  const { t } = useTranslation();
  return (
    <dl className="my-contract__terms">
      <div>
        <dt>{t('myContract.terms.perMatchPay', 'Pay per match')}</dt>
        <dd>{money(contract.perMatchPay)}</dd>
      </div>
      <div>
        <dt>{t('myContract.terms.weeklySalary', 'Weekly salary')}</dt>
        <dd>{money(contract.weeklySalary)}</dd>
      </div>
      <div>
        <dt>{t('myContract.terms.winBonus', 'Win bonus')}</dt>
        <dd>{money(contract.winBonus)}</dd>
      </div>
    </dl>
  );
}

/**
 * The player's own contract page (ECO-13): the current contract and its
 * progress, the offers inbox with Accept / Decline, past contracts, and the
 * wallet with its ledger history.
 */
export default function MyContract() {
  const { t, i18n } = useTranslation();
  useDocumentTitle(t('myContract.title', 'My Contract'));
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: MyContractTab = searchParams.get('tab') === 'wallet' ? 'wallet' : 'contract';
  const currencySymbol = useCurrencySymbol();
  const [data, setData] = useState<PageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const contracts = await contractsApi.getMine(signal);
      const all = [contracts.activeContract, ...contracts.offers, ...contracts.pastContracts];
      const needsSeasons = all.some((contract) => contract?.seasonId);
      const seasons = needsSeasons ? await seasonsApi.getAll(signal) : [];
      if (signal?.aborted) return;
      setData({ contracts, seasonNames: new Map(seasons.map((season) => [season.seasonId, season.name])) });
      setError(null);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : t('myContract.loadFailed', 'Could not load your contract.'));
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const money = (amount: number) => formatMoney(amount, currencySymbol, i18n.language);

  const answerOffer = async (offer: Contract, answer: 'accept' | 'decline') => {
    setBusyOfferId(offer.contractId);
    try {
      if (answer === 'accept') {
        await contractsApi.accept(offer.contractId);
        showToast(t('myContract.offers.accepted', 'Contract signed. Welcome aboard!'), 'success');
      } else {
        await contractsApi.decline(offer.contractId);
        showToast(t('myContract.offers.declined', 'Offer declined.'), 'success');
      }
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('myContract.offers.answerFailed', 'Could not answer the offer.'), 'error');
    } finally {
      setBusyOfferId(null);
    }
  };

  const changeTab = (value: string) => {
    setSearchParams(value === 'wallet' ? { tab: 'wallet' } : {}, { replace: true });
  };

  if (error && !data) {
    return (
      <div className="my-contract">
        <PageHeader title={t('myContract.title', 'My Contract')} />
        <EmptyState title={error} actionLabel={t('common.retry')} onAction={() => void load()} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="my-contract">
        <PageHeader title={t('myContract.title', 'My Contract')} />
        <Skeleton variant="cards" count={2} />
      </div>
    );
  }

  const { contracts, seasonNames } = data;
  const active = contracts.activeContract;
  const now = new Date();
  const inDebt = contracts.balance < 0;

  const contractPanel = (
    <div className="my-contract__panel">
      <section className="my-contract__section" aria-labelledby="my-contract-current">
        <h2 id="my-contract-current" className="my-contract__heading">{t('myContract.current.title', 'Current contract')}</h2>
        {active ? (
          <Card className="my-contract__card">
            <div className="my-contract__card-head">
              <span className="my-contract__type">{t(`contracts.types.${active.type}`, active.type)}</span>
              <Badge tone="win">{t('contracts.statuses.active', 'Active')}</Badge>
            </div>
            <p className="my-contract__progress-label">{progressLabel(active, seasonNames, t)}</p>
            {active.matchesTotal !== undefined && active.matchesTotal > 0 && (
              <progress
                className="my-contract__progress"
                max={active.matchesTotal}
                value={Math.min(active.matchesPlayed, active.matchesTotal)}
                aria-label={progressLabel(active, seasonNames, t)}
              />
            )}
            <ContractTerms contract={active} money={money} />
          </Card>
        ) : (
          <EmptyState
            title={t('myContract.current.freeAgent', "You're a free agent.")}
            description={t('myContract.current.freeAgentHint', 'You still earn the free-agent win bonus. Offers from the GMs show up below.')}
          />
        )}
      </section>

      <section className="my-contract__section" aria-labelledby="my-contract-offers">
        <h2 id="my-contract-offers" className="my-contract__heading">
          {t('myContract.offers.title', 'Offers')}
          {contracts.offers.length > 0 && <Badge tone="pink">{contracts.offers.length}</Badge>}
        </h2>
        {contracts.offers.length === 0 ? (
          <p className="my-contract__muted">{t('myContract.offers.empty', 'No open offers right now.')}</p>
        ) : (
          <ul className="my-contract__offers">
            {contracts.offers.map((offer) => (
              <li key={offer.contractId}>
                <Card className="my-contract__card">
                  <div className="my-contract__card-head">
                    <span className="my-contract__type">{t(`contracts.types.${offer.type}`, offer.type)}</span>
                    <Badge tone="warning">{offerTimeLeftLabel(offer, now, t)}</Badge>
                  </div>
                  <p className="my-contract__progress-label">
                    {offer.matchesTotal !== undefined
                      ? t('myContract.offers.matches', { defaultValue: '{{count}} matches', count: offer.matchesTotal })
                      : contractLengthLabel(offer, seasonNames, t)}
                  </p>
                  <ContractTerms contract={offer} money={money} />
                  {offer.note && <p className="my-contract__note">{offer.note}</p>}
                  {active && (
                    <p className="my-contract__muted">
                      {t('myContract.offers.underContract', 'You already have a contract. You can accept once it ends.')}
                    </p>
                  )}
                  <div className="my-contract__actions">
                    <Button
                      size="sm"
                      loading={busyOfferId === offer.contractId}
                      disabled={busyOfferId !== null || active !== null}
                      onClick={() => void answerOffer(offer, 'accept')}
                    >
                      {t('myContract.offers.accept', 'Accept')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyOfferId !== null}
                      onClick={() => void answerOffer(offer, 'decline')}
                    >
                      {t('myContract.offers.decline', 'Decline')}
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="my-contract__section" aria-labelledby="my-contract-past">
        <h2 id="my-contract-past" className="my-contract__heading">{t('myContract.past.title', 'Past contracts')}</h2>
        {contracts.pastContracts.length === 0 ? (
          <p className="my-contract__muted">{t('myContract.past.empty', 'Nothing here yet.')}</p>
        ) : (
          <ul className="my-contract__past">
            {contracts.pastContracts.map((contract) => (
              <li key={contract.contractId} className="my-contract__past-row">
                <span className="my-contract__type">{t(`contracts.types.${contract.type}`, contract.type)}</span>
                <span className="my-contract__muted">{progressLabel(contract, seasonNames, t)}</span>
                <Badge tone="neutral">{t(`contracts.statuses.${contract.status}`, contract.status)}</Badge>
                {(contract.endedAt ?? contract.updatedAt) && (
                  <time className="my-contract__muted" dateTime={contract.endedAt ?? contract.updatedAt}>
                    {new Date(contract.endedAt ?? contract.updatedAt).toLocaleDateString(i18n.language)}
                  </time>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  const walletPanel = (
    <div className="my-contract__panel">
      <LedgerHistory currencySymbol={currencySymbol} />
    </div>
  );

  return (
    <div className="my-contract">
      <PageHeader
        title={t('myContract.title', 'My Contract')}
        subtitle={t('myContract.subtitle', 'Your contract, your offers and your money.')}
      />
      <Card className="my-contract__balance">
        <span className="my-contract__balance-label">{t('wallet.balance', 'Balance')}</span>
        <span className={`my-contract__balance-value${inDebt ? ' my-contract__balance-value--debt' : ''}`}>
          {money(contracts.balance)}
        </span>
        {inDebt && (
          <span className="my-contract__debt-note">
            {t('wallet.debtNote', "You're in debt. The shop stays locked until your balance is back above zero.")}
          </span>
        )}
      </Card>
      <Tabs
        label={t('myContract.tabsLabel', 'Contract and wallet')}
        value={tab}
        onValueChange={changeTab}
        items={[
          { value: 'contract', label: t('myContract.tabs.contract', 'Contract'), content: contractPanel },
          { value: 'wallet', label: t('myContract.tabs.wallet', 'Wallet'), content: walletPanel },
        ]}
      />
    </div>
  );
}
