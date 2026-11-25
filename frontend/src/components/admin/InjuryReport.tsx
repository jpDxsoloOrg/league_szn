import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { injuriesApi } from '../../services/api/injuries.api';
import { playersApi } from '../../services/api';
import type { InjuryBoardEntry, PlayerWithCondition } from '../../types/injuryReport';
import {
  formatReturnDate,
  injuredUntil,
  isLowStamina,
  LOW_STAMINA_THRESHOLD,
  staminaOf,
} from '../../utils/injuryBooking';
import { isNeedsWrestler } from '../../utils/needsWrestler';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import DataTable, { type DataTableColumn } from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import Modal from '../ui/Modal';
import PageHeader from '../ui/PageHeader';
import AdminNotice from './AdminNotice';
import ConfirmModal from './ConfirmModal';
import './adminRoster.css';
import './InjuryReport.css';

/** The API's stamina cap when the tunables can't be read. */
const DEFAULT_MAX_STAMINA = 100;
const MAX_INJURY_WEEKS = 52;

interface RosterRow {
  playerId: string;
  name: string;
  wrestler: string;
  /** Stored stamina; null means full. */
  stamina: number | null;
  injuredUntil: string | null;
}

type PendingAction =
  | { kind: 'heal'; entry: InjuryBoardEntry }
  | { kind: 'extend'; entry: InjuryBoardEntry }
  | { kind: 'stamina'; row: RosterRow };

const boardName = (entry: InjuryBoardEntry, unknownLabel: string): string => {
  const player = entry.player;
  if (!player) return unknownLabel;
  return isNeedsWrestler(player.currentWrestler) ? player.name : `${player.currentWrestler} (${player.name})`;
};

/**
 * Admin Injury Report (INJ-11): every open injury with what it affects, heal
 * and extend actions, and the roster's stamina with a manual adjust.
 * Moderators and Admins; the page is offered only while injuries are on.
 */
