import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Circle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { profileApi, wrestlersApi } from '../services/api';
import { isApiError } from '../services/api/apiClient';
import type { Player, Wrestler, WrestlerMove } from '../types';
import { MAX_MOVE_NAME_LENGTH } from '../types';
import { VALIDATION } from '../constants';
import { WRESTLER_NAME_ENTRY_MODE } from '../config/wrestlerNameEntry';
import { buildWrestlerOptionGroups } from '../utils/wrestlerOptions';
import { isNeedsWrestler } from '../utils/needsWrestler';
import { setWrestlerPromptPending, useAnnouncementOpen } from '../hooks/useAnnouncementOpen';
import {
  NO_PLAYER_ROW_KEY,
  PROFILE_SETUP_SNOOZE_KEY,
  getProfileSetupGaps,
  hasSetupGaps,
  isProfileSetupExcludedPath,
} from '../utils/profileSetup';
import Button from './ui/Button';
import Modal from './ui/Modal';
import { useToast } from './ui/toastContext';
import './MeForms.css';
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

function readSessionFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeSessionFlag(key: string): void {
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    // Storage unavailable — the check simply runs again on the next load.
  }
}

const FIRST_FIELD = 'input, select';

/**
 * Prompts a signed-in player to finish the parts of their profile other
 * people depend on. The wrestler name comes first: a player without one can
 * sign in but stays hidden from public screens until they save a name. A
 * display name and PSN ID let others find them, and a signature and finisher
 * let commentary call their matches. Only the missing items expand into
 * inputs. "Remind me later" snoozes for the browser session.
 */
