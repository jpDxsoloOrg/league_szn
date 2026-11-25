import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { economyApi } from '../../services/api/economy.api';
import { matchesApi, playersApi } from '../../services/api';
import {
  GM_INTERFERENCE_NOTE_MAX_LENGTH,
  GM_INTERFERENCE_OUTCOMES,
  gmInterferenceApi,
  type GmInterferenceOutcome,
  type GmInterferenceStatus,
  type StaffGmInterferenceRequest,
} from '../../services/api/shop.api';
import type { Match } from '../../types';
import { formatCalendarDate, formatInstant } from '../../utils/dateUtils';
import { economyErrorMessage } from '../economy/economyErrors';
import { GM_STATUS_TONES } from '../economy/economyDisplay';
import { formatMoney } from '../economy/shopItems';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import Modal from '../ui/Modal';
import PageHeader from '../ui/PageHeader';
import Select from '../ui/Select';
import Skeleton from '../ui/Skeleton';
import { useToast } from '../ui/toastContext';
import AdminNotice from './AdminNotice';
import './adminRoster.css';
import './ManageGmInterference.css';

type StatusFilter = GmInterferenceStatus | '';
const FILTERS: StatusFilter[] = ['pending', '', 'delivered', 'partial', 'taken', 'refunded'];

interface ResolveFormProps {
  request: StaffGmInterferenceRequest;
  formatAmount: (amount: number) => string;
  onResolved: () => void;
  onCancel: () => void;
}

