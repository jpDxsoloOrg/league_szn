import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FilePlus2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { contractsApi, type Contract, type ContractStatus, type RosterPlayer } from '../../services/api/contracts.api';
import { economyApi } from '../../services/api/economy.api';
import { playersApi } from '../../services/api/players.api';
import { seasonsApi } from '../../services/api/seasons.api';
import { formatInstant } from '../../utils/dateUtils';
import Badge from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import type { DataTableColumn } from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import Tabs from '../ui/Tabs';
import { useToast } from '../ui/toastContext';
import { contractLengthLabel } from '../economy/contractDisplay';
import OfferContractModal, { type OfferCandidate } from '../economy/OfferContractModal';
import { OFFER_NOTE_MAX_LENGTH } from '../economy/offerForm';
import AdminFormModal from './AdminFormModal';
import AdminNotice from './AdminNotice';
import useAdminConfirm from './useAdminConfirm';
import './adminContent.css';
import './adminRoster.css';
import './ManageContracts.css';

type ContractsTab = 'active' | 'offered' | 'freeAgents' | 'history';

const STATUS_TONES: Record<ContractStatus, BadgeTone> = {
  offered: 'warning',
  active: 'win',
  declined: 'loss',
  withdrawn: 'neutral',
  expired: 'neutral',
  completed: 'primary',
  released: 'loss',
};

interface PlayerLabel {
  title: string;
  sub?: string;
}

function playerLabel(player: RosterPlayer | undefined, fallback: string): PlayerLabel {
  if (!player) return { title: fallback };
  const wrestler = player.currentWrestler?.trim();
  return wrestler ? { title: wrestler, sub: player.name } : { title: player.name };
}

function newRequestId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface BalanceTarget {
  player: RosterPlayer;
  requestId: string;
}

/**
 * Staff contracts desk (ECO-12): who is signed, open offers, free agents and
 * past contracts. GMs offer, withdraw and release; Admins also adjust balances.
 */