export default function InjuryReport() {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<InjuryBoardEntry[]>([]);
  const [players, setPlayers] = useState<PlayerWithCondition[]>([]);
  const [maxStamina, setMaxStamina] = useState(DEFAULT_MAX_STAMINA);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [weeksDraft, setWeeksDraft] = useState('');
  const [staminaDraft, setStaminaDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [rosterPage, setRosterPage] = useState(0);

  const unknownLabel = t('common.unknown', 'Unknown');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [board, roster] = await Promise.all([
        injuriesApi.listActive(signal),
        playersApi.getAll(signal),
      ]);
      setEntries(board);
      setPlayers(roster);
    } catch (err) {
      if (signal?.aborted) return;
      setLoadError(err instanceof Error ? err.message : t('injuryReport.loadError'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
    // The cap only bounds the adjust input; the API checks it again.
    try {
      const config = await injuriesApi.getConfig(signal);
      if (!signal?.aborted) setMaxStamina(config.settings.maxStamina);
    } catch {
      // Keep the default.
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const rosterRows = useMemo<RosterRow[]>(() => players.map((player) => ({
    playerId: player.playerId,
    name: player.name,
    wrestler: isNeedsWrestler(player.currentWrestler) ? '' : player.currentWrestler,
    stamina: staminaOf(player),
    injuredUntil: injuredUntil(player),
  })), [players]);

  const openAction = (action: PendingAction) => {
    setActionError(null);
    setResult(null);
    setNoteDraft('');
    if (action.kind === 'extend') setWeeksDraft(String(action.entry.injury.weeks + 1));
    if (action.kind === 'stamina') setStaminaDraft(String(action.row.stamina ?? maxStamina));
    setPending(action);
  };

  const closeAction = () => {
    if (!busy) setPending(null);
  };

  const runAction = async (work: () => Promise<string>) => {
    setBusy(true);
    setActionError(null);
    try {
      const message = await work();
      setPending(null);
      setResult(message);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('injuryReport.actionError'));
    } finally {
      setBusy(false);
    }
  };

  const note = noteDraft.trim() || undefined;
  const weeks = Number(weeksDraft);
  const weeksValid = Number.isInteger(weeks) && weeks >= 1 && weeks <= MAX_INJURY_WEEKS;
  const stamina = Number(staminaDraft);
  const staminaValid = staminaDraft.trim() !== '' && Number.isInteger(stamina) && stamina >= 0 && stamina <= maxStamina;

  const handleHeal = () => {
    if (pending?.kind !== 'heal') return;
    const { entry } = pending;
    void runAction(async () => {
      await injuriesApi.heal(entry.injury.playerId, note);
      return t('injuryReport.healed', { name: boardName(entry, unknownLabel) });
    });
  };

  const handleExtend = (event: FormEvent) => {
    event.preventDefault();
    if (pending?.kind !== 'extend' || !weeksValid) return;
    const { entry } = pending;
    void runAction(async () => {
      const updated = await injuriesApi.updateCurrent(entry.injury.playerId, { weeks, ...(note && { note }) });
      return t('injuryReport.extended', {
        name: boardName(entry, unknownLabel),
        date: formatReturnDate(updated.returnsAt, i18n.language),
      });
    });
  };

  const handleStamina = (event: FormEvent) => {
    event.preventDefault();
    if (pending?.kind !== 'stamina' || !staminaValid) return;
    const { row } = pending;
    void runAction(async () => {
      await injuriesApi.adjustStamina(row.playerId, stamina, note);
      return t('injuryReport.staminaSet', { name: row.wrestler || row.name, stamina });
    });
  };

  const injuryColumns: DataTableColumn<InjuryBoardEntry>[] = [
    {
      key: 'player',
      header: t('injuryReport.columns.player'),
      render: (entry) => <span className="ar-strong">{boardName(entry, unknownLabel)}</span>,
      sortValue: (entry) => boardName(entry, unknownLabel),
    },
    {
      key: 'severity',
      header: t('injuryReport.columns.severity'),
      render: (entry) => (
        <span className="injury-report__stack">
          <span>{t(`injuryReport.severity.${entry.injury.severity}`)}</span>
          <span className="ar-sub">{t('injuryReport.weeks', { count: entry.injury.weeks })}</span>
        </span>
      ),
    },
    {
      key: 'source',
      header: t('injuryReport.columns.source'),
      render: (entry) => (entry.injury.source === 'storyline'
        ? t('injuryReport.source.storyline')
        : t('injuryReport.source.match')),
      hideOnMobile: true,
    },
    {
      key: 'returns',
      header: t('injuryReport.columns.returns'),
      render: (entry) => (
        <span className="injury-report__stack">
          <span>{formatReturnDate(entry.injury.returnsAt, i18n.language)}</span>
          {entry.pastReturnDate && <span className="ar-sub">{t('injuryReport.pastReturn')}</span>}
        </span>
      ),
      sortValue: (entry) => Date.parse(entry.injury.returnsAt),
    },
    {
      key: 'affected',
      header: t('injuryReport.columns.affected'),
      render: (entry) => (
        <span className="injury-report__stack">
          <span>{t('injuryReport.affectedMatches', { count: entry.impact.scheduledMatchIds.length })}</span>
          {entry.impact.titles.length > 0 && (
            <span className="injury-report__titles">
              {entry.impact.titles.map((title) => <Badge key={title} tone="warning">{title}</Badge>)}
            </span>
          )}
        </span>
      ),
      sortValue: (entry) => entry.impact.scheduledMatchIds.length,
    },
    {
      key: 'actions',
      header: t('injuryReport.columns.actions'),
      render: (entry) => (
        <span className="ar-row-actions">
          <Button size="sm" variant="secondary" onClick={() => openAction({ kind: 'extend', entry })}>
            {t('injuryReport.extend')}
          </Button>
          <Button size="sm" onClick={() => openAction({ kind: 'heal', entry })}>
            {t('injuryReport.heal')}
          </Button>
        </span>
      ),
    },
  ];

  const rosterColumns: DataTableColumn<RosterRow>[] = [
    {
      key: 'player',
      header: t('injuryReport.columns.player'),
      render: (row) => (
        <span className="injury-report__stack">
          <span className="ar-strong">{row.wrestler || row.name}</span>
          {row.wrestler && <span className="ar-sub">{row.name}</span>}
        </span>
      ),
      sortValue: (row) => (row.wrestler || row.name).toLowerCase(),
    },
    {
      key: 'stamina',
      header: t('injuryReport.columns.stamina'),
      render: (row) => {
        const value = row.stamina ?? maxStamina;
        return (
          <span className={isLowStamina(row.stamina) ? 'injury-report__stamina injury-report__stamina--low' : 'injury-report__stamina'}>
            {t('injuryReport.staminaValue', { stamina: value, max: maxStamina })}
          </span>
        );
      },
      sortValue: (row) => row.stamina ?? maxStamina,
    },
    {
      key: 'status',
      header: t('injuryReport.columns.status'),
      render: (row) => (row.injuredUntil
        ? <Badge tone="loss">{t('injuryReport.booking.injuredUntil', { date: formatReturnDate(row.injuredUntil, i18n.language) })}</Badge>
        : t('injuryReport.fit')),
    },
    {
      key: 'adjust',
      header: t('injuryReport.columns.actions'),
      render: (row) => (
        <Button size="sm" variant="secondary" onClick={() => openAction({ kind: 'stamina', row })}>
          {t('injuryReport.adjust')}
        </Button>
      ),
    },
  ];

  const noteField = (
    <div className="ar-field">
      <label className="ar-field__label" htmlFor="injury-report-note">{t('injuryReport.note')}</label>
      <input
        id="injury-report-note"
        className="ar-input"
        type="text"
        maxLength={500}
        value={noteDraft}
        onChange={(event) => setNoteDraft(event.target.value)}
      />
      <p className="ar-field__hint">{t('injuryReport.noteHint')}</p>
    </div>
  );

  const pendingName = pending?.kind === 'stamina'
    ? (pending.row.wrestler || pending.row.name)
    : pending ? boardName(pending.entry, unknownLabel) : '';

  return (
    <div className="ar-page injury-report">
      <PageHeader title={t('injuryReport.title')} subtitle={t('injuryReport.subtitle')} />

      {loadError && (
        <AdminNotice
          tone="error"
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>{t('injuryReport.retry')}</Button>}
        >
          {loadError}
        </AdminNotice>
      )}
      {result && <AdminNotice tone="success" onDismiss={() => setResult(null)}>{result}</AdminNotice>}

      <section className="injury-report__section" aria-labelledby="injury-report-active">
        <h2 id="injury-report-active" className="ar-section-title">{t('injuryReport.activeTitle')}</h2>
        <DataTable
          columns={injuryColumns}
          rows={entries}
          rowKey={(entry) => entry.injury.injuryId}
          caption={t('injuryReport.activeTitle')}
          density="dense"
          loading={loading}
          empty={<EmptyState title={t('injuryReport.noInjuries')} />}
        />
      </section>

      <section className="injury-report__section" aria-labelledby="injury-report-roster">
        <h2 id="injury-report-roster" className="ar-section-title">{t('injuryReport.rosterTitle')}</h2>
        <p className="ar-hint">{t('injuryReport.rosterHint', { threshold: LOW_STAMINA_THRESHOLD })}</p>
        <DataTable
          columns={rosterColumns}
          rows={rosterRows}
          rowKey={(row) => row.playerId}
          caption={t('injuryReport.rosterTitle')}
          density="dense"
          loading={loading}
          rowClassName={(row) => (isLowStamina(row.stamina) ? 'injury-report__row--low' : undefined)}
          pagination={{ page: rosterPage, pageSize: 25, onPageChange: setRosterPage }}
        />
      </section>

      <ConfirmModal
        open={pending?.kind === 'heal'}
        title={t('injuryReport.healTitle')}
        message={t('injuryReport.healMessage', { name: pendingName })}
        confirmLabel={t('injuryReport.heal')}
        busy={busy}
        onConfirm={handleHeal}
        onCancel={closeAction}
      >
        {noteField}
        {actionError && <AdminNotice tone="error">{actionError}</AdminNotice>}
      </ConfirmModal>

      <Modal
        open={pending?.kind === 'extend'}
        onClose={closeAction}
        title={t('injuryReport.extendTitle', { name: pendingName })}
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={closeAction} disabled={busy}>{t('common.cancel', 'Cancel')}</Button>
            <Button type="submit" form="injury-report-extend" loading={busy} disabled={!weeksValid}>
              {t('injuryReport.save')}
            </Button>
          </>
        )}
      >
        <form id="injury-report-extend" className="ar-form" onSubmit={handleExtend}>
          {pending?.kind === 'extend' && (
            <p className="ar-hint">
              {t('injuryReport.extendCurrent', {
                count: pending.entry.injury.weeks,
                date: formatReturnDate(pending.entry.injury.returnsAt, i18n.language),
              })}
            </p>
          )}
          <div className="ar-field">
            <label className="ar-field__label" htmlFor="injury-report-weeks">{t('injuryReport.totalWeeks')}</label>
            <input
              id="injury-report-weeks"
              className="ar-input injury-report__number"
              type="number"
              min={1}
              max={MAX_INJURY_WEEKS}
              step={1}
              value={weeksDraft}
              onChange={(event) => setWeeksDraft(event.target.value)}
            />
            <p className="ar-field__hint">{t('injuryReport.totalWeeksHint', { max: MAX_INJURY_WEEKS })}</p>
          </div>
          {noteField}
          {actionError && <AdminNotice tone="error">{actionError}</AdminNotice>}
        </form>
      </Modal>

      <Modal
        open={pending?.kind === 'stamina'}
        onClose={closeAction}
        title={t('injuryReport.staminaTitle', { name: pendingName })}
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={closeAction} disabled={busy}>{t('common.cancel', 'Cancel')}</Button>
            <Button type="submit" form="injury-report-stamina" loading={busy} disabled={!staminaValid}>
              {t('injuryReport.save')}
            </Button>
          </>
        )}
      >
        <form id="injury-report-stamina" className="ar-form" onSubmit={handleStamina}>
          <div className="ar-field">
            <label className="ar-field__label" htmlFor="injury-report-stamina-value">
              {t('injuryReport.staminaLabel', { max: maxStamina })}
            </label>
            <input
              id="injury-report-stamina-value"
              className="ar-input injury-report__number"
              type="number"
              min={0}
              max={maxStamina}
              step={1}
              value={staminaDraft}
              onChange={(event) => setStaminaDraft(event.target.value)}
            />
          </div>
          {noteField}
          {actionError && <AdminNotice tone="error">{actionError}</AdminNotice>}
        </form>
      </Modal>
    </div>
  );
}
