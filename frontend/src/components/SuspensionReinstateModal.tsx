import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { playersApi } from '../services/api';
import type { SuspensionRow } from '../types';
import { useAnnouncementOpen } from '../hooks/useAnnouncementOpen';
import { useProfileSetupOpen } from '../hooks/useProfileSetupOpen';
import { isProfileSetupExcludedPath } from '../utils/profileSetup';
import { SUSPENSION_REINSTATE_SNOOZE_KEY } from '../utils/suspensionModal';
import { formatShortDate } from '../utils/bookingRecency';
import './SuspensionReinstateModal.css';

function readSnoozed(): boolean {
  try {
    return sessionStorage.getItem(SUSPENSION_REINSTATE_SNOOZE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSnoozed(): void {
  try {
    sessionStorage.setItem(SUSPENSION_REINSTATE_SNOOZE_KEY, '1');
  } catch {
    // Storage unavailable — the modal simply shows again on the next load.
  }
}

/**
 * Post-login nudge for staff: lists every suspended player whose date has
 * passed or whose shows have been served, with one-click reinstatement.
 * Defers to the announcement and profile-setup modals so dialogs never
 * stack, and "Remind me later" snoozes it for the browser session.
 */
export default function SuspensionReinstateModal() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading, isAdminOrModerator } = useAuth();
  const location = useLocation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const announcementOpen = useAnnouncementOpen();
  const profileSetupOpen = useProfileSetupOpen();
  const [rows, setRows] = useState<SuspensionRow[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [working, setWorking] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const excluded = isProfileSetupExcludedPath(location.pathname);
  const eligible = isAuthenticated && !isLoading && isAdminOrModerator;

  useEffect(() => {
    if (!eligible || dismissed || excluded) return;
    if (readSnoozed()) return;

    let mounted = true;
    const controller = new AbortController();

    const load = async () => {
      try {
        const list = await playersApi.getSuspensions(controller.signal);
        if (!mounted) return;
        setRows(list.filter((row) => row.eligibleForReinstatement));
      } catch {
        // Not staff, offline, or aborted — stay hidden.
      }
    };

    load();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [eligible, dismissed, excluded]);

  // Sign-out resets everything so the next account gets its own check
  // (the snooze key is cleared by AuthContext).
  useEffect(() => {
    if (isAuthenticated) return;
    setRows([]);
    setDismissed(false);
    setError(null);
  }, [isAuthenticated]);

  const isOpen = eligible && !dismissed && !excluded && !announcementOpen && !profileSetupOpen && rows.length > 0;

  useEffect(() => {
    if (!isOpen) return;
    dialogRef.current?.querySelector<HTMLElement>('h2')?.focus();
  }, [isOpen]);

  const reinstate = useCallback(async (playerIds: string[]) => {
    setError(null);
    setWorking((prev) => {
      const next = new Set(prev);
      playerIds.forEach((id) => next.add(id));
      return next;
    });
    const results = await Promise.allSettled(playerIds.map((id) => playersApi.reinstate(id)));
    const done = new Set<string>();
    let firstError: string | null = null;
    results.forEach((result, index) => {
      const playerId = playerIds[index];
      if (result.status === 'fulfilled' && playerId) {
        done.add(playerId);
      } else if (result.status === 'rejected' && !firstError) {
        firstError = result.reason instanceof Error ? result.reason.message : t('common.error');
      }
    });
    setRows((prev) => prev.filter((row) => !done.has(row.playerId)));
    setWorking((prev) => {
      const next = new Set(prev);
      playerIds.forEach((id) => next.delete(id));
      return next;
    });
    if (firstError) setError(firstError);
  }, [t]);

  const handleSnooze = () => {
    writeSnoozed();
    setDismissed(true);
  };

  if (!isOpen) return null;

  const anyWorking = working.size > 0;

  const reasonText = (row: SuspensionRow): string => {
    if (row.eligibleReason === 'date' && row.suspension.until) {
      return t('admin.suspensions.datePassed', { date: formatShortDate(row.suspension.until) });
    }
    return t('admin.suspensions.showsServed', {
      served: row.showsServed,
      required: row.suspension.showsRequired ?? row.showsServed,
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !anyWorking) handleSnooze();
  };

  return (
    <div
      className="suspension-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="suspension-modal-title"
      ref={dialogRef}
      onKeyDown={onKeyDown}
    >
      <div className="suspension-modal">
        <h2 id="suspension-modal-title" tabIndex={-1}>{t('suspensionsModal.title')}</h2>
        <p className="suspension-modal-subtitle">{t('suspensionsModal.subtitle')}</p>

        <ul className="suspension-modal-list">
          {rows.map((row) => {
            const busy = working.has(row.playerId);
            return (
              <li key={row.playerId} className="suspension-modal-row">
                <div className="suspension-modal-player">
                  {row.imageUrl ? (
                    <img className="suspension-modal-avatar" src={row.imageUrl} alt="" />
                  ) : (
                    <span className="suspension-modal-avatar suspension-modal-avatar--placeholder" aria-hidden="true">
                      {row.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="suspension-modal-player-text">
                    <span className="suspension-modal-wrestler">{row.currentWrestler}</span>
                    <span className="suspension-modal-name">{row.name}</span>
                    <span className="suspension-modal-reason">{reasonText(row)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-primary suspension-modal-reinstate"
                  onClick={() => { void reinstate([row.playerId]); }}
                  disabled={busy}
                  aria-busy={busy}
                  aria-label={`${t('suspensionsModal.reinstate')} — ${row.name}`}
                >
                  {busy ? t('suspensionsModal.working') : t('suspensionsModal.reinstate')}
                </button>
              </li>
            );
          })}
        </ul>

        {error && (
          <div className="error-message" role="alert">{error}</div>
        )}

        <div className="suspension-modal-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => { void reinstate(rows.map((row) => row.playerId)); }}
            disabled={anyWorking}
            aria-busy={anyWorking}
          >
            {anyWorking ? t('suspensionsModal.working') : t('suspensionsModal.reinstateAll')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleSnooze}
            disabled={anyWorking}
          >
            {t('suspensionsModal.remindLater')}
          </button>
        </div>
      </div>
    </div>
  );
}
