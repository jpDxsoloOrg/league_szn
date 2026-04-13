import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePresence } from '../../contexts/PresenceContext';
import { matchmakingApi } from '../../services/api/matchmaking.api';
import { stipulationsApi } from '../../services/api/stipulations.api';
import type { MatchInvitation, QueueEntry } from '../../types/matchmaking';
import './FindMatchWidget.css';

const POLL_INTERVAL_MS = 15_000;

const formatJoinedAgo = (
  joinedAt: string,
  t: (key: string, options?: Record<string, unknown>) => string
): string => {
  const diffMs = Date.now() - new Date(joinedAt).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 1) return t('findMatch.widget.ago.justNow');
  if (minutes < 60) return t('findMatch.widget.ago.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  return t('findMatch.widget.ago.hours', { count: hours });
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?';
};

const FindMatchWidget: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isWrestler, playerId } = useAuth();
  const { presenceEnabled, enablePresence } = usePresence();

  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [stipulationNameById, setStipulationNameById] = useState<Map<string, string>>(
    new Map()
  );
  const [incomingInvitations, setIncomingInvitations] = useState<MatchInvitation[]>([]);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [challengingId, setChallengingId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [joiningQueue, setJoiningQueue] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Tick state to refresh "joined Xm ago" timestamps without refetching.
  const [, setNowTick] = useState<number>(0);
  useEffect(() => {
    const id = window.setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Load stipulation names once so we can render preference chips.
  useEffect(() => {
    let cancelled = false;
    stipulationsApi
      .getAll()
      .then((stips) => {
        if (cancelled) return;
        setStipulationNameById(new Map(stips.map((s) => [s.stipulationId, s.name])));
      })
      .catch((err) => {
        console.error('[FindMatchWidget] failed to load stipulations', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchData = useCallback(async (): Promise<void> => {
    try {
      const [queueData, invitationsData] = await Promise.all([
        matchmakingApi.getQueue(),
        matchmakingApi.getInvitations(),
      ]);
      setQueue(queueData);
      const nowIso = new Date().toISOString();
      setIncomingInvitations(
        invitationsData.incoming.filter(
          (inv) => inv.status === 'pending' && inv.expiresAt > nowIso
        )
      );
      setInvitedIds(
        new Set(
          invitationsData.outgoing
            .filter((inv) => inv.status === 'pending')
            .map((inv) => inv.toPlayerId)
        )
      );
      setError(null);
    } catch (err) {
      console.error('[FindMatchWidget] failed to load queue', err);
      setError('load-failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDataRef = useRef(fetchData);
  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);

  useEffect(() => {
    if (!isWrestler || !playerId) {
      return;
    }

    let cancelled = false;
    const run = (): void => {
      if (cancelled) return;
      void fetchDataRef.current();
    };

    run();
    const interval = window.setInterval(run, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isWrestler, playerId]);

  const handleChallenge = useCallback(
    async (targetId: string): Promise<void> => {
      if (challengingId) return;
      setChallengingId(targetId);
      try {
        await matchmakingApi.createInvitation(targetId, {});
        setInvitedIds((prev) => {
          const next = new Set(prev);
          next.add(targetId);
          return next;
        });
      } catch (err) {
        console.error('[FindMatchWidget] challenge failed', err);
      } finally {
        setChallengingId(null);
      }
    },
    [challengingId]
  );

  const handleAcceptInvitation = useCallback(
    async (invitationId: string): Promise<void> => {
      if (respondingId) return;
      setRespondingId(invitationId);
      try {
        const result = await matchmakingApi.acceptInvitation(invitationId);
        setIncomingInvitations((prev) =>
          prev.filter((inv) => inv.invitationId !== invitationId)
        );
        navigate('/matches', { state: { matchId: result.matchId } });
      } catch (err) {
        console.error('[FindMatchWidget] acceptInvitation failed', err);
      } finally {
        setRespondingId(null);
      }
    },
    [respondingId, navigate]
  );

  const handleDeclineInvitation = useCallback(
    async (invitationId: string): Promise<void> => {
      if (respondingId) return;
      setRespondingId(invitationId);
      try {
        await matchmakingApi.declineInvitation(invitationId);
        setIncomingInvitations((prev) =>
          prev.filter((inv) => inv.invitationId !== invitationId)
        );
      } catch (err) {
        console.error('[FindMatchWidget] declineInvitation failed', err);
      } finally {
        setRespondingId(null);
      }
    },
    [respondingId]
  );

  const isSelfInQueue = useMemo(
    () => queue.some((entry) => entry.playerId === playerId),
    [queue, playerId]
  );

  const handleJoinOrLeaveQueue = useCallback(async (): Promise<void> => {
    if (joiningQueue) return;
    setJoiningQueue(true);
    try {
      if (isSelfInQueue) {
        await matchmakingApi.leaveQueue();
      } else {
        if (!presenceEnabled) {
          await enablePresence();
        }
        await matchmakingApi.joinQueue({});
      }
      await fetchData();
    } catch (err) {
      console.error('[FindMatchWidget] join/leave queue failed', err);
    } finally {
      setJoiningQueue(false);
    }
  }, [joiningQueue, isSelfInQueue, presenceEnabled, enablePresence, fetchData]);

  // Sort queue entries with self on top so the user sees themselves immediately.
  const sortedQueue = useMemo(() => {
    return [...queue].sort((a, b) => {
      if (a.playerId === playerId) return -1;
      if (b.playerId === playerId) return 1;
      return a.joinedAt.localeCompare(b.joinedAt);
    });
  }, [queue, playerId]);

  if (!isWrestler || !playerId) {
    return null;
  }

  return (
    <section className="fm-widget" aria-label={t('findMatch.widget.title')}>
      <header className="fm-widget-header">
        <h3 className="fm-widget-title">{t('findMatch.widget.title')}</h3>
        <div className="fm-widget-online-count">
          <span
            className={`fm-widget-status-dot ${
              queue.length > 0
                ? 'fm-widget-status-dot--online'
                : 'fm-widget-status-dot--offline'
            }`}
            aria-hidden="true"
          />
          <span>
            {t('findMatch.widget.lookingCount', { count: queue.length })}
          </span>
        </div>
      </header>

      {incomingInvitations.length > 0 && (
        <>
          <div className="fm-widget-section-label">
            <span>{t('findMatch.widget.incomingHeader')}</span>
            <span className="fm-widget-section-count fm-widget-section-count--hot">
              {incomingInvitations.length}
            </span>
          </div>
          <ul className="fm-widget-invite-list">
            {incomingInvitations.map((inv) => {
              const responding = respondingId === inv.invitationId;
              return (
                <li key={inv.invitationId} className="fm-widget-invite-card">
                  <div className="fm-widget-avatar" aria-hidden="true">
                    {inv.from.imageUrl ? (
                      <img src={inv.from.imageUrl} alt="" />
                    ) : (
                      <span>
                        {getInitials(inv.from.currentWrestler || inv.from.name)}
                      </span>
                    )}
                  </div>
                  <div className="fm-widget-queue-meta">
                    <div className="fm-widget-wrestler-name">
                      {inv.from.currentWrestler}
                    </div>
                    <div className="fm-widget-player-name">{inv.from.name}</div>
                  </div>
                  <div className="fm-widget-invite-actions">
                    <button
                      type="button"
                      className="fm-widget-accept"
                      disabled={responding}
                      onClick={() => {
                        void handleAcceptInvitation(inv.invitationId);
                      }}
                    >
                      {t('findMatch.invitations.accept')}
                    </button>
                    <button
                      type="button"
                      className="fm-widget-decline"
                      disabled={responding}
                      onClick={() => {
                        void handleDeclineInvitation(inv.invitationId);
                      }}
                    >
                      {t('findMatch.invitations.decline')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="fm-widget-section-label">
        <span>{t('findMatch.widget.lookingHeader')}</span>
        <span className="fm-widget-section-count">{sortedQueue.length}</span>
      </div>

      {error && !loading && (
        <div className="fm-widget-error">{t('findMatch.widget.loadFailed')}</div>
      )}

      {loading ? (
        <div className="fm-widget-skeleton" aria-hidden="true">
          <div className="fm-widget-skeleton-row" />
          <div className="fm-widget-skeleton-row" />
          <div className="fm-widget-skeleton-row" />
        </div>
      ) : sortedQueue.length === 0 ? (
        <div className="fm-widget-empty">
          <p className="fm-widget-empty-text">{t('findMatch.widget.empty')}</p>
          <p className="fm-widget-empty-hint">{t('findMatch.widget.emptyHint')}</p>
        </div>
      ) : (
        <ul className="fm-widget-queue-list">
          {sortedQueue.map((entry) => {
            const isSelf = entry.playerId === playerId;
            const fmt = entry.preferences?.matchFormat;
            const stipName = entry.preferences?.stipulationId
              ? stipulationNameById.get(entry.preferences.stipulationId)
              : undefined;
            const invited = invitedIds.has(entry.playerId);
            const sending = challengingId === entry.playerId;
            return (
              <li
                key={entry.playerId}
                className={`fm-widget-queue-card ${
                  isSelf ? 'fm-widget-queue-card--self' : ''
                }`}
              >
                <div className="fm-widget-avatar" aria-hidden="true">
                  {entry.imageUrl ? (
                    <img src={entry.imageUrl} alt="" />
                  ) : (
                    <span>{getInitials(entry.currentWrestler || entry.name)}</span>
                  )}
                </div>
                <div className="fm-widget-queue-meta">
                  <div className="fm-widget-wrestler-name">
                    {entry.currentWrestler}
                    {isSelf && (
                      <span className="fm-widget-self-badge">
                        {t('findMatch.widget.you')}
                      </span>
                    )}
                  </div>
                  <div className="fm-widget-player-name">{entry.name}</div>
                  {(fmt || stipName) && (
                    <div className="fm-widget-prefs">
                      {fmt && <span className="fm-widget-pref-chip">{fmt}</span>}
                      {stipName && (
                        <span className="fm-widget-pref-chip">{stipName}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="fm-widget-queue-action">
                  {isSelf ? (
                    <span className="fm-widget-joined-ago">
                      {t('findMatch.widget.joinedAgo', {
                        ago: formatJoinedAgo(entry.joinedAt, t),
                      })}
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="fm-widget-challenge"
                        onClick={() => {
                          void handleChallenge(entry.playerId);
                        }}
                        disabled={invited || sending}
                      >
                        {invited
                          ? t('findMatch.widget.challenged')
                          : sending
                            ? t('findMatch.widget.challenging')
                            : t('findMatch.widget.challenge')}
                      </button>
                      <span className="fm-widget-joined-ago">
                        {t('findMatch.widget.joinedAgo', {
                          ago: formatJoinedAgo(entry.joinedAt, t),
                        })}
                      </span>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        className="fm-widget-cta"
        onClick={() => {
          void handleJoinOrLeaveQueue();
        }}
        disabled={joiningQueue}
      >
        {isSelfInQueue
          ? t('findMatch.widget.leaveQueue')
          : t('findMatch.widget.joinQueue')}
      </button>
      <p className="fm-widget-cta-subtitle">
        {isSelfInQueue
          ? t('findMatch.widget.inQueueLabel')
          : t('findMatch.widget.joinQueueSubtitle')}
      </p>
    </section>
  );
};

export default FindMatchWidget;
