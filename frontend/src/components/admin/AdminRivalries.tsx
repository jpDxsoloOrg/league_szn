import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flame } from 'lucide-react';
import { playersApi, rivalriesApi } from '../../services/api';
import type { Player } from '../../types';
import type { Rivalry, RivalryHeat, RivalryStatus } from '../../types/rivalry';
import Badge from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import Modal from '../ui/Modal';
import PageHeader from '../ui/PageHeader';
import Tabs from '../ui/Tabs';
import HeatBadge from '../rivalries/HeatBadge';
import AdminNotice from './AdminNotice';
import './adminContent.css';

const HEAT_TIERS: RivalryHeat[] = ['frozen', 'cold', 'warm', 'hot', 'scorching'];
const ALL_STATUSES: RivalryStatus[] = ['pending', 'active', 'completed', 'rejected', 'cancelled'];
const RESOLVED_STATUSES: RivalryStatus[] = ['completed', 'rejected', 'cancelled'];
const PAGE_SIZE = 25;

const STATUS_TONES: Record<RivalryStatus, BadgeTone> = {
  pending: 'warning',
  active: 'win',
  completed: 'primary',
  rejected: 'loss',
  cancelled: 'neutral',
};

type StatusFilter = 'all' | RivalryStatus;

interface ModalState {
  action: 'approve' | 'reject' | 'conclude' | 'delete' | 'bulk-clear';
  rivalry?: Rivalry;
  bulkCount?: number;
}

