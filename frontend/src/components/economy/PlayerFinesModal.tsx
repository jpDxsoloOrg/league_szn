import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { economyApi, type FinePreset } from '../../services/api/economy.api';
import { FINE_REASON_MAX_LENGTH, finesApi, type IssueFineInput } from '../../services/api/fines.api';
import type { ShopLedgerEntry } from '../../services/api/shop.api';
import { formatInstant } from '../../utils/dateUtils';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Select from '../ui/Select';
import Skeleton from '../ui/Skeleton';
import { useToast } from '../ui/toastContext';
import { splitFines } from './economyDisplay';
import { economyErrorMessage } from './economyErrors';
import { formatMoney } from './shopItems';
import './PlayerFinesModal.css';

const CUSTOM = '__custom__';
const LEDGER_PAGE_SIZE = 50;

export interface FinedPlayer {
  playerId: string;
  name: string;
}

interface FinesBodyProps {
  player: FinedPlayer;
  matchId?: string;
  onChanged?: () => void;
}

function FinesBody({ player, matchId, onChanged }: FinesBodyProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const fieldId = useId();

  const [presets, setPresets] = useState<FinePreset[]>([]);
  const [symbol, setSymbol] = useState('$');
  const [entries, setEntries] = useState<ShopLedgerEntry[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [choice, setChoice] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRescind, setConfirmRescind] = useState<string | null>(null);

  const money = useCallback((value: number) => formatMoney(value, symbol, i18n.language), [symbol, i18n.language]);

  const loadLedger = useCallback(async (signal?: AbortSignal) => {
    const page = await finesApi.getPlayerLedger(player.playerId, { limit: LEDGER_PAGE_SIZE }, signal);
    if (signal?.aborted) return;
    setEntries(page.items);
    setBalance(page.balance);
    setNextCursor(page.nextCursor);
  }, [player.playerId]);

  useEffect(() => {
    const controller = new AbortController();
    const loadAll = async () => {
      try {
        const [config] = await Promise.all([
          economyApi.getConfig(controller.signal),
          loadLedger(controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setPresets(config.settings.finePresets.filter((preset) => preset.amount > 0));
        setSymbol(config.settings.currencySymbol);
        setLoadFailed(false);
      } catch {
        if (!controller.signal.aborted) setLoadFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void loadAll();
    return () => controller.abort();
  }, [loadLedger]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await finesApi.getPlayerLedger(player.playerId, { cursor: nextCursor, limit: LEDGER_PAGE_SIZE });
      setEntries((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(economyErrorMessage(err, t, t('economyFines.loadFailed')));
    } finally {
      setLoadingMore(false);
    }
  };

  const { fines, rescinded } = useMemo(() => splitFines(entries), [entries]);

  const options = [
    ...presets.map((preset) => ({ value: preset.key, label: `${preset.label} (${money(preset.amount)})` })),
    { value: CUSTOM, label: t('economyFines.custom') },
  ];

  const isCustom = choice === CUSTOM;
  const parsedAmount = Number(amount);
  const amountValid = Number.isSafeInteger(parsedAmount) && parsedAmount > 0;
  const trimmedReason = reason.trim();
  const canIssue = choice !== '' && (!isCustom || (amountValid && trimmedReason.length > 0));

  const issue = async (event: FormEvent) => {
    event.preventDefault();
    if (!canIssue) return;
    const base = { requestId, ...(matchId && { matchId }) };
    const input: IssueFineInput = isCustom
      ? { ...base, amount: parsedAmount, reason: trimmedReason }
      : { ...base, presetKey: choice, ...(trimmedReason && { reason: trimmedReason }) };
    setBusy(true);
    setError(null);
    try {
      const result = await finesApi.issue(player.playerId, input);
      showToast(t('economyFines.issued', { name: player.name, amount: money(-result.entry.amount) }), 'success');
      setChoice('');
      setAmount('');
      setReason('');
      setRequestId(crypto.randomUUID());
      await loadLedger();
      onChanged?.();
    } catch (err) {
      setError(economyErrorMessage(err, t, t('economyFines.issueFailed')));
    } finally {
      setBusy(false);
    }
  };

  const rescind = async (entryId: string) => {
    setBusy(true);
    setError(null);
    try {
      await finesApi.rescind(entryId);
      showToast(t('economyFines.rescinded'), 'success');
      setConfirmRescind(null);
      await loadLedger();
      onChanged?.();
    } catch (err) {
      setError(economyErrorMessage(err, t, t('economyFines.rescindFailed')));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Skeleton variant="block" count={3} />;

  return (
    <div className="fines-modal">
      {loadFailed && <p className="fines-modal__error" role="alert">{t('economyFines.loadFailed')}</p>}
      {error && <p className="fines-modal__error" role="alert">{error}</p>}
      {balance !== null && (
        <p className={`fines-modal__balance${balance < 0 ? ' fines-modal__balance--debt' : ''}`}>
          {t('economyFines.balance', { amount: money(balance) })}
        </p>
      )}

      <form className="fines-modal__form" onSubmit={issue}>
        <h3 className="fines-modal__heading">{t('economyFines.issueHeading')}</h3>
        <Select
          label={t('economyFines.fineLabel')}
          placeholder={t('economyFines.pickFine')}
          value={choice}
          onValueChange={setChoice}
          options={options}
          disabled={busy}
        />
        {isCustom && (
          <div className="fines-modal__field">
            <label className="fines-modal__label" htmlFor={`${fieldId}-amount`}>{t('economyFines.amount')}</label>
            <input
              id={`${fieldId}-amount`}
              className="fines-modal__input"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={amount}
              disabled={busy}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
        )}
        <div className="fines-modal__field">
          <label className="fines-modal__label" htmlFor={`${fieldId}-reason`}>
            {isCustom ? t('economyFines.reasonRequired') : t('economyFines.reasonOptional')}
          </label>
          <textarea
            id={`${fieldId}-reason`}
            className="fines-modal__input"
            rows={2}
            maxLength={FINE_REASON_MAX_LENGTH}
            value={reason}
            disabled={busy}
            onChange={(event) => setReason(event.target.value)}
          />
          <p className="fines-modal__hint">{t('economyFines.reasonHint')}</p>
        </div>
        <div className="fines-modal__actions">
          <Button type="submit" variant="danger" loading={busy && confirmRescind === null} disabled={!canIssue || busy}>
            {t('economyFines.issue', { name: player.name })}
          </Button>
        </div>
      </form>

      <section className="fines-modal__history" aria-labelledby={`${fieldId}-history`}>
        <h3 id={`${fieldId}-history`} className="fines-modal__heading">{t('economyFines.history')}</h3>
        {fines.length === 0 ? (
          <p className="fines-modal__muted">{t('economyFines.noFines')}</p>
        ) : (
          <ul className="fines-modal__list">
            {fines.map((fine) => {
              const isRescinded = rescinded.has(fine.entryId);
              return (
                <li key={fine.entryId} className="fines-modal__entry">
                  <span className="fines-modal__entry-head">
                    <strong>{money(-fine.amount)}</strong>
                    <span className="fines-modal__muted">{formatInstant(fine.createdAt, i18n.language)}</span>
                    {isRescinded && <Badge>{t('economyFines.rescindedBadge')}</Badge>}
                  </span>
                  {fine.note && <span className="fines-modal__note">{fine.note}</span>}
                  {!isRescinded && confirmRescind !== fine.entryId && (
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmRescind(fine.entryId)}>
                      {t('economyFines.rescind')}
                    </Button>
                  )}
                  {confirmRescind === fine.entryId && (
                    <span className="fines-modal__confirm">
                      <span>{t('economyFines.rescindConfirm', { amount: money(-fine.amount) })}</span>
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmRescind(null)}>
                        {t('common.cancel', 'Cancel')}
                      </Button>
                      <Button size="sm" loading={busy} onClick={() => void rescind(fine.entryId)}>
                        {t('economyFines.rescindYes')}
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {nextCursor && (
          <Button variant="secondary" size="sm" loading={loadingMore} onClick={() => void loadMore()}>
            {t('economyFines.loadMore')}
          </Button>
        )}
      </section>
    </div>
  );
}

export interface PlayerFinesModalProps {
  /** The player to fine. The dialog is closed while this is null. */
  player: FinedPlayer | null;
  onClose: () => void;
  /** Ties the fine to a match (`ref: match`). */
  matchId?: string;
  /** Called after a fine or a rescind, so the page behind can refresh balances. */
  onChanged?: () => void;
}

/**
 * GM fines for one player (ECO-14): issue a preset or custom fine, and see and
 * rescind past fines. Used from the player admin page and the contracts desk.
 */
export default function PlayerFinesModal({ player, onClose, matchId, onChanged }: PlayerFinesModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      open={player !== null}
      onClose={onClose}
      title={t('economyFines.title', { name: player?.name ?? '' })}
    >
      {player && <FinesBody key={player.playerId} player={player} matchId={matchId} onChanged={onChanged} />}
    </Modal>
  );
}