export default function ManageContracts() {
  const { t, i18n } = useTranslation();
  const { isSuperAdmin } = useAuth();
  const { showToast } = useToast();
  const { confirm, confirmDialog } = useAdminConfirm();

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [freeAgents, setFreeAgents] = useState<RosterPlayer[]>([]);
  const [seasonNames, setSeasonNames] = useState<Map<string, string>>(new Map());
  const [currencySymbol, setCurrencySymbol] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ContractsTab>('active');

  const [offerOpen, setOfferOpen] = useState(false);
  const [offerPlayer, setOfferPlayer] = useState<OfferCandidate | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [releaseTarget, setReleaseTarget] = useState<Contract | null>(null);
  const [releaseNote, setReleaseNote] = useState('');
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);

  const [balanceTarget, setBalanceTarget] = useState<BalanceTarget | null>(null);
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceNote, setBalanceNote] = useState('');
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setError(null);
      const [contractList, playerList, freeAgentList, seasons, economy] = await Promise.all([
        contractsApi.list({}, signal),
        playersApi.getAllIncludingHidden(signal) as Promise<RosterPlayer[]>,
        contractsApi.getFreeAgents(signal),
        seasonsApi.getAll(signal),
        economyApi.getConfig(signal),
      ]);
      if (signal?.aborted) return;
      setContracts(contractList);
      setPlayers(playerList);
      setFreeAgents(freeAgentList);
      setSeasonNames(new Map(seasons.map((season) => [season.seasonId, season.name])));
      setCurrencySymbol(economy.settings.currencySymbol);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : t('contracts.desk.loadFailed', 'Could not load contracts.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const playersById = useMemo(() => new Map(players.map((player) => [player.playerId, player])), [players]);
  const byStatus = useMemo(() => ({
    active: contracts.filter((contract) => contract.status === 'active'),
    offered: contracts.filter((contract) => contract.status === 'offered'),
    history: contracts.filter((contract) => contract.status !== 'active' && contract.status !== 'offered'),
  }), [contracts]);

  const candidates = useMemo<OfferCandidate[]>(() => players
    .map((player) => ({
      playerId: player.playerId,
      label: playerLabel(player, player.playerId).title,
      hasLinkedAccount: player.hasLinkedAccount,
      hint: player.activeContractId ? t('contracts.desk.underContract', 'Under contract') : undefined,
    }))
    .sort((first, second) => first.label.localeCompare(second.label)), [players, t]);

  const money = (amount: number) => `${currencySymbol}${amount.toLocaleString(i18n.language)}`;
  const date = (iso: string | undefined) => (iso ? formatInstant(iso, i18n.language) : '—');

  const renderPlayer = (playerId: string) => {
    const label = playerLabel(playersById.get(playerId), t('contracts.desk.unknownPlayer', 'Unknown player'));
    return (
      <span className="ac-cell__text">
        <span className="ar-strong">{label.title}</span>
        {label.sub && <span className="ar-sub">{label.sub}</span>}
      </span>
    );
  };

  const playerSort = (playerId: string) => playerLabel(playersById.get(playerId), playerId).title;

  const openOffer = (player?: RosterPlayer) => {
    setOfferPlayer(player ? {
      playerId: player.playerId,
      label: playerLabel(player, player.playerId).title,
      hasLinkedAccount: player.hasLinkedAccount,
    } : undefined);
    setOfferOpen(true);
  };

  const handleOffered = (_contract: Contract, player: OfferCandidate) => {
    setOfferOpen(false);
    showToast(t('contracts.offer.sent', { defaultValue: 'Offer sent to {{name}}.', name: player.label }), 'success');
    setActiveTab('offered');
    void load();
  };

  const handleWithdraw = async (contract: Contract) => {
    const name = playerSort(contract.playerId);
    const confirmed = await confirm({
      title: t('contracts.desk.withdrawTitle', 'Withdraw this offer?'),
      description: t('contracts.desk.withdrawText', { defaultValue: '{{name}} will no longer be able to accept it.', name }),
      confirmLabel: t('contracts.desk.withdraw', 'Withdraw'),
    });
    if (!confirmed) return;
    setBusyId(contract.contractId);
    try {
      await contractsApi.withdraw(contract.contractId);
      showToast(t('contracts.desk.withdrawn', 'Offer withdrawn.'), 'success');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('contracts.desk.withdrawFailed', 'Failed to withdraw the offer'));
    } finally {
      setBusyId(null);
    }
  };

  const openRelease = (contract: Contract) => {
    setReleaseTarget(contract);
    setReleaseNote('');
    setReleaseError(null);
  };

  const handleRelease = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!releaseTarget || releaseNote.trim() === '') return;
    setReleasing(true);
    setReleaseError(null);
    try {
      await contractsApi.release(releaseTarget.contractId, releaseNote.trim());
      setReleaseTarget(null);
      showToast(t('contracts.desk.released', 'Contract released. The player is a free agent again.'), 'success');
      await load();
    } catch (err) {
      setReleaseError(err instanceof Error ? err.message : t('contracts.desk.releaseFailed', 'Failed to release the contract'));
    } finally {
      setReleasing(false);
    }
  };

  const openBalance = (player: RosterPlayer) => {
    setBalanceTarget({ player, requestId: newRequestId() });
    setBalanceAmount('');
    setBalanceNote('');
    setBalanceError(null);
  };

  const parsedAmount = balanceAmount.trim() === '' ? Number.NaN : Number(balanceAmount);
  const amountValid = Number.isSafeInteger(parsedAmount) && parsedAmount !== 0;

  const handleAdjust = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!balanceTarget || !amountValid || balanceNote.trim() === '') return;
    setAdjusting(true);
    setBalanceError(null);
    try {
      const result = await contractsApi.adjustBalance(balanceTarget.player.playerId, {
        amount: parsedAmount,
        note: balanceNote.trim(),
        requestId: balanceTarget.requestId,
      });
      setBalanceTarget(null);
      showToast(t('contracts.balance.saved', { defaultValue: 'Balance is now {{balance}}.', balance: money(result.balance) }), 'success');
      await load();
    } catch (err) {
      setBalanceError(err instanceof Error ? err.message : t('contracts.balance.failed', 'Failed to adjust the balance'));
    } finally {
      setAdjusting(false);
    }
  };

  const typeColumn: DataTableColumn<Contract> = {
    key: 'type',
    header: t('contracts.desk.columns.type', 'Contract'),
    render: (contract) => t(`contracts.types.${contract.type}`, contract.type),
    sortValue: (contract) => contract.type,
  };
  const playerColumn: DataTableColumn<Contract> = {
    key: 'player',
    header: t('contracts.desk.columns.player', 'Player'),
    render: (contract) => renderPlayer(contract.playerId),
    sortValue: (contract) => playerSort(contract.playerId),
  };
  const lengthColumn: DataTableColumn<Contract> = {
    key: 'length',
    header: t('contracts.desk.columns.length', 'Matches left / season'),
    render: (contract) => contractLengthLabel(contract, seasonNames, t),
  };
  const payColumns: DataTableColumn<Contract>[] = [
    {
      key: 'pay',
      header: t('contracts.desk.columns.pay', 'Pay per match'),
      align: 'end',
      render: (contract) => money(contract.perMatchPay),
      sortValue: (contract) => contract.perMatchPay,
    },
    {
      key: 'salary',
      header: t('contracts.desk.columns.salary', 'Weekly salary'),
      align: 'end',
      render: (contract) => money(contract.weeklySalary),
      sortValue: (contract) => contract.weeklySalary,
    },
    {
      key: 'bonus',
      header: t('contracts.desk.columns.bonus', 'Win bonus'),
      align: 'end',
      render: (contract) => money(contract.winBonus),
      sortValue: (contract) => contract.winBonus,
      hideOnMobile: true,
    },
  ];

  const balanceButton = (playerId: string) => {
    const player = playersById.get(playerId);
    if (!isSuperAdmin || !player) return null;
    return (
      <Button size="sm" variant="ghost" onClick={() => openBalance(player)}>
        {t('contracts.desk.adjustBalance', 'Adjust balance')}
      </Button>
    );
  };

  const activeColumns: DataTableColumn<Contract>[] = [
    playerColumn,
    typeColumn,
    lengthColumn,
    ...payColumns,
    {
      key: 'started',
      header: t('contracts.desk.columns.started', 'Started'),
      render: (contract) => <span className="ar-nowrap">{date(contract.startedAt)}</span>,
      sortValue: (contract) => contract.startedAt ?? '',
      hideOnMobile: true,
    },
    {
      key: 'actions',
      header: t('contracts.desk.columns.actions', 'Actions'),
      render: (contract) => (
        <span className="ac-actions">
          <Button size="sm" variant="secondary" onClick={() => openRelease(contract)}>
            {t('contracts.desk.release', 'Release')}
          </Button>
          {balanceButton(contract.playerId)}
        </span>
      ),
    },
  ];

  const offeredColumns: DataTableColumn<Contract>[] = [
    playerColumn,
    typeColumn,
    lengthColumn,
    ...payColumns,
    {
      key: 'expires',
      header: t('contracts.desk.columns.expires', 'Offer expires'),
      render: (contract) => <span className="ar-nowrap">{date(contract.offerExpiresAt)}</span>,
      sortValue: (contract) => contract.offerExpiresAt,
    },
    {
      key: 'actions',
      header: t('contracts.desk.columns.actions', 'Actions'),
      render: (contract) => (
        <Button
          size="sm"
          variant="secondary"
          loading={busyId === contract.contractId}
          onClick={() => void handleWithdraw(contract)}
        >
          {t('contracts.desk.withdraw', 'Withdraw')}
        </Button>
      ),
    },
  ];

  const historyColumns: DataTableColumn<Contract>[] = [
    playerColumn,
    typeColumn,
    {
      key: 'status',
      header: t('contracts.desk.columns.status', 'Status'),
      render: (contract) => (
        <Badge tone={STATUS_TONES[contract.status]}>{t(`contracts.statuses.${contract.status}`, contract.status)}</Badge>
      ),
      sortValue: (contract) => contract.status,
    },
    {
      key: 'ended',
      header: t('contracts.desk.columns.ended', 'Ended'),
      render: (contract) => <span className="ar-nowrap">{date(contract.endedAt)}</span>,
      sortValue: (contract) => contract.endedAt ?? '',
    },
    {
      key: 'note',
      header: t('contracts.desk.columns.note', 'Note'),
      render: (contract) => contract.note ?? '—',
      hideOnMobile: true,
    },
  ];

  const freeAgentColumns: DataTableColumn<RosterPlayer>[] = [
    {
      key: 'player',
      header: t('contracts.desk.columns.player', 'Player'),
      render: (player) => renderPlayer(player.playerId),
      sortValue: (player) => playerLabel(player, player.playerId).title,
    },
    {
      key: 'record',
      header: t('contracts.desk.columns.record', 'Record'),
      render: (player) => `${player.wins}-${player.losses}-${player.draws}`,
      sortValue: (player) => player.wins,
    },
    {
      key: 'balance',
      header: t('contracts.desk.columns.balance', 'Balance'),
      align: 'end',
      render: (player) => money(playersById.get(player.playerId)?.balance ?? player.balance ?? 0),
      sortValue: (player) => playersById.get(player.playerId)?.balance ?? player.balance ?? 0,
    },
    {
      key: 'actions',
      header: t('contracts.desk.columns.actions', 'Actions'),
      render: (player) => (
        <span className="ac-actions">
          <Button size="sm" variant="secondary" onClick={() => openOffer(player)} disabled={player.hasLinkedAccount === false}>
            {t('contracts.desk.offer', 'Offer')}
          </Button>
          {balanceButton(player.playerId)}
        </span>
      ),
    },
  ];

  const contractTable = (rows: Contract[], columns: DataTableColumn<Contract>[], caption: string, empty: string) => (
    <DataTable
      caption={caption}
      density="dense"
      columns={columns}
      rows={rows}
      rowKey={(contract) => contract.contractId}
      empty={<EmptyState title={empty} />}
    />
  );

  const releasePlayer = releaseTarget ? playerSort(releaseTarget.playerId) : '';
  const balancePlayer = balanceTarget ? playerLabel(balanceTarget.player, balanceTarget.player.playerId).title : '';
  const currentBalance = balanceTarget ? balanceTarget.player.balance ?? 0 : 0;

  return (
    <div className="ar-page manage-contracts">
      <PageHeader
        title={t('contracts.desk.title', 'Contracts')}
        subtitle={t('contracts.desk.subtitle', 'Offer contracts, follow open offers and release players. Players answer offers from their own account.')}
        actions={(
          <Button icon={<FilePlus2 size={16} aria-hidden="true" />} onClick={() => openOffer()} disabled={loading}>
            {t('contracts.desk.offerContract', 'Offer contract')}
          </Button>
        )}
      />

      {error && <AdminNotice tone="error">{error}</AdminNotice>}

      {loading ? <Skeleton variant="table" /> : (
        <Tabs
          label={t('contracts.desk.title', 'Contracts')}
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ContractsTab)}
          items={[
            {
              value: 'active',
              label: `${t('contracts.desk.tabs.active', 'Active')} (${byStatus.active.length})`,
              content: contractTable(byStatus.active, activeColumns, t('contracts.desk.tabs.active', 'Active'),
                t('contracts.desk.empty.active', 'No one is under contract yet.')),
            },
            {
              value: 'offered',
              label: `${t('contracts.desk.tabs.offered', 'Offered')} (${byStatus.offered.length})`,
              content: contractTable(byStatus.offered, offeredColumns, t('contracts.desk.tabs.offered', 'Offered'),
                t('contracts.desk.empty.offered', 'No open offers.')),
            },
            {
              value: 'freeAgents',
              label: `${t('contracts.desk.tabs.freeAgents', 'Free agents')} (${freeAgents.length})`,
              content: (
                <DataTable
                  caption={t('contracts.desk.tabs.freeAgents', 'Free agents')}
                  density="dense"
                  columns={freeAgentColumns}
                  rows={freeAgents}
                  rowKey={(player) => player.playerId}
                  empty={<EmptyState title={t('contracts.desk.empty.freeAgents', 'Every player is under contract.')} />}
                />
              ),
            },
            {
              value: 'history',
              label: `${t('contracts.desk.tabs.history', 'History')} (${byStatus.history.length})`,
              content: contractTable(byStatus.history, historyColumns, t('contracts.desk.tabs.history', 'History'),
                t('contracts.desk.empty.history', 'No past contracts or offers.')),
            },
          ]}
        />
      )}

      <OfferContractModal
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        candidates={candidates}
        player={offerPlayer}
        onOffered={handleOffered}
      />

      <AdminFormModal
        open={releaseTarget !== null}
        onClose={() => setReleaseTarget(null)}
        title={t('contracts.desk.releaseTitle', { defaultValue: 'Release {{name}}', name: releasePlayer })}
        description={t('contracts.desk.releaseText', 'The contract ends now and the player becomes a free agent. They will see your note.')}
        submitLabel={t('contracts.desk.release', 'Release')}
        onSubmit={handleRelease}
        busy={releasing}
        submitDisabled={releaseNote.trim() === ''}
        error={releaseError}
      >
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="release-note">{t('contracts.desk.releaseNote', 'Reason')}</label>
          <textarea
            id="release-note"
            rows={3}
            maxLength={OFFER_NOTE_MAX_LENGTH}
            required
            value={releaseNote}
            onChange={(event) => setReleaseNote(event.target.value)}
          />
        </div>
      </AdminFormModal>

      <AdminFormModal
        open={balanceTarget !== null}
        onClose={() => setBalanceTarget(null)}
        title={t('contracts.balance.title', { defaultValue: 'Adjust {{name}}\'s balance', name: balancePlayer })}
        description={t('contracts.balance.current', { defaultValue: 'Current balance: {{balance}}', balance: money(currentBalance) })}
        submitLabel={t('contracts.balance.submit', 'Adjust balance')}
        onSubmit={handleAdjust}
        busy={adjusting}
        submitDisabled={!amountValid || balanceNote.trim() === ''}
        error={balanceError}
      >
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="balance-amount">
            {t('contracts.balance.amount', 'Amount')}{currencySymbol ? ` (${currencySymbol})` : ''}
          </label>
          <input
            id="balance-amount"
            type="number"
            inputMode="numeric"
            step={1}
            value={balanceAmount}
            onChange={(event) => setBalanceAmount(event.target.value)}
          />
          <p className="ac-field__hint">{t('contracts.balance.amountHint', 'Use a minus sign to take money away. The balance can go below zero.')}</p>
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="balance-note">{t('contracts.balance.note', 'Reason')}</label>
          <textarea
            id="balance-note"
            rows={2}
            maxLength={OFFER_NOTE_MAX_LENGTH}
            required
            value={balanceNote}
            onChange={(event) => setBalanceNote(event.target.value)}
          />
        </div>
      </AdminFormModal>

      {confirmDialog}
    </div>
  );
}