/** GM moderation for rivalries: status tabs, a paged table and per-row lifecycle actions. */
export default function AdminRivalries() {
  const { t } = useTranslation();
  const [rivalries, setRivalries] = useState<Rivalry[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalNote, setModalNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [heatRivalryId, setHeatRivalryId] = useState<string | null>(null);
  const [heatBusy, setHeatBusy] = useState(false);
  const [heatError, setHeatError] = useState<string | null>(null);

  const refresh = useCallback(async (status: StatusFilter, signal?: AbortSignal) => {
    const statuses = status === 'all' ? ALL_STATUSES : [status];
    const results = await Promise.all(statuses.map((item) => rivalriesApi.list({ status: item, limit: PAGE_SIZE }, signal)));
    const merged = results.flatMap((result) => result.rivalries);
    setRivalries(merged.sort((first, second) => (first.createdAt < second.createdAt ? 1 : -1)));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await refresh(filter, controller.signal);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [filter, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        setPlayers(await playersApi.getAllIncludingHidden(controller.signal));
      } catch {
        // Names fall back to the stored player ID.
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  const lookup = useMemo(() => new Map(players.map((player) => [player.playerId, player] as const)), [players]);
  const paged = rivalries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(rivalries.length / PAGE_SIZE));
  const resolvedCount = rivalries.filter((rivalry) => RESOLVED_STATUSES.includes(rivalry.status)).length;
  const heatRivalry = rivalries.find((rivalry) => rivalry.rivalryId === heatRivalryId) ?? null;

  const nameOf = (playerId?: string): string => {
    if (!playerId) return '—';
    const player = lookup.get(playerId);
    return player?.currentWrestler || player?.name || playerId;
  };

  const opponentOf = (rivalry: Rivalry) => rivalry.participants.find((participant) => participant.playerId !== rivalry.requestedBy);

  const openModal = (action: ModalState['action'], rivalry: Rivalry) => {
    setModal({ action, rivalry });
    setModalNote('');
    setModalError(null);
  };

  const closeHeat = () => {
    setHeatRivalryId(null);
    setHeatError(null);
  };

  const changeHeat = async (rivalry: Rivalry, nextHeat: RivalryHeat) => {
    if (nextHeat === rivalry.heat) return;
    setHeatBusy(true);
    setHeatError(null);
    try {
      const updated = await rivalriesApi.update(rivalry.rivalryId, { heat: nextHeat });
      setRivalries((previous) => previous.map((item) => (item.rivalryId === updated.rivalryId ? updated : item)));
    } catch (err) {
      setHeatError(err instanceof Error ? err.message : String(err));
    } finally {
      setHeatBusy(false);
    }
  };

  const recomputeHeat = async (rivalry: Rivalry) => {
    setHeatBusy(true);
    setHeatError(null);
    try {
      const result = await rivalriesApi.recomputeHeat(rivalry.rivalryId);
      setRivalries((previous) => previous.map((item) => (
        item.rivalryId === rivalry.rivalryId ? { ...item, heat: result.heat, heatScore: result.heatScore } : item
      )));
    } catch (err) {
      setHeatError(err instanceof Error
        ? err.message
        : t('rivalry.heat.recomputeError', { defaultValue: 'Could not recompute heat. Try again.' }));
    } finally {
      setHeatBusy(false);
    }
  };

  const performModalAction = async () => {
    if (!modal) return;
    setBusy(true);
    setModalError(null);
    try {
      if (modal.action === 'bulk-clear') {
        for (const rivalry of rivalries.filter((item) => RESOLVED_STATUSES.includes(item.status))) {
          await rivalriesApi.delete(rivalry.rivalryId);
        }
      } else if (modal.rivalry) {
        if (modal.action === 'delete') {
          await rivalriesApi.delete(modal.rivalry.rivalryId);
        } else {
          await rivalriesApi.respond(modal.rivalry.rivalryId, modal.action, modalNote.trim() || undefined);
        }
      }
      setModal(null);
      setModalNote('');
      await refresh(filter);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const modalTitle = (state: ModalState): string => {
    const title = state.rivalry?.title ?? '';
    if (state.action === 'bulk-clear') return t('rivalries.admin.bulkClearPrompt', { count: state.bulkCount ?? 0 });
    if (state.action === 'delete') return t('rivalries.admin.deletePrompt', { title });
    if (state.action === 'approve') return t('rivalries.admin.approvePrompt', { title });
    if (state.action === 'reject') return t('rivalries.admin.rejectPrompt', { title });
    return t('rivalries.admin.concludePrompt', { title });
  };

  const hasNote = modal?.action === 'reject' || modal?.action === 'conclude' || modal?.action === 'approve';

  return (
    <div className="ac-page">
      <PageHeader
        title={t('rivalries.admin.heading')}
        actions={(
          <>
            <Button variant="ghost" to="/admin/heat-config">{t('admin.panel.tabs.heatConfig', 'Heat Tunables')}</Button>
            <Button
              variant="secondary"
              disabled={resolvedCount === 0}
              onClick={() => {
                setModal({ action: 'bulk-clear', bulkCount: resolvedCount });
                setModalError(null);
              }}
            >
              {t('rivalries.admin.bulkClear')} ({resolvedCount})
            </Button>
          </>
        )}
      />

      <Tabs
        label={t('rivalries.admin.columnStatus')}
        value={filter}
        onValueChange={(value) => {
          setFilter(value as StatusFilter);
          setPage(1);
        }}
        items={[
          { value: 'all', label: t('rivalries.admin.filterAll') },
          ...ALL_STATUSES.map((status) => ({ value: status, label: t(`rivalries.status.${status}`) })),
        ]}
      />

      {error && <AdminNotice tone="error">{error}</AdminNotice>}

      <DataTable
        caption={t('rivalries.admin.heading')}
        density="dense"
        loading={loading}
        rows={paged}
        rowKey={(rivalry) => rivalry.rivalryId}
        empty={<EmptyState icon={<Flame aria-hidden="true" size={32} />} title={t('rivalries.admin.emptyState')} />}
        columns={[
          {
            key: 'title',
            header: t('rivalries.admin.columnTitle'),
            render: (rivalry) => (
              <span className="ac-cell__text">
                <span className="ac-cell__title">{rivalry.title}</span>
                <span className="ac-cell__sub">
                  {nameOf(rivalry.requestedBy)} {t('common.vs', 'vs')} {nameOf(opponentOf(rivalry)?.playerId)}
                </span>
              </span>
            ),
          },
          {
            key: 'created',
            header: t('rivalries.admin.columnCreated'),
            render: (rivalry) => new Date(rivalry.createdAt).toLocaleDateString(),
            sortValue: (rivalry) => rivalry.createdAt,
          },
          {
            key: 'heat',
            header: t('rivalries.admin.columnHeat'),
            render: (rivalry) => <HeatBadge heat={rivalry.heat} heatScore={rivalry.heatScore} size="sm" />,
          },
          {
            key: 'status',
            header: t('rivalries.admin.columnStatus'),
            render: (rivalry) => <Badge tone={STATUS_TONES[rivalry.status]}>{t(`rivalries.status.${rivalry.status}`)}</Badge>,
          },
          {
            key: 'actions',
            header: t('rivalries.admin.columnActions'),
            align: 'end',
            render: (rivalry) => (
              <div className="ac-actions ac-actions--end">
                {rivalry.status === 'pending' && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => openModal('approve', rivalry)}>{t('rivalries.admin.approve')}</Button>
                    <Button variant="ghost" size="sm" onClick={() => openModal('reject', rivalry)}>{t('rivalries.admin.reject')}</Button>
                  </>
                )}
                {rivalry.status === 'active' && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => openModal('conclude', rivalry)}>{t('rivalries.admin.conclude')}</Button>
                    <Button variant="ghost" size="sm" to={`/rivalries/${rivalry.rivalryId}`}>{t('rivalries.admin.open')}</Button>
                  </>
                )}
                <Button variant="ghost" size="sm" onClick={() => setHeatRivalryId(rivalry.rivalryId)}>
                  {t('rivalries.admin.columnHeat')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openModal('delete', rivalry)}>{t('rivalries.admin.delete')}</Button>
              </div>
            ),
          },
        ]}
      />

      {totalPages > 1 && (
        <div className="ac-pager">
          <Button variant="ghost" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
            {t('rivalries.admin.pagePrev')}
          </Button>
          <span>{page} / {totalPages}</span>
          <Button variant="ghost" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>
            {t('rivalries.admin.pageNext')}
          </Button>
        </div>
      )}

      <Modal
        open={modal !== null}
        onClose={() => {
          if (!busy) setModal(null);
        }}
        title={modal ? modalTitle(modal) : ''}
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setModal(null)} disabled={busy}>{t('rivalries.request.cancel')}</Button>
            <Button
              variant={modal?.action === 'approve' ? 'primary' : 'danger'}
              onClick={performModalAction}
              loading={busy}
              disabled={modal?.action === 'reject' && !modalNote.trim()}
            >
              {t('rivalries.admin.confirm')}
            </Button>
          </>
        )}
      >
        <div className="ac-form">
          {modalError && <AdminNotice tone="error">{modalError}</AdminNotice>}
          {hasNote && (
            <div className="ac-field">
              <label className="ac-field__label" htmlFor="rivalry-note">
                {modal?.action === 'reject' ? t('rivalries.admin.rejectReason') : t('rivalries.admin.concludeNote')}
              </label>
              <textarea id="rivalry-note" rows={3} value={modalNote} onChange={(event) => setModalNote(event.target.value)} />
            </div>
          )}
          {modal?.action === 'bulk-clear' && <p className="ac-section__text">{t('rivalries.admin.bulkClearWarning')}</p>}
        </div>
      </Modal>

      <Modal
        open={heatRivalry !== null}
        onClose={closeHeat}
        title={heatRivalry?.title ?? ''}
        size="sm"
        footer={(
          <Button variant="ghost" onClick={closeHeat}>{t('common.close', 'Close')}</Button>
        )}
      >
        {heatRivalry && (
          <div className="ac-form">
            {heatError && <AdminNotice tone="error">{heatError}</AdminNotice>}
            <div className="ac-badges">
              <HeatBadge heat={heatRivalry.heat} heatScore={heatRivalry.heatScore} size="sm" />
            </div>
            <div className="ac-field">
              <label className="ac-field__label" htmlFor="rivalry-heat">{t('rivalries.admin.columnHeat')}</label>
              <select
                id="rivalry-heat"
                value={heatRivalry.heat}
                disabled={heatBusy}
                onChange={(event) => changeHeat(heatRivalry, event.target.value as RivalryHeat)}
              >
                {HEAT_TIERS.map((tier) => (
                  <option key={tier} value={tier}>
                    {t(`rivalry.heat.${tier}`, { defaultValue: tier.charAt(0).toUpperCase() + tier.slice(1) })}
                  </option>
                ))}
              </select>
              <p className="ac-field__hint">
                {t('rivalry.heat.recomputeHint', { defaultValue: 'Will be recomputed when matches are rated' })}
              </p>
            </div>
            <div className="ac-actions">
              <Button variant="secondary" loading={heatBusy} onClick={() => recomputeHeat(heatRivalry)}>
                {t('rivalry.heat.recomputeButton', { defaultValue: 'Recompute from ratings' })}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