function ResolveForm({ request, formatAmount, onResolved, onCancel }: ResolveFormProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const fieldId = useId();
  const [outcome, setOutcome] = useState<GmInterferenceOutcome | ''>('');
  const [publicNote, setPublicNote] = useState('');
  const [privateNote, setPrivateNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!outcome) return;
    setBusy(true);
    setError(null);
    try {
      await gmInterferenceApi.resolve(request.requestId, {
        outcome,
        ...(publicNote.trim() && { publicNote: publicNote.trim() }),
        ...(privateNote.trim() && { privateNote: privateNote.trim() }),
      });
      showToast(t('admin.gmInterference.resolved'), 'success');
      onResolved();
    } catch (err) {
      setError(economyErrorMessage(err, t, t('admin.gmInterference.resolveFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="gm-queue__form" onSubmit={submit}>
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      <blockquote className="gm-queue__quote">{request.request}</blockquote>
      <fieldset className="gm-queue__outcomes" disabled={busy}>
        <legend className="ar-field__label">{t('admin.gmInterference.outcome')}</legend>
        {GM_INTERFERENCE_OUTCOMES.map((option) => (
          <div key={option} className="gm-queue__outcome">
            <input
              id={`${fieldId}-${option}`}
              type="radio"
              name={`${fieldId}-outcome`}
              value={option}
              checked={outcome === option}
              aria-describedby={`${fieldId}-${option}-hint`}
              onChange={() => setOutcome(option)}
            />
            <span className="ar-stack">
              <label className="ar-strong" htmlFor={`${fieldId}-${option}`}>
                {t(`admin.gmInterference.outcomes.${option}.label`)}
              </label>
              <span id={`${fieldId}-${option}-hint`} className="ar-sub">
                {t(`admin.gmInterference.outcomes.${option}.hint`, { price: formatAmount(request.price) })}
              </span>
            </span>
          </div>
        ))}
      </fieldset>
      <div className="ar-field">
        <label className="ar-field__label" htmlFor={`${fieldId}-public`}>{t('admin.gmInterference.publicNote')}</label>
        <textarea
          id={`${fieldId}-public`}
          className="ar-input"
          rows={3}
          maxLength={GM_INTERFERENCE_NOTE_MAX_LENGTH}
          value={publicNote}
          disabled={busy}
          onChange={(event) => setPublicNote(event.target.value)}
        />
        <p className="ar-hint">{t('admin.gmInterference.publicNoteHint')}</p>
      </div>
      <div className="ar-field">
        <label className="ar-field__label" htmlFor={`${fieldId}-private`}>{t('admin.gmInterference.privateNote')}</label>
        <textarea
          id={`${fieldId}-private`}
          className="ar-input"
          rows={3}
          maxLength={GM_INTERFERENCE_NOTE_MAX_LENGTH}
          value={privateNote}
          disabled={busy}
          onChange={(event) => setPrivateNote(event.target.value)}
        />
        <p className="ar-hint">{t('admin.gmInterference.privateNoteHint')}</p>
      </div>
      <div className="ar-row-actions">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>{t('common.cancel', 'Cancel')}</Button>
        <Button type="submit" loading={busy} disabled={!outcome}>{t('admin.gmInterference.resolve')}</Button>
      </div>
    </form>
  );
}

/** The GM interference queue (ECO-14): every GM sees and resolves the requests. */
export default function ManageGmInterference() {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [requests, setRequests] = useState<StaffGmInterferenceRequest[]>([]);
  const [matches, setMatches] = useState<Map<string, Match>>(new Map());
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [symbol, setSymbol] = useState('$');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [resolving, setResolving] = useState<StaffGmInterferenceRequest | null>(null);

  const load = useCallback(async (status: StatusFilter, signal?: AbortSignal) => {
    setLoading(true);
    try {
      const result = await gmInterferenceApi.list(status || undefined, signal);
      if (signal?.aborted) return;
      setRequests(result.requests);
      setLoadFailed(false);
    } catch {
      if (!signal?.aborted) setLoadFailed(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(filter, controller.signal);
    return () => controller.abort();
  }, [filter, load]);

  // Match and name lookups for linked matches. Failing ones only cost the description.
  useEffect(() => {
    const controller = new AbortController();
    const loadLookups = async () => {
      const [scheduled, directory, catalog] = await Promise.allSettled([
        matchesApi.getAll({ status: 'scheduled' }, controller.signal),
        playersApi.getDirectory(controller.signal),
        economyApi.getCatalog(controller.signal),
      ]);
      if (controller.signal.aborted) return;
      if (scheduled.status === 'fulfilled') setMatches(new Map(scheduled.value.map((match) => [match.matchId, match])));
      if (directory.status === 'fulfilled') setNames(new Map(directory.value.map((entry) => [entry.playerId, entry.name])));
      if (catalog.status === 'fulfilled') setSymbol(catalog.value.currencySymbol);
    };
    void loadLookups();
    return () => controller.abort();
  }, []);

  const formatAmount = useCallback((amount: number) => formatMoney(amount, symbol, i18n.language), [symbol, i18n.language]);

  const filterOptions = useMemo(() => FILTERS.map((value) => ({
    value,
    label: t(`admin.gmInterference.filters.${value || 'all'}`),
  })), [t]);

  const describeMatch = (matchId: string): string => {
    const match = matches.get(matchId);
    if (!match) return t('admin.gmInterference.matchUnavailable');
    const sides = match.participants.map((participantId) => names.get(participantId) ?? t('common.unknown'));
    return t('admin.gmInterference.matchLine', {
      date: formatCalendarDate(match.date, i18n.language),
      players: sides.join(' vs '),
    });
  };

  return (
    <div className="ar-page gm-queue">
      <PageHeader
        title={t('admin.gmInterference.title')}
        subtitle={t('admin.gmInterference.subtitle')}
        actions={(
          <Select
            label={t('admin.gmInterference.filterLabel')}
            value={filter}
            onValueChange={(value) => setFilter(value as StatusFilter)}
            options={filterOptions}
          />
        )}
      />

      {loadFailed && (
        <AdminNotice
          tone="error"
          action={<Button variant="ghost" size="sm" onClick={() => void load(filter)}>{t('common.retry', 'Retry')}</Button>}
        >
          {t('admin.gmInterference.loadFailed')}
        </AdminNotice>
      )}

      {loading && <Skeleton variant="block" count={3} />}

      {!loading && !loadFailed && requests.length === 0 && (
        <EmptyState title={t(filter === 'pending' ? 'admin.gmInterference.emptyPending' : 'admin.gmInterference.empty')} />
      )}

      {!loading && requests.length > 0 && (
        <ul className="ar-list" aria-label={t('admin.gmInterference.title')}>
          {requests.map((request) => (
            <li key={request.requestId} className="ar-list__row gm-queue__row">
              <div className="gm-queue__head">
                <span className="ar-strong">{request.playerName ?? names.get(request.playerId) ?? t('common.unknown')}</span>
                <Badge tone={GM_STATUS_TONES[request.status]}>{t(`economyShop.gm.status.${request.status}`)}</Badge>
                <span className="ar-sub">
                  {formatInstant(request.createdAt, i18n.language)} · {formatAmount(request.price)}
                </span>
              </div>
              <p className="gm-queue__text">{request.request}</p>
              {request.matchId && (
                <p className="ar-sub">{t('admin.gmInterference.linkedMatch', { match: describeMatch(request.matchId) })}</p>
              )}
              {request.publicNote && (
                <p className="gm-queue__note">{t('admin.gmInterference.publicNoteShown', { note: request.publicNote })}</p>
              )}
              {request.privateNote && (
                <p className="gm-queue__note gm-queue__note--private">
                  {t('admin.gmInterference.privateNoteShown', { note: request.privateNote })}
                </p>
              )}
              {request.status === 'pending' && (
                <div className="ar-row-actions">
                  <Button size="sm" onClick={() => setResolving(request)}>{t('admin.gmInterference.resolve')}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={resolving !== null}
        onClose={() => setResolving(null)}
        title={t('admin.gmInterference.resolveTitle', {
          name: resolving?.playerName ?? (resolving ? names.get(resolving.playerId) : undefined) ?? t('common.unknown'),
        })}
      >
        {resolving && (
          <ResolveForm
            key={resolving.requestId}
            request={resolving}
            formatAmount={formatAmount}
            onCancel={() => setResolving(null)}
            onResolved={() => {
              setResolving(null);
              void load(filter);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
