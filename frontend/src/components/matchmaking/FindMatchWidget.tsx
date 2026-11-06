import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePresence } from '../../contexts/PresenceContext';
import { matchmakingApi } from '../../services/api/matchmaking.api';
import { stipulationsApi } from '../../services/api/stipulations.api';
import type { MatchInvitation, QueueEntry } from '../../types/matchmaking';
import { isNeedsWrestler } from '../../utils/needsWrestler';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Skeleton from '../ui/Skeleton';
import { useVisiblePolling } from './useVisiblePolling';
import '../MeForms.css';
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

const FindMatchWidget: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isWrestler, playerId, currentWrestler } = useAuth();
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
  const [actionFailed, setActionFailed] = useState<boolean>(false);

  // Tick state to refresh "joined Xm ago" timestamps without refetching.
  const [, setNowTick] = useState<number>(0);
  useEffect(() => {
    const id = window.setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Load stipulation names once so we can render preference chips.
  useEffect(() => {
    let cancelled = false;
    const loadStipulations = async (): Promise<void> => {
      try {
        const stips = await stipulationsApi.getAll();
        if (cancelled) return;
        setStipulationNameById(new Map(stips.map((s) => [s.stipulationId, s.name])));
      } catch (err) {
        console.error('[FindMatchWidget] failed to load stipulations', err);
      }
    };
    void loadStipulations();
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

  // The server refuses matchmaking for a player with no wrestler name. Null
  // means the name is not known here, not that the player has none.
  const needsWrestlerName = currentWrestler !== null && isNeedsWrestler(currentWrestler);

  useVisiblePolling(
    fetchData,
    POLL_INTERVAL_MS,
    isWrestler && Boolean(playerId) && !needsWrestlerName,
  );

  const handleChallenge = useCallback(
    async (targetId: string): Promise<void> => {
      if (challengingId) return;
      setChallengingId(targetId);
      setActionFailed(false);
      try {
        await matchmakingApi.createInvitation(targetId, {});
        setInvitedIds((prev) => {
          const next = new Set(prev);
          next.add(targetId);
          return next;
        });
      } catch (err) {
        console.error('[FindMatchWidget] challenge failed', err);
        setActionFailed(true);
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
      setActionFailed(false);
      try {
        const result = await matchmakingApi.acceptInvitation(invitationId);
        setIncomingInvitations((prev) =>
          prev.filter((inv) => inv.invitationId !== invitationId)
        );
        navigate('/matches', { state: { matchId: result.matchId } });
      } catch (err) {
        console.error('[FindMatchWidget] acceptInvitation failed', err);
        setActionFailed(true);
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
      setActionFailed(false);
      try {
        await matchmakingApi.declineInvitation(invitationId);
        setIncomingInvitations((prev) =>
          prev.filter((inv) => inv.invitationId !== invitationId)
        );
      } catch (err) {
        console.error('[FindMatchWidget] declineInvitation failed', err);
        setActionFailed(true);
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
    setActionFailed(false);
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
      setActionFailed(true);
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

  if (needsWrestlerName) {
    return (
      <Card className="fm-widget" role="region" aria-label={t('findMatch.widget.title')}>
        <h3 className="fm-widget__title">{t('findMatch.widget.title')}</h3>
        <p className="fm-widget__hint">{t('me.matchmaking.needsNameBody')}</p>
        <Button fullWidth to="/profile">{t('me.matchmaking.needsNameAction')}</Button>
      </Card>
    );
  }

  return (
    <Card className="fm-widget" role="region" aria-label={t('findMatch.widget.title')}>
      <header className="fm-widget__header">
        <h3 className="fm-widget__title">{t('findMatch.widget.title')}</h3>
        <Badge tone={queue.length > 0 ? 'win' : 'neutral'}>
          {t('findMatch.widget.lookingCount', { count: queue.length })}
        </Badge>
      </header>

      {actionFailed && (
        <p className="me-alert me-alert--error" role="alert">{t('me.matchmaking.actionFailed')}</p>
      )}

      {incomingInvitations.length > 0 && (
        <>
          <h4 className="fm-widget__label">
            <span>{t('findMatch.widget.incomingHeader')}</span>
            <Badge tone="pink">{incomingInvitations.length}</Badge>
          </h4>
          <ul className="fm-widget__list">
            {incomingInvitations.map((inv) => {
              const responding = respondingId === inv.invitationId;
              return (
                <li key={inv.invitationId} className="fm-widget__row">
                  <Avatar src={inv.from.imageUrl} name={inv.from.currentWrestler || inv.from.name} size="sm" />
                  <div className="fm-widget__meta">
                    <p className="fm-widget__wrestler">{inv.from.currentWrestler}</p>
                    <p className="fm-widget__player">{inv.from.name}</p>
                  </div>
                  <div className="fm-widget__actions">
                    <Button
                      size="sm"
                      disabled={responding}
                      onClick={() => {
                        void handleAcceptInvitation(inv.invitationId);
                      }}
                    >
                      {t('findMatch.invitations.accept')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={responding}
                      onClick={() => {
                        void handleDeclineInvitation(inv.invitationId);
                      }}
                    >
                      {t('findMatch.invitations.decline')}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h4 className="fm-widget__label">
        <span>{t('findMatch.widget.lookingHeader')}</span>
      </h4>

      {error && !loading && (
        <p className="me-alert me-alert--error" role="alert">{t('findMatch.widget.loadFailed')}</p>
      )}

      {loading ? (
        <Skeleton variant="block" count={3} />
      ) : sortedQueue.length === 0 ? (
        <div className="fm-widget__empty">
          <p className="fm-widget__empty-text">{t('findMatch.widget.empty')}</p>
          <p className="fm-widget__hint">{t('findMatch.widget.emptyHint')}</p>
        </div>
      ) : (
        <ul className="fm-widget__list">
          {sortedQueue.map((entry) => {
            const isSelf = entry.playerId === playerId;
            const fmt = entry.preferences?.matchFormat;
            const stipName = entry.preferences?.stipulationId
              ? stipulationNameById.get(entry.preferences.stipulationId)
              : undefined;
            const invited = invitedIds.has(entry.playerId);
            const sending = challengingId === entry.playerId;
            return (
              <li key={entry.playerId} className="fm-widget__row">
                <Avatar src={entry.imageUrl} name={entry.currentWrestler || entry.name} size="sm" />
                <div className="fm-widget__meta">
                  <p className="fm-widget__wrestler">
                    {entry.currentWrestler}
                    {isSelf && <Badge tone="primary">{t('findMatch.widget.you')}</Badge>}
                  </p>
                  <p className="fm-widget__player">
                    {entry.name}
                    {' · '}
                    {t('findMatch.widget.joinedAgo', { ago: formatJoinedAgo(entry.joinedAt, t) })}
                  </p>
                  {(fmt || stipName) && (
                    <div className="fm-widget__prefs">
                      {fmt && <Badge tone="violet">{fmt}</Badge>}
                      {stipName && <Badge tone="violet">{stipName}</Badge>}
                    </div>
                  )}
                </div>
                {!isSelf && (
                  <Button
                    size="sm"
                    variant="secondary"
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
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Button
        fullWidth
        variant={isSelfInQueue ? 'secondary' : 'primary'}
        onClick={() => {
          void handleJoinOrLeaveQueue();
        }}
        disabled={joiningQueue}
      >
        {isSelfInQueue ? t('findMatch.widget.leaveQueue') : t('findMatch.widget.joinQueue')}
      </Button>
      <p className="fm-widget__hint fm-widget__cta-note">
        {isSelfInQueue ? t('findMatch.widget.inQueueLabel') : t('findMatch.widget.joinQueueSubtitle')}
      </p>
    </Card>
  );
};

export default FindMatchWidget;