export default function ProfileCompletionModal() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading, isWrestler, profile: sessionProfile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const formRef = useRef<HTMLFormElement | null>(null);
  // Announcements go ahead of the checklist, but not ahead of the wrestler
  // prompt: a hidden player needs that first (see useAnnouncementOpen).
  const announcementOpen = useAnnouncementOpen();
  // AuthContext already loaded this on sign-in, so the first check reuses it.
  // Later checks must fetch: the row can change on /profile.
  const unusedSessionProfile = useRef<Player | null>(null);
  const firstCheckDone = useRef(false);
  const [profile, setProfile] = useState<Player | null>(null);
  const [checking, setChecking] = useState(false);
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
  const [nowVisible, setNowVisible] = useState(false);

  const textWrestlerEntry = WRESTLER_NAME_ENTRY_MODE === 'text';
  const excluded = isProfileSetupExcludedPath(location.pathname);

  useEffect(() => {
    if (!firstCheckDone.current) unusedSessionProfile.current = sessionProfile;
  }, [sessionProfile]);

  useEffect(() => {
    if (!isAuthenticated || isLoading || dismissed || excluded) return;
    if (readSessionFlag(PROFILE_SETUP_SNOOZE_KEY) || readSessionFlag(NO_PLAYER_ROW_KEY)) return;

    let mounted = true;
    const controller = new AbortController();

    const checkProfile = async () => {
      setChecking(true);
      try {
        const known = firstCheckDone.current ? null : unusedSessionProfile.current;
        firstCheckDone.current = true;
        const p = known ?? await profileApi.getMyProfile(controller.signal);
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
        setChecking(false);
        if (needed && next.wrestler && !textWrestlerEntry) {
          try {
            const list = await wrestlersApi.getAll();
            if (mounted) setWrestlers(list);
          } catch {
            // The dropdown stays empty; the profile link still works.
          }
        }
      } catch (err) {
        // No profile or error — don't show modal
        if (!isWrestler && isApiError(err, 404)) writeSessionFlag(NO_PLAYER_ROW_KEY);
        if (mounted) setChecking(false);
      }
    };

    checkProfile();

    return () => {
      mounted = false;
      controller.abort();
      setChecking(false);
    };
  }, [isAuthenticated, isLoading, isWrestler, dismissed, excluded, textWrestlerEntry]);

  // Holds announcements back until we know whether the wrestler prompt goes first.
  const wrestlerPromptPending = checking || (show && missing.wrestler && !excluded);
  useEffect(() => {
    setWrestlerPromptPending(wrestlerPromptPending);
    return () => setWrestlerPromptPending(false);
  }, [wrestlerPromptPending]);

  // Sign-out resets everything so the next account in this tab gets its own
  // check (the snooze key is cleared by AuthContext).
  useEffect(() => {
    if (isAuthenticated) return;
    firstCheckDone.current = false;
    setShow(false);
    setDismissed(false);
    setProfile(null);
    setMissing(NONE_MISSING);
    setNowVisible(false);
  }, [isAuthenticated]);

  // The dialog mounts in a portal, so focus lands from the form's ref. The
  // shared Modal leaves focus alone once something inside it already has it.
  const attachForm = useCallback((form: HTMLFormElement | null) => {
    formRef.current = form;
    form?.querySelector<HTMLElement>(FIRST_FIELD)?.focus();
  }, []);

  // A partial save removes the inputs it filled, so move on to the next one.
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>(FIRST_FIELD)?.focus();
  }, [missing]);

  const handleSubmit = useCallback(async () => {
    setError(null);

    // The backend stores this as "no wrestler", so saving it would look like
    // success while leaving the player hidden.
    const typedWrestler = wrestlerName.trim();
    if (missing.wrestler && textWrestlerEntry && typedWrestler && isNeedsWrestler(typedWrestler)) {
      setError(t('me.setup.placeholderRejected'));
      return;
    }

    setSaving(true);

    try {
      const updates: Parameters<typeof profileApi.updateMyProfile>[0] = {};
      if (missing.name && name.trim()) updates.name = name.trim();
      if (missing.psnId && psnId.trim()) updates.psnId = psnId.trim();
      if (missing.wrestler) {
        if (textWrestlerEntry && typedWrestler) updates.currentWrestler = typedWrestler;
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
      // Pages reading the wrestler from AuthContext must see the new name.
      await refreshProfile();

      // Anything still missing keeps the modal open with the done items ticked.
      const gaps = getProfileSetupGaps(updated);
      const still: MissingFields = {
        name: !updated.name || updated.name.trim() === '',
        psnId: !updated.psnId || updated.psnId.trim() === '',
        wrestler: gaps.needsWrestler,
        signature: gaps.needsSignature,
        finisher: gaps.needsFinisher,
      };
      const becameVisible = missing.wrestler && !still.wrestler;
      setProfile(updated);
      setMissing(still);
      if (becameVisible) setNowVisible(true);
      if (!still.name && !still.psnId && !hasSetupGaps(gaps)) {
        setShow(false);
        setDismissed(true);
        if (becameVisible) showToast(t('me.setup.nowVisible'), 'success');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('profileModal.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [missing, name, psnId, wrestlerName, wrestlerId, signature, finisher, profile, textWrestlerEntry, t, refreshProfile, showToast]);

  const handleSnooze = () => {
    if (saving) return;
    writeSessionFlag(PROFILE_SETUP_SNOOZE_KEY);
    setShow(false);
    setDismissed(true);
  };

  const handleOpenProfile = () => {
    // The full form takes over; don't pop again while they're on it.
    setShow(false);
    setDismissed(true);
  };

  if (!show || !profile || excluded || (announcementOpen && !missing.wrestler)) return null;

  const setupItems = missing.wrestler || missing.signature || missing.finisher;
  const wrestlerLabel = textWrestlerEntry ? t('me.setup.wrestlerLabel') : t('profileModal.pickWrestler');

  let title = t('profileModal.title');
  let description = t('profileModal.subtitle');
  if (missing.wrestler) {
    title = t('me.setup.title');
    description = t('me.setup.hiddenNotice');
  } else if (setupItems) {
    title = t('profileModal.setupTitle');
    description = t('profileModal.setupSubtitle');
  }

  const renderStatus = (done: boolean) => (
    <span
      className={`profile-setup__status profile-setup__status--${done ? 'done' : 'todo'}`}
      role="img"
      aria-label={done ? t('profileModal.done') : t('profileModal.todo')}
    >
      {done ? <Check aria-hidden="true" size={16} /> : <Circle aria-hidden="true" size={12} />}
    </span>
  );

  const moveRow = (
    id: string,
    itemLabel: string,
    value: WrestlerMove,
    onChange: (next: WrestlerMove) => void,
  ) => (
    <div className="profile-setup__moves me-field">
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

  return (
    <Modal open onClose={handleSnooze} title={title} description={description}>
      <form
        ref={attachForm}
        className="profile-setup__form"
        onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}
      >
        {nowVisible && (
          <p className="me-alert me-alert--success" role="status">{t('me.setup.nowVisible')}</p>
        )}

        <fieldset className="profile-setup__item">
          <legend className="profile-setup__item-head">
            {renderStatus(!missing.wrestler)}
            <span>{wrestlerLabel}</span>
          </legend>
          {missing.wrestler && (
            <div className="profile-setup__item-body">
              <div className="me-field">
                {textWrestlerEntry ? (
                  <input
                    type="text"
                    id="modal-wrestler"
                    aria-label={wrestlerLabel}
                    aria-describedby="modal-wrestler-hint"
                    value={wrestlerName}
                    maxLength={VALIDATION.MAX_NAME_LENGTH}
                    onChange={(e) => setWrestlerName(e.target.value)}
                    placeholder={t('profileModal.wrestlerPlaceholder')}
                  />
                ) : (
                  <select
                    id="modal-wrestler-id"
                    aria-label={wrestlerLabel}
                    aria-describedby="modal-wrestler-hint"
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
              <p className="me-hint" id="modal-wrestler-hint">
                {textWrestlerEntry ? t('me.setup.wrestlerHint') : t('me.setup.wrestlerHintRoster')}
              </p>
            </div>
          )}
        </fieldset>

        {missing.name && (
          <div className="profile-setup__item">
            <div className="me-field">
              <label htmlFor="modal-name">{t('profileModal.playerName')}</label>
              <input
                type="text"
                id="modal-name"
                value={name}
                maxLength={VALIDATION.MAX_NAME_LENGTH}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('profileModal.playerNamePlaceholder')}
              />
            </div>
          </div>
        )}

        {missing.psnId && (
          <div className="profile-setup__item">
            <div className="me-field">
              <label htmlFor="modal-psnId">{t('profileModal.psnId')}</label>
              <input
                type="text"
                id="modal-psnId"
                value={psnId}
                maxLength={VALIDATION.MAX_NAME_LENGTH}
                onChange={(e) => setPsnId(e.target.value)}
                placeholder={t('profileModal.psnIdPlaceholder')}
              />
            </div>
          </div>
        )}

        <fieldset className="profile-setup__item">
          <legend className="profile-setup__item-head">
            {renderStatus(!missing.signature)}
            <span>{t('profileModal.addSignature')}</span>
          </legend>
          {missing.signature && (
            <div className="profile-setup__item-body">
              {moveRow('modal-signature', t('profileModal.addSignature'), signature, setSignature)}
            </div>
          )}
        </fieldset>

        <fieldset className="profile-setup__item">
          <legend className="profile-setup__item-head">
            {renderStatus(!missing.finisher)}
            <span>{t('profileModal.addFinisher')}</span>
          </legend>
          {missing.finisher && (
            <div className="profile-setup__item-body">
              {moveRow('modal-finisher', t('profileModal.addFinisher'), finisher, setFinisher)}
            </div>
          )}
        </fieldset>

        {error && <p className="me-alert me-alert--error" role="alert">{error}</p>}

        <Link to="/profile" className="profile-setup__link" onClick={handleOpenProfile}>
          {t('profileModal.openFullProfile')}
        </Link>

        <div className="profile-setup__actions">
          <Button variant="ghost" onClick={handleSnooze} disabled={saving}>
            {t('profileModal.remindLater')}
          </Button>
          <Button type="submit" loading={saving}>
            {saving ? t('common.saving') : t('profileModal.saveAndContinue')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
