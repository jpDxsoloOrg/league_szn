import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import { contractsApi } from '../../services/api/contracts.api';
import HomeSection from '../home/HomeSection';
import Card from '../ui/Card';
import { useCurrencySymbol } from './useCurrencySymbol';
import { formatMoney, MY_WALLET_PATH, nextPayday, weekEarnings } from './wallet';
import './DashboardWallet.css';

/** Enough entries to cover a busy week; earnings older than this page are left out. */
export const WALLET_CARD_LEDGER_LIMIT = 100;

interface WalletSummary {
  balance: number;
  weekEarnings: number;
}

/**
 * Dashboard wallet card (ECO-13): balance (red in debt), this week's
 * earnings and the next payday. Self-gates: renders nothing unless the
 * economy is on and the viewer is a wrestler with a player.
 */
export default function DashboardWallet() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, isWrestler, playerId } = useAuth();
  const { features } = useSiteConfig();
  const eligible = Boolean(features.economy) && isAuthenticated && isWrestler && Boolean(playerId);
  const currencySymbol = useCurrencySymbol(eligible);
  const [summary, setSummary] = useState<WalletSummary | null>(null);

  useEffect(() => {
    setSummary(null);
    if (!eligible) return undefined;
    const controller = new AbortController();
    const load = async () => {
      try {
        const page = await contractsApi.getMyLedger({ limit: WALLET_CARD_LEDGER_LIMIT }, controller.signal);
        if (controller.signal.aborted) return;
        setSummary({ balance: page.balance, weekEarnings: weekEarnings(page.items, new Date()) });
      } catch {
        // The card stays hidden; the wallet page shows the error.
      }
    };
    void load();
    return () => controller.abort();
  }, [eligible]);

  if (!eligible || !summary) return null;

  const money = (amount: number) => formatMoney(amount, currencySymbol, i18n.language);
  const payday = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'short' })
    .format(nextPayday(new Date()));
  const inDebt = summary.balance < 0;

  return (
    <HomeSection
      title={t('wallet.card.title', 'Your wallet')}
      accent="cyan"
      linkTo={MY_WALLET_PATH}
      linkLabel={t('wallet.card.link', 'Wallet history')}
    >
      <Card className="dashboard-wallet">
        <div className="dashboard-wallet__stat">
          <span className="dashboard-wallet__label">{t('wallet.balance', 'Balance')}</span>
          <span className={`dashboard-wallet__value${inDebt ? ' dashboard-wallet__value--debt' : ''}`}>
            {money(summary.balance)}
          </span>
        </div>
        <div className="dashboard-wallet__stat">
          <span className="dashboard-wallet__label">{t('wallet.card.thisWeek', 'Earned this week')}</span>
          <span className="dashboard-wallet__value">{money(summary.weekEarnings)}</span>
        </div>
        <div className="dashboard-wallet__stat">
          <span className="dashboard-wallet__label">{t('wallet.card.nextPayday', 'Next payday')}</span>
          <span className="dashboard-wallet__value dashboard-wallet__value--date">{payday}</span>
        </div>
        {inDebt && (
          <p className="dashboard-wallet__debt" role="status">
            {t('wallet.debtNote', "You're in debt. The shop stays locked until your balance is back above zero.")}
          </p>
        )}
      </Card>
    </HomeSection>
  );
}
