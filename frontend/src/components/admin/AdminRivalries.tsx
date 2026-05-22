import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { playersApi, rivalriesApi } from '../../services/api';
import type { Player } from '../../types';
import type { Rivalry, RivalryStatus } from '../../types/rivalry';
import './AdminRivalries.css';

type FilterChip = 'all' | RivalryStatus;

interface ModalState {
  action: 'approve' | 'reject' | 'conclude' | 'delete' | 'bulk-clear';
  rivalry?: Rivalry;
  bulkCount?: number;
}

const STATUS_CHIPS: FilterChip[] = ['all', 'pending', 'active', 'completed', 'rejected', 'cancelled'];
const RESOLVED_STATUSES: RivalryStatus[] = ['completed', 'rejected', 'cancelled'];
const PAGE_SIZE = 25;

/**
 * GM-facing moderation panel for rivalries. Mirrors the layout of
 * AdminChallenges / AdminPromos: status filter chips, paginated
 * table, per-row lifecycle actions, and a bulk-clear for resolved
 * rows.
 */
export default function AdminRivalries() {
  const { t } = useTranslation();
  const [rivalries, setRivalries] = useState<Rivalry[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [filter, setFilter] = useState<FilterChip>('pending');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalNote, setModalNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const fetches: Promise<{ rivalries: Rivalry[] }>[] = [];
    if (filter === 'all') {
      fetches.push(
        ...(['pending', 'active', 'completed', 'rejected', 'cancelled'] as RivalryStatus[]).map(
          (status) => rivalriesApi.list({ status, limit: PAGE_SIZE }),
        ),
      );
    } else {
      fetches.push(rivalriesApi.list({ status: filter as RivalryStatus, limit: PAGE_SIZE }));
    }
    const results = await Promise.all(fetches);
    const merged = results.flatMap((r) => r.rivalries);
    setRivalries(merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
  };

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    let mounted = true;
    playersApi
      .getAll()
      .then((p) => mounted && setPlayers(p))
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const lookup = useMemo(() => new Map(players.map((p) => [p.playerId, p] as const)), [players]);
  const paged = rivalries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(rivalries.length / PAGE_SIZE));

  const resolvedCount = rivalries.filter((r) => RESOLVED_STATUSES.includes(r.status)).length;

  function nameOf(playerId?: string): string {
    if (!playerId) return '—';
    const p = lookup.get(playerId);
    return p?.currentWrestler ?? p?.name ?? playerId;
  }

  async function performModalAction() {
    if (!modal) return;
    setBusy(true);
    setError(null);
    try {
      if (modal.action === 'bulk-clear') {
        const targets = rivalries.filter((r) => RESOLVED_STATUSES.includes(r.status));
        for (const r of targets) {
          await rivalriesApi.delete(r.rivalryId);
        }
      } else if (modal.rivalry) {
        const r = modal.rivalry;
        if (modal.action === 'delete') {
          await rivalriesApi.delete(r.rivalryId);
        } else {
          await rivalriesApi.respond(
            r.rivalryId,
            modal.action,
            modalNote.trim() || undefined,
          );
        }
      }
      setModal(null);
      setModalNote('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-rivalries">
      <header className="admin-rivalries__header">
        <h2>{t('rivalries.admin.heading')}</h2>
        <button
          type="button"
          className="admin-rivalries__bulk"
          disabled={resolvedCount === 0}
          onClick={() => setModal({ action: 'bulk-clear', bulkCount: resolvedCount })}
        >
          {t('rivalries.admin.bulkClear')} ({resolvedCount})
        </button>
      </header>

      <div className="admin-rivalries__chips" role="toolbar">
        {STATUS_CHIPS.map((id) => (
          <button
            key={id}
            type="button"
            className={`admin-rivalries__chip ${filter === id ? 'is-active' : ''}`}
            onClick={() => {
              setFilter(id);
              setPage(1);
            }}
          >
            {id === 'all'
              ? t('rivalries.admin.filterAll')
              : t(`rivalries.status.${id as RivalryStatus}`)}
          </button>
        ))}
      </div>

      {error && <div className="admin-rivalries__error">{error}</div>}

      <table className="admin-rivalries__table">
        <thead>
          <tr>
            <th>{t('rivalries.admin.columnCreated')}</th>
            <th>{t('rivalries.admin.columnRequester')}</th>
            <th>{t('rivalries.admin.columnOpponent')}</th>
            <th>{t('rivalries.admin.columnTitle')}</th>
            <th>{t('rivalries.admin.columnHeat')}</th>
            <th>{t('rivalries.admin.columnStatus')}</th>
            <th>{t('rivalries.admin.columnActions')}</th>
          </tr>
        </thead>
        <tbody>
          {paged.length === 0 ? (
            <tr>
              <td colSpan={7} className="admin-rivalries__empty">
                {t('rivalries.admin.emptyState')}
              </td>
            </tr>
          ) : (
            paged.map((r) => {
              const opponent = r.participants.find((p) => p.playerId !== r.requestedBy);
              return (
                <tr key={r.rivalryId}>
                  <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td>{nameOf(r.requestedBy)}</td>
                  <td>{nameOf(opponent?.playerId)}</td>
                  <td>{r.title}</td>
                  <td>{r.heat}</td>
                  <td>{t(`rivalries.status.${r.status}`)}</td>
                  <td className="admin-rivalries__actions">
                    {r.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setModal({ action: 'approve', rivalry: r });
                            setModalNote('');
                          }}
                        >
                          {t('rivalries.admin.approve')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setModal({ action: 'reject', rivalry: r });
                            setModalNote('');
                          }}
                        >
                          {t('rivalries.admin.reject')}
                        </button>
                      </>
                    )}
                    {r.status === 'active' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setModal({ action: 'conclude', rivalry: r });
                            setModalNote('');
                          }}
                        >
                          {t('rivalries.admin.conclude')}
                        </button>
                        <Link to={`/rivalries/${r.rivalryId}`} className="admin-rivalries__link">
                          {t('rivalries.admin.open')}
                        </Link>
                      </>
                    )}
                    <button
                      type="button"
                      className="admin-rivalries__danger"
                      onClick={() => {
                        setModal({ action: 'delete', rivalry: r });
                        setModalNote('');
                      }}
                    >
                      {t('rivalries.admin.delete')}
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <footer className="admin-rivalries__pager">
        <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          {t('rivalries.admin.pagePrev')}
        </button>
        <span>
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          {t('rivalries.admin.pageNext')}
        </button>
      </footer>

      {modal && (
        <div className="admin-rivalries__modal" role="dialog" aria-modal="true">
          <div className="admin-rivalries__modal-card">
            <h3>
              {modal.action === 'bulk-clear'
                ? t('rivalries.admin.bulkClearPrompt', { count: modal.bulkCount ?? 0 })
                : modal.action === 'delete'
                ? t('rivalries.admin.deletePrompt', { title: modal.rivalry?.title ?? '' })
                : modal.action === 'approve'
                ? t('rivalries.admin.approvePrompt', { title: modal.rivalry?.title ?? '' })
                : modal.action === 'reject'
                ? t('rivalries.admin.rejectPrompt', { title: modal.rivalry?.title ?? '' })
                : t('rivalries.admin.concludePrompt', { title: modal.rivalry?.title ?? '' })}
            </h3>
            {(modal.action === 'reject' || modal.action === 'conclude' || modal.action === 'approve') && (
              <textarea
                rows={3}
                value={modalNote}
                placeholder={
                  modal.action === 'reject'
                    ? t('rivalries.admin.rejectReason')
                    : t('rivalries.admin.concludeNote')
                }
                onChange={(e) => setModalNote(e.target.value)}
              />
            )}
            {modal.action === 'bulk-clear' && (
              <p>{t('rivalries.admin.bulkClearWarning')}</p>
            )}
            <footer>
              <button type="button" onClick={() => setModal(null)} disabled={busy}>
                {t('rivalries.request.cancel')}
              </button>
              <button
                type="button"
                className="admin-rivalries__danger"
                onClick={performModalAction}
                disabled={busy || (modal.action === 'reject' && !modalNote.trim())}
              >
                {t('rivalries.admin.confirm')}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
