import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { disciplineApi } from '../../services/api';
import type {
  DisciplineActionResult,
  DisciplineHoldings,
  Player,
  PlayerDisciplineDetail,
  PlayerStrike,
} from '../../types';
import { formatInstant } from '../../utils/dateUtils';
import { refusalOr } from '../../utils/discipline';
import { nameOrUnnamed } from '../../utils/playerName';
import { DISCIPLINE_STATUS_KEYS } from '../discipline/disciplineStatus';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Skeleton from '../ui/Skeleton';
import AdminNotice from './AdminNotice';
import ConfirmModal from './ConfirmModal';
import DisciplineBadge from './DisciplineBadge';
import DisciplineHoldingsList from './DisciplineHoldingsList';
import './adminRoster.css';
import './PlayerDisciplineModal.css';

/** Mirrors MIN_REASON_LENGTH and MAX_REASON_LENGTH in backend/lib/discipline.ts. */
const MIN_REASON_LENGTH = 3;
const MAX_REASON_LENGTH = 500;

const isValidReason = (reason: string): boolean => {
  const { length } = reason.trim();
  return length >= MIN_REASON_LENGTH && length <= MAX_REASON_LENGTH;
};

type DisciplineAction = 'strike' | 'remove' | 'reactivate';

interface CompletedAction {
  action: DisciplineAction;
  result: DisciplineActionResult;
}

interface ReasonFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  /** Take focus on mount, for a field that replaces the button just pressed. */
  focusOnMount?: boolean;
}

function ReasonField({ label, value, onChange, disabled, focusOnMount = false }: ReasonFieldProps) {
  const { t } = useTranslation();
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusOnMount) fieldRef.current?.focus();
  }, [focusOnMount]);

  return (
    <div className="ar-field">
      <label className="ar-field__label" htmlFor={fieldId}>{label}</label>
      <textarea
        ref={fieldRef}
        id={fieldId}
        aria-describedby={hintId}
        className="ar-input discipline-modal__reason"
        rows={3}
        maxLength={MAX_REASON_LENGTH}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      <p id={hintId} className="ar-hint">{t('discipline.admin.reasonHint', { min: MIN_REASON_LENGTH, max: MAX_REASON_LENGTH })}</p>
    </div>
  );
}

interface ActionOutcomeProps {
  completed: CompletedAction;
  holdings: DisciplineHoldings;
  onNavigate: () => void;
}

/** The warnings an action can leave behind, and the holdings a deactivation leaves. */
function ActionOutcome({ completed, holdings, onNavigate }: ActionOutcomeProps) {
  const { t } = useTranslation();
  const { action, result } = completed;
  const { accountSync, softHoldsCleared, summary } = result;
  const deactivated = action === 'strike' && summary.status === 'deactivated';
  const holdsWereDue = action === 'strike' && (deactivated || summary.status === 'signup-blocked');

  return (
    <>
      <AdminNotice tone="success">{t(`discipline.admin.done.${action}`)}</AdminNotice>
      {accountSync === 'failed' && (
        <AdminNotice tone="warning">
          {t('discipline.admin.accountSyncFailed')} <Link to="/admin/users" onClick={onNavigate}>{t('discipline.admin.manageUsers')}</Link>
        </AdminNotice>
      )}
      {accountSync === 'not-linked' && <AdminNotice tone="info">{t('discipline.admin.notLinked')}</AdminNotice>}
      {accountSync === 'not-needed' && action === 'reactivate' && (
        <AdminNotice tone="info">
          {t('discipline.admin.loginAlreadyDisabled')} <Link to="/admin/users" onClick={onNavigate}>{t('discipline.admin.manageUsers')}</Link>
        </AdminNotice>
      )}
      {holdsWereDue && !softHoldsCleared && (
        <AdminNotice tone="warning">{t('discipline.admin.softHoldsFailed')}</AdminNotice>
      )}
      {deactivated && <DisciplineHoldingsList holdings={holdings} onNavigate={onNavigate} />}
    </>
  );
}

