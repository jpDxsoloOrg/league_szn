import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { profileApi, wrestlersApi } from '../services/api';
import type { Player, Wrestler, WrestlerMove } from '../types';
import { MAX_MOVE_NAME_LENGTH } from '../types';
import { WRESTLER_NAME_ENTRY_MODE } from '../config/wrestlerNameEntry';
import { buildWrestlerOptionGroups } from '../utils/wrestlerOptions';
import { useAnnouncementOpen } from '../hooks/useAnnouncementOpen';
import { setProfileSetupOpen } from '../hooks/useProfileSetupOpen';
import {
  PROFILE_SETUP_SNOOZE_KEY,
  getProfileSetupGaps,
  hasSetupGaps,
  isProfileSetupExcludedPath,
} from '../utils/profileSetup';
import './ProfileCompletionModal.css';

interface MissingFields {
  name: boolean;
  psnId: boolean;
  wrestler: boolean;
  signature: boolean;
  finisher: boolean;
}

const NONE_MISSING: MissingFields = {
  name: false,
  psnId: false,
  wrestler: false,
  signature: false,
  finisher: false,
};

function readSnoozed(): boolean {
  try {
    return sessionStorage.getItem(PROFILE_SETUP_SNOOZE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSnoozed(): void {
  try {
    sessionStorage.setItem(PROFILE_SETUP_SNOOZE_KEY, '1');
  } catch {
    // Storage unavailable — the modal simply shows again on the next load.
  }
}

/**
 * Nudges a signed-in wrestler to finish the parts of their profile that
 * other people depend on: a display name and PSN ID so they can be found,
 * and a wrestler plus at least one signature and one finisher so commentary
 * can call their matches. Only the missing items expand into inputs; the
 * rest show as done. "Remind me later" snoozes for the browser session.
 */
export default function ProfileCompletionModal() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Announcements go first; this modal appears once they are dismissed.
  const announcementOpen = useAnnouncementOpen();
  const [profile, setProfile] = useState<Player | null>(null);
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [missing, setMissing] = useState<MissingFields>(NONE_MISSING);
  const [name, setName] = useState('');
  const [psnId, setPsnId] = useState('');
  const [wrestlerName, setWrestlerName] = useState('');
  const [wrestlerId, setWrestlerId] = useState('');
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [signature, setSignature] = useState<WrestlerMove>({ gameName: '', customName: '' });
  const [finisher, setFinisher] = useState<WrestlerMove>({ gameName: '', customName: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textWrestlerEntry = WRESTLER_NAME_ENTRY_MODE === 'text';
  const excluded = isProfileSetupExcludedPath(location.pathname);

  useEffect(() => {
    if (!isAuthenticated || isLoading || dismissed || excluded) return;
    if (readSnoozed()) return;

    let mounted = true;
    const controller = new AbortController();

    const checkProfile = async () => {
      try {
        const p = await profileApi.getMyProfile(controller.signal);
        if (!mounted) return;
        setProfile(p);

        // Everyone with a player row gets the same checklist, staff
        // included — admins wrestle too, and "Remind me later" covers the
        // ones who don't.
        const gaps = getProfileSetupGaps(p);
        const next: MissingFields = {
          name: !p.name || p.name.trim() === '',
          psnId: !p.psnId || p.psnId.trim() === '',
          wrestler: gaps.needsWrestler,
          signature: gaps.needsSignature,
          finisher: gaps.needsFinisher,
        };

        // This is the source of truth: a re-probe (e.g. after finishing the
        // full form on /profile and coming back) must be able to hide the
        // modal again, not only show it.
        setMissing(next);
        const needed = next.name || next.psnId || next.wrestler || next.signature || next.finisher;
        setShow(needed);
        if (needed && next.wrestler && !textWrestlerEntry) {
          wrestlersApi
            .getAll()
            .then((list) => { if (mounted) setWrestlers(list); })
            .catch(() => { /* dropdown stays empty; the profile link still works */ });
        }
      } catch {
        // No profile or error — don't show modal
      }
    };

    checkProfile();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [isAuthenticated, isLoading, dismissed, excluded, textWrestlerEntry]);

  // Sign-out resets everything so the next account in this tab gets its own
  // check (the snooze key is cleared by AuthContext).
  useEffect(() => {
    if (isAuthenticated) return;
    setShow(false);
    setDismissed(false);
    setProfile(null);
    setMissing(NONE_MISSING);
  }, [isAuthenticated]);

  // Move focus into the dialog: the first input if there is one, else the
  // heading, so keyboard and screen-reader users land inside aria-modal.
  useEffect(() => {
    if (!show || excluded || announcementOpen) return;
    const root = dialogRef.current;
    if (!root) return;
    const first = root.querySelector<HTMLElement>('input, select');
    (first ?? root.querySelector<HTMLElement>('h2'))?.focus();
  }, [show, excluded, missing, announcementOpen]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setSaving(true);

    try {
      const updates: Parameters<typeof profileApi.updateMyProfile>[0] = {};
      if (missing.name && name.trim()) updates.name = name.trim();
      if (missing.psnId && psnId.trim()) updates.psnId = psnId.trim();
      if (missing.wrestler) {
        if (textWrestlerEntry && wrestlerName.trim()) updates.currentWrestler = wrestlerName.trim();
        if (!textWrestlerEntry && wrestlerId) updates.currentWrestlerId = wrestlerId;
      }
      // New moves are appended to whatever is already stored (minus any
      // blank legacy rows, which would only eat into the five-move cap).
      const keep = (moves: WrestlerMove[] | undefined) =>
        (moves ?? []).filter((m) => (m.gameName ?? '').trim().length > 0);
      if (missing.signature && signature.gameName.trim()) {
        updates.signatures = [
          ...keep(profile?.signatures),
          { gameName: signature.gameName.trim(), customName: signature.customName.trim() },
        ];
      }
      if (missing.finisher && finisher.gameName.trim()) {
        updates.finishers = [
          ...keep(profile?.finishers),
          { gameName: finisher.gameName.trim(), customName: finisher.customName.trim() },
        ];
      }

      if (Object.keys(updates).length === 0) {
        setError(t('profileModal.fillRequired'));
        setSaving(false);
        return;
      }

      const updated = await profileApi.updateMyProfile(updates);

      // Anything still missing keeps the modal open with the done items ticked.
      const gaps = getProfileSetupGaps(updated);
      const still: MissingFields = {
        name: !updated.name || updated.name.trim() === '',
        psnId: !updated.psnId || updated.psnId.trim() === '',
        wrestler: gaps.needsWrestler,
        signature: gaps.needsSignature,
        finisher: gaps.needsFinisher,
      };
      setProfile(updated);
      setMissing(still);
      if (!still.name && !still.psnId && !hasSetupGaps(gaps)) {
        setShow(false);
        setDismissed(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('profileModal.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [missing, name, psnId, wrestlerName, wrestlerId, signature, finisher, profile, textWrestlerEntry, t]);

  const handleSnooze = () => {
    writeSnoozed();
    setShow(false);
    setDismissed(true);
  };

  const handleOpenProfile = () => {
    // The full form takes over; don't pop again while they're on it.
    setShow(false);
    setDismissed(true);
  };

  // Let later overlays (the suspension-reinstate modal) wait while this is up.
  const isOpen = show && profile !== null && !excluded && !announcementOpen;
  useEffect(() => {
    setProfileSetupOpen(isOpen);
    return () => setProfileSetupOpen(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const setupItems = missing.wrestler || missing.signature || missing.finisher;
  const showChecklist = setupItems || !missing.name || !missing.psnId;

  const renderStatus = (done: boolean) => (
    <span
      className={`profile-modal-status ${done ? 'profile-modal-status--done' : 'profile-modal-status--todo'}`}
      role="img"
      aria-label={done ? t('profileModal.done') : t('profileModal.todo')}
    >
      {done ? '✓' : '✗'}
    </span>
  );

  const moveRow = (
    id: string,
    itemLabel: string,
    value: WrestlerMove,
    onChange: (next: WrestlerMove) => void,
  ) => (
    <div className="profile-modal-move-row">
      <input
        type="text"
        id={`${id}-game`}
        aria-label={`${itemLabel} — ${t('profile.moves.gameName')}`}
        placeholder={t('profile.moves.gameNamePlaceholder')}
        value={value.gameName}
        maxLength={MAX_MOVE_NAME_LENGTH}
        onChange={(e) => onChange({ ...value, gameName: e.target.value })}
      />
      <input
        type="text"
        id={`${id}-custom`}
        aria-label={`${itemLabel} — ${t('profile.moves.customName')}`}
        placeholder={value.gameName.trim() || t('profile.moves.customNamePlaceholder')}
        value={value.customName}
        maxLength={MAX_MOVE_NAME_LENGTH}
        onChange={(e) => onChange({ ...value, customName: e.target.value })}
      />
    </div>
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !saving) handleSnooze();
  };

  return (
    <div
      className="profile-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      ref={dialogRef}
      onKeyDown={onKeyDown}
    >
      <div className="profile-modal">
        <h2 id="profile-modal-title" tabIndex={-1}>
          {setupItems ? t('profileModal.setupTitle') : t('profileModal.title')}
        </h2>
        <p className="profile-modal-subtitle">
          {setupItems ? t('profileModal.setupSubtitle') : t('profileModal.subtitle')}
        </p>

        <form
          className={`profile-modal-form${showChecklist ? ' profile-modal-form--checklist' : ''}`}
          onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}
        >
          {missing.name && (
            <div className="form-group">
              <label htmlFor="modal-name">{t('profileModal.playerName')}</label>
              <input
                type="text"
                id="modal-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('profileModal.playerNamePlaceholder')}
              />
            </div>
          )}

          {missing.psnId && (
            <div className="form-group">
              <label htmlFor="modal-psnId">{t('profileModal.psnId')}</label>
              <input
                type="text"
                id="modal-psnId"
                value={psnId}
                onChange={(e) => setPsnId(e.target.value)}
                placeholder={t('profileModal.psnIdPlaceholder')}
              />
            </div>
          )}

          <div className="profile-modal-checklist">
            <fieldset className="profile-modal-item">
              <legend className="profile-modal-item-head">
                {renderStatus(!missing.wrestler)}
                <span>{t('profileModal.pickWrestler')}</span>
              </legend>
              {missing.wrestler && (
                <div className="profile-modal-item-body">
                  <p className="profile-modal-hint">{t('profileModal.listedAsNeedsWrestler')}</p>
                  {textWrestlerEntry ? (
                    <input
                      type="text"
                      id="modal-wrestler"
                      aria-label={t('profileModal.pickWrestler')}
                      value={wrestlerName}
                      onChange={(e) => setWrestlerName(e.target.value)}
                      placeholder={t('profileModal.wrestlerPlaceholder')}
                    />
                  ) : (
                    <select
                      id="modal-wrestler-id"
                      aria-label={t('profileModal.pickWrestler')}
                      value={wrestlerId}
                      onChange={(e) => setWrestlerId(e.target.value)}
                    >
                      <option value="">{t('profileModal.wrestlerPlaceholder')}</option>
                      {buildWrestlerOptionGroups(wrestlers, undefined, undefined).map((group) => (
                        <optgroup key={group.promotion} label={group.promotion}>
                          {group.wrestlers.map((w) => (
                            <option key={w.wrestlerId} value={w.wrestlerId}>{w.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </fieldset>

            <fieldset className="profile-modal-item">
              <legend className="profile-modal-item-head">
                {renderStatus(!missing.signature)}
                <span>{t('profileModal.addSignature')}</span>
              </legend>
              {missing.signature && (
                <div className="profile-modal-item-body">
                  {moveRow('modal-signature', t('profileModal.addSignature'), signature, setSignature)}
                </div>
              )}
            </fieldset>

            <fieldset className="profile-modal-item">
              <legend className="profile-modal-item-head">
                {renderStatus(!missing.finisher)}
                <span>{t('profileModal.addFinisher')}</span>
              </legend>
              {missing.finisher && (
                <div className="profile-modal-item-body">
                  {moveRow('modal-finisher', t('profileModal.addFinisher'), finisher, setFinisher)}
                </div>
              )}
            </fieldset>
          </div>

          {error && (
            <div className="error-message" role="alert">{error}</div>
          )}

          <div className="profile-modal-actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={saving}
              aria-busy={saving}
            >
              {saving ? t('common.saving') : t('profileModal.saveAndContinue')}
            </button>
          </div>
          <div className="profile-modal-links">
            <Link to="/profile" className="profile-modal-link" onClick={handleOpenProfile}>
              {t('profileModal.openFullProfile')}
            </Link>
            <button type="button" className="profile-modal-link profile-modal-link--muted" onClick={handleSnooze} disabled={saving}>
              {t('profileModal.remindLater')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