function StrikeHistoryEntry({ strike, active }: { strike: PlayerStrike; active: boolean }) {
  const { t, i18n } = useTranslation();
  const formatDate = (iso: string) => formatInstant(iso, i18n.language);

  let state = t('discipline.admin.strikeLapsed');
  if (active) state = t('discipline.admin.strikeActive');
  if (strike.clearedAt) state = t('discipline.admin.strikeCleared');

  return (
    <li className="discipline-modal__entry">
      <span className="discipline-modal__entry-heading">
        <strong>{t('discipline.admin.issuedBy', { date: formatDate(strike.issuedAt), name: strike.issuedByName })}</strong>
        <Badge tone={active ? 'warning' : 'neutral'}>{state}</Badge>
      </span>
      <span className="discipline-modal__text">{strike.reason}</span>
      {strike.clearedAt && (
        <span className="discipline-modal__muted discipline-modal__text">
          {t(strike.clearedKind === 'reactivated' ? 'discipline.admin.clearedByReactivation' : 'discipline.admin.removedBy', {
            date: formatDate(strike.clearedAt),
            name: strike.clearedByName ?? '',
          })}
          {strike.clearedReason ? `: ${strike.clearedReason}` : ''}
        </span>
      )}
    </li>
  );
}

interface DisciplineBodyProps {
  player: Player;
  onChanged: () => void;
  onClose: () => void;
}

function DisciplineBody({ player, onChanged, onClose }: DisciplineBodyProps) {
  const { t, i18n } = useTranslation();
  const { isSuperAdmin } = useAuth();
  const { playerId } = player;

  const [detail, setDetail] = useState<PlayerDisciplineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<CompletedAction | null>(null);

  const [strikeReason, setStrikeReason] = useState('');
  const [confirmingDeactivation, setConfirmingDeactivation] = useState(false);
  const [removingStrikeId, setRemovingStrikeId] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  /** The strike whose Remove button takes focus back when its form closes. */
  const refocusRemoveFor = useRef<string | null>(null);
  const [reactivateReason, setReactivateReason] = useState('');
  const [restorePriorStrikes, setRestorePriorStrikes] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const loaded = await disciplineApi.get(playerId, signal);
      if (signal?.aborted) return;
      setDetail(loaded);
      setLoadFailed(false);
    } catch {
      if (!signal?.aborted) setLoadFailed(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  /** Every failure reloads, so the form never acts on what it last showed. */
  const runAction = async (
    action: DisciplineAction,
    send: () => Promise<DisciplineActionResult>,
  ): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setActionError(null);
    setCompleted(null);
    try {
      const result = await send();
      setCompleted({ action, result });
      onChanged();
      await load();
      return true;
    } catch (err) {
      setActionError(refusalOr(err, t('discipline.admin.actionFailed')));
      await load();
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Skeleton variant="block" count={3} />;

  if (!detail) {
    return (
      <AdminNotice
        tone="error"
        action={<Button variant="ghost" size="sm" onClick={() => void load()}>{t('common.retry', 'Retry')}</Button>}
      >
        {t('discipline.admin.loadFailed')}
      </AdminNotice>
    );
  }

  const { summary, version, nextStrikeOutcome, strikes, deactivations, holdings } = detail;
  const deactivated = summary.status === 'deactivated';
  const activeIds = new Set(summary.activeStrikes.map((strike) => strike.strikeId));
  const activeStrikes = strikes.filter((strike) => activeIds.has(strike.strikeId));
  const staffProtected = detail.isStaffAccount === true;
  const accountMismatch = detail.accountEnabled !== null && detail.accountEnabled === deactivated;
  const formatDate = (iso: string) => formatInstant(iso, i18n.language);
  const showingHoldingsResult = completed?.action === 'strike' && completed.result.summary.status === 'deactivated';
  // The action's holdings come back empty if its own read failed, so a reload that shows the deactivation wins.
  const outcomeHoldings = deactivated ? holdings : completed?.result.holdings;

  const issueLabel = () => {
    if (nextStrikeOutcome === 'deactivated') return t('discipline.admin.deactivateAccount');
    if (nextStrikeOutcome === 'warned') return t('discipline.admin.issueWarning');
    return summary.activeStrikeCount >= 2 ? t('discipline.admin.issueRestart') : t('discipline.admin.issueSecond');
  };

  const issueStrike = async () => {
    if (!nextStrikeOutcome) return;
    setConfirmingDeactivation(false);
    const issued = await runAction('strike', () => disciplineApi.issueStrike(playerId, {
      reason: strikeReason.trim(),
      expectedVersion: version,
      expectedOutcome: nextStrikeOutcome,
    }));
    if (issued) setStrikeReason('');
  };

  const handleIssueSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (nextStrikeOutcome === 'deactivated') {
      setConfirmingDeactivation(true);
      return;
    }
    void issueStrike();
  };

  const handleRemoveSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!removingStrikeId) return;
    const removed = await runAction('remove', () => disciplineApi.removeStrike(playerId, removingStrikeId, {
      reason: removeReason.trim(),
      expectedVersion: version,
    }));
    if (removed) {
      setRemovingStrikeId(null);
      setRemoveReason('');
    }
  };

  const handleReactivateSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const reactivated = await runAction('reactivate', () => disciplineApi.reactivate(playerId, {
      reason: reactivateReason.trim(),
      expectedVersion: version,
      ...(restorePriorStrikes ? { restorePriorStrikes: true } : {}),
    }));
    if (reactivated) {
      setReactivateReason('');
      setRestorePriorStrikes(false);
    }
  };

  return (
    <div className="discipline-modal">
      {actionError && <AdminNotice tone="error">{actionError}</AdminNotice>}
      {loadFailed && <AdminNotice tone="warning">{t('discipline.admin.staleDetail')}</AdminNotice>}
      {completed && outcomeHoldings && (
        <ActionOutcome completed={completed} holdings={outcomeHoldings} onNavigate={onClose} />
      )}
      {accountMismatch && (
        <AdminNotice tone="warning">
          {t('discipline.admin.accountMismatch')}{' '}
          {isSuperAdmin && <Link to="/admin/users" onClick={onClose}>{t('discipline.admin.manageUsers')}</Link>}
        </AdminNotice>
      )}
      {!isSuperAdmin && <AdminNotice tone="info">{t('discipline.admin.readOnly')}</AdminNotice>}

      <section className="discipline-modal__section" aria-label={t('discipline.admin.statusHeading')}>
        <div className="discipline-modal__status">
          {summary.status === 'clear'
            ? <Badge>{t(DISCIPLINE_STATUS_KEYS.clear)}</Badge>
            : <DisciplineBadge discipline={summary} />}
          {!detail.hasLinkedAccount && <span className="discipline-modal__muted">{t('discipline.admin.notLinked')}</span>}
        </div>
        {(summary.signupBlockedUntil || summary.cooldownEndsAt || summary.deactivatedAt) && (
          <dl className="discipline-modal__dates">
            {summary.signupBlockedUntil && (
              <div>
                <dt>{t('discipline.admin.signupBlockedUntil')}</dt>
                <dd>{formatDate(summary.signupBlockedUntil)}</dd>
              </div>
            )}
            {summary.cooldownEndsAt && (
              <div>
                <dt>{t('discipline.admin.cooldownEnds')}</dt>
                <dd>{formatDate(summary.cooldownEndsAt)}</dd>
              </div>
            )}
            {summary.deactivatedAt && (
              <div>
                <dt>{t('discipline.admin.deactivatedOn')}</dt>
                <dd>{formatDate(summary.deactivatedAt)}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      {activeStrikes.length > 0 && (
        <section className="discipline-modal__section">
          <h3 className="discipline-modal__heading">{t('discipline.admin.activeStrikes')}</h3>
          <ul className="discipline-modal__list">
            {activeStrikes.map((strike) => (
              <li key={strike.strikeId} className="discipline-modal__entry">
                <span className="discipline-modal__entry-heading">
                  <strong>{formatDate(strike.issuedAt)}</strong>
                  {isSuperAdmin && !deactivated && removingStrikeId !== strike.strikeId && (
                    <Button
                      ref={(button) => {
                        if (button && refocusRemoveFor.current === strike.strikeId) {
                          refocusRemoveFor.current = null;
                          button.focus();
                        }
                      }}
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setRemovingStrikeId(strike.strikeId);
                        setRemoveReason('');
                      }}
                    >
                      {t('discipline.admin.remove')}
                    </Button>
                  )}
                </span>
                <span className="discipline-modal__text">{strike.reason}</span>
                {removingStrikeId === strike.strikeId && (
                  <form className="discipline-modal__form" onSubmit={handleRemoveSubmit}>
                    <ReasonField
                      label={t('discipline.admin.removeReason')}
                      value={removeReason}
                      onChange={setRemoveReason}
                      disabled={busy}
                      focusOnMount
                    />
                    <div className="ar-row-actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          refocusRemoveFor.current = strike.strikeId;
                          setRemovingStrikeId(null);
                        }}
                      >
                        {t('common.cancel', 'Cancel')}
                      </Button>
                      <Button type="submit" size="sm" loading={busy} disabled={!isValidReason(removeReason)}>
                        {t('discipline.admin.confirmRemove')}
                      </Button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isSuperAdmin && !deactivated && nextStrikeOutcome && (
        <section className="discipline-modal__section">
          <h3 className="discipline-modal__heading">{t('discipline.admin.issueHeading')}</h3>
          {staffProtected ? (
            <AdminNotice tone="info">{t('discipline.admin.staffProtected')}</AdminNotice>
          ) : (
            <p className="discipline-modal__muted">{t(`discipline.admin.outcome.${nextStrikeOutcome}`)}</p>
          )}
          <form className="discipline-modal__form" onSubmit={handleIssueSubmit}>
            <ReasonField
              label={t('discipline.admin.reason')}
              value={strikeReason}
              onChange={setStrikeReason}
              disabled={busy || staffProtected}
            />
            <div className="ar-row-actions">
              <Button
                type="submit"
                variant={nextStrikeOutcome === 'deactivated' ? 'danger' : 'primary'}
                loading={busy}
                disabled={staffProtected || !isValidReason(strikeReason)}
              >
                {issueLabel()}
              </Button>
            </div>
          </form>
        </section>
      )}

      {isSuperAdmin && deactivated && (
        <section className="discipline-modal__section">
          <h3 className="discipline-modal__heading">{t('discipline.admin.reactivate')}</h3>
          <form className="discipline-modal__form" onSubmit={handleReactivateSubmit}>
            <ReasonField
              label={t('discipline.admin.reactivateReason')}
              value={reactivateReason}
              onChange={setReactivateReason}
              disabled={busy}
            />
            <label className="ar-check">
              <input
                type="checkbox"
                checked={restorePriorStrikes}
                disabled={busy}
                onChange={(event) => setRestorePriorStrikes(event.target.checked)}
              />
              {t('discipline.admin.restorePriorStrikes')}
            </label>
            {!showingHoldingsResult && <DisciplineHoldingsList holdings={holdings} onNavigate={onClose} />}
            <div className="ar-row-actions">
              <Button type="submit" loading={busy} disabled={!isValidReason(reactivateReason)}>
                {t('discipline.admin.reactivate')}
              </Button>
            </div>
          </form>
        </section>
      )}

      <section className="discipline-modal__section">
        <h3 className="discipline-modal__heading">{t('discipline.admin.history')}</h3>
        {strikes.length === 0 && deactivations.length === 0 ? (
          <p className="discipline-modal__muted">{t('discipline.admin.noHistory')}</p>
        ) : (
          <ul className="discipline-modal__list">
            {deactivations.map((record) => (
              <li key={record.deactivatedAt} className="discipline-modal__entry">
                <strong>
                  {t('discipline.admin.deactivatedBy', {
                    date: formatDate(record.deactivatedAt),
                    name: record.deactivatedByName,
                  })}
                </strong>
                {record.reactivatedAt && (
                  <span className="discipline-modal__muted discipline-modal__text">
                    {t('discipline.admin.reactivatedBy', {
                      date: formatDate(record.reactivatedAt),
                      name: record.reactivatedByName ?? '',
                    })}
                    {record.reactivationReason ? `: ${record.reactivationReason}` : ''}
                  </span>
                )}
              </li>
            ))}
            {strikes.map((strike) => (
              <StrikeHistoryEntry key={strike.strikeId} strike={strike} active={activeIds.has(strike.strikeId)} />
            ))}
          </ul>
        )}
      </section>

      <ConfirmModal
        open={confirmingDeactivation}
        title={t('discipline.admin.confirmDeactivateTitle')}
        message={t('discipline.admin.confirmDeactivate', { name: nameOrUnnamed(player.name, t('common.unnamedPlayer', 'Unnamed player')) })}
        confirmLabel={t('discipline.admin.deactivateAccount')}
        busy={busy}
        onConfirm={() => void issueStrike()}
        onCancel={() => setConfirmingDeactivation(false)}
      >
        <DisciplineHoldingsList holdings={holdings} onNavigate={onClose} />
      </ConfirmModal>
    </div>
  );
}

interface PlayerDisciplineModalProps {
  /** The player being viewed. The dialog is closed while this is null. */
  player: Player | null;
  onClose: () => void;
  /** Called after any action, so the list behind can refresh. */
  onChanged: () => void;
}

/** A player's discipline record. Admins can act on it; Moderators read it. */
export default function PlayerDisciplineModal({ player, onClose, onChanged }: PlayerDisciplineModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={player !== null}
      onClose={onClose}
      size="lg"
      title={t('discipline.admin.title', { name: nameOrUnnamed(player?.name, t('common.unnamedPlayer', 'Unnamed player')) })}
    >
      {player && <DisciplineBody key={player.playerId} player={player} onChanged={onChanged} onClose={onClose} />}
    </Modal>
  );
}
