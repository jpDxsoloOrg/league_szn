import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { usePresence } from '../../contexts/PresenceContext';
import { matchmakingApi } from '../../services/api/matchmaking.api';
import type {
  MatchInvitation,
  MatchmakingPreferences,
  OnlinePlayer,
  QueueEntry,
} from '../../types/matchmaking';
import InvitationCard from './InvitationCard';
import './FindMatchPage.css';

type QueueStatus = 'idle' | 'queued' | 'matched';

const POLL_INTERVAL_MS = 5000;

export default function FindMatchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isWrestler, playerId } = useAuth();
  const { presenceEnabled, enablePresence, disablePresence } = usePresence();

  const [queueStatus, setQueueStatus] = useState<QueueStatus>('idle');
  const [matchedMatchId, setMatchedMatchId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<MatchmakingPreferences>({});
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayer[]>([]);
  const [incomingInvitations, setIncomingInvitations] = useState<MatchInvitation[]>([]);
  const [outgoingInvitations, setOutgoingInvitations] = useState<MatchInvitation[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [presenceBusy, setPresenceBusy] = useState<boolean>(false);

  // Ref so the poller always sees current status without resubscribing.
  const queueStatusRef = useRef<QueueStatus>(queueStatus);
  useEffect(() => {
    queueStatusRef.current = queueStatus;
  }, [queueStatus]);

  const fetchAll = useCallback(async (): Promise<void> => {
    try {
      const [queue, online, invites] = await Promise.all([
        matchmakingApi.getQueue(),
        matchmakingApi.getOnline(),
        matchmakingApi.getInvitations(),
      ]);
      setQueueEntries(queue);
      setOnlinePlayers(online);
      setIncomingInvitations(invites.incoming);
      setOutgoingInvitations(invites.outgoing);

      // Sync queueStatus from server: if we're no longer in the queue
      // but we thought we were, drop back to idle.
      if (playerId && queueStatusRef.current === 'queued') {
        const stillQueued = queue.some((q) => q.playerId === playerId);
        if (!stillQueued) {
          setQueueStatus('idle');
        }
      }
    } catch (err) {
      console.error('[FindMatchPage] fetchAll failed', err);
    }
  }, [playerId]);

  // Poll while presence is enabled.
  useEffect(() => {
    if (!presenceEnabled || !isWrestler || !playerId) {
      return;
    }

    let cancelled = false;

    const tick = (): void => {
      if (cancelled) return;
      void fetchAll();
    };

    tick();
    const intervalId = window.setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [presenceEnabled, isWrestler, playerId, fetchAll]);

  const handleEnablePresence = useCallback(async (): Promise<void> => {
    setPresenceBusy(true);
    setError(null);
    try {
      await enablePresence();
    } catch (err) {
      console.error('[FindMatchPage] enablePresence failed', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPresenceBusy(false);
    }
  }, [enablePresence]);

  const handleDisablePresence = useCallback(async (): Promise<void> => {
    setPresenceBusy(true);
    setError(null);
    try {
      await disablePresence();
      setQueueStatus('idle');
      setMatchedMatchId(null);
      setQueueEntries([]);
      setOnlinePlayers([]);
      setIncomingInvitations([]);
      setOutgoingInvitations([]);
    } catch (err) {
      console.error('[FindMatchPage] disablePresence failed', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPresenceBusy(false);
    }
  }, [disablePresence]);

  const handleJoinQueue = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await matchmakingApi.joinQueue(preferences);
      if (result.status === 'matched') {
        setQueueStatus('matched');
        setMatchedMatchId(result.matchId);
      } else {
        setQueueStatus('queued');
      }
      // Refresh so the new queue state is reflected immediately.
      void fetchAll();
    } catch (err) {
      console.error('[FindMatchPage] joinQueue failed', err);
      setError(t('findMatch.queue.joinError'));
    } finally {
      setLoading(false);
    }
  }, [preferences, fetchAll, t]);

  const handleLeaveQueue = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await matchmakingApi.leaveQueue();
      setQueueStatus('idle');
      void fetchAll();
    } catch (err) {
      console.error('[FindMatchPage] leaveQueue failed', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [fetchAll]);

  const handleInvite = useCallback(
    async (targetPlayerId: string): Promise<void> => {
      setError(null);
      try {
        await matchmakingApi.createInvitation(targetPlayerId, preferences);
        // Refetch so we get the hydrated invitation (with from/to player
        // summaries) rather than the raw row returned by the create endpoint.
        void fetchAll();
      } catch (err) {
        console.error('[FindMatchPage] createInvitation failed', err);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [preferences, fetchAll]
  );

  const handleAccept = useCallback(
    async (invitationId: string): Promise<void> => {
      setError(null);
      try {
        const result = await matchmakingApi.acceptInvitation(invitationId);
        setIncomingInvitations((prev) =>
          prev.filter((i) => i.invitationId !== invitationId)
        );
        navigate(`/matches`, { state: { matchId: result.matchId } });
      } catch (err) {
        console.error('[FindMatchPage] acceptInvitation failed', err);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [navigate]
  );

  const handleDecline = useCallback(
    async (invitationId: string): Promise<void> => {
      setError(null);
      try {
        await matchmakingApi.declineInvitation(invitationId);
        setIncomingInvitations((prev) =>
          prev.filter((i) => i.invitationId !== invitationId)
        );
      } catch (err) {
        console.error('[FindMatchPage] declineInvitation failed', err);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    []
  );

  const handleInvitationExpired = useCallback((invitationId: string): void => {
    setIncomingInvitations((prev) =>
      prev.filter((i) => i.invitationId !== invitationId)
    );
    setOutgoingInvitations((prev) =>
      prev.filter((i) => i.invitationId !== invitationId)
    );
  }, []);

  const outgoingTargetIds = useMemo(
    () => new Set(outgoingInvitations.map((i) => i.toPlayerId)),
    [outgoingInvitations]
  );

  // Gate: must be a wrestler with a profile
  if (!isWrestler || !playerId) {
    return (
      <div className="find-match-page">
        <header className="find-match-header">
          <h1>{t('findMatch.title')}</h1>
          <p className="find-match-subtitle">{t('findMatch.subtitle')}</p>
        </header>
        <div className="find-match-notice">{t('findMatch.needsWrestler')}</div>
      </div>
    );
  }

  const disabledByPresence = !presenceEnabled;
  const visibleQueueEntries = queueEntries.filter(
    (q) => q.playerId !== playerId
  );
  const visibleOnlinePlayers = onlinePlayers.filter(
    (p) => p.playerId !== playerId
  );

  return (
    <div className="find-match-page">
      <header className="find-match-header">
        <h1>{t('findMatch.title')}</h1>
        <p className="find-match-subtitle">{t('findMatch.subtitle')}</p>
      </header>

      {error && <div className="find-match-error">{error}</div>}

      {/* Appear online toggle */}
      <section className="find-match-section appear-online-section">
        <div className="appear-online-row">
          <div>
            <h2>{t('findMatch.appearOnline.title')}</h2>
            <p className="section-description">
              {t('findMatch.appearOnline.description')}
            </p>
          </div>
          <div className="appear-online-control">
            <span
              className={`presence-dot ${presenceEnabled ? 'on' : 'off'}`}
              aria-hidden="true"
            />
            <span className="presence-label">
              {presenceEnabled
                ? t('findMatch.appearOnline.on')
                : t('findMatch.appearOnline.off')}
            </span>
            <button
              type="button"
              className="btn-presence"
              disabled={presenceBusy}
              onClick={
                presenceEnabled ? handleDisablePresence : handleEnablePresence
              }
            >
              {presenceEnabled
                ? t('findMatch.appearOnline.off')
                : t('findMatch.appearOnline.on')}
            </button>
          </div>
        </div>
      </section>

      {/* Queue section */}
      <section
        className={`find-match-section ${
          disabledByPresence ? 'section-disabled' : ''
        }`}
      >
        <h2>{t('findMatch.queue.title')}</h2>
        {disabledByPresence && (
          <p className="section-hint">
            {t('findMatch.appearOnline.appearFirstHint')}
          </p>
        )}

        <div className="preferences-row">
          <label className="preferences-field">
            <span>{t('findMatch.preferences.matchFormat')}</span>
            <input
              type="text"
              value={preferences.matchFormat ?? ''}
              placeholder={t('findMatch.preferences.any')}
              disabled={disabledByPresence}
              onChange={(e) =>
                setPreferences((prev) => ({
                  ...prev,
                  matchFormat: e.target.value || undefined,
                }))
              }
            />
          </label>
          <label className="preferences-field">
            <span>{t('findMatch.preferences.stipulation')}</span>
            <input
              type="text"
              value={preferences.stipulationId ?? ''}
              placeholder={t('findMatch.preferences.any')}
              disabled={disabledByPresence}
              onChange={(e) =>
                setPreferences((prev) => ({
                  ...prev,
                  stipulationId: e.target.value || undefined,
                }))
              }
            />
          </label>
        </div>

        <p className="section-notice">{t('findMatch.queue.championshipNotice')}</p>

        <div className="queue-controls">
          {queueStatus === 'idle' && (
            <button
              type="button"
              className="btn-primary"
              disabled={disabledByPresence || loading}
              onClick={handleJoinQueue}
            >
              {t('findMatch.queue.join')}
            </button>
          )}
          {queueStatus === 'queued' && (
            <div className="queue-searching">
              <span>{t('findMatch.queue.searching')}</span>
              <button
                type="button"
                className="btn-secondary"
                disabled={loading}
                onClick={handleLeaveQueue}
              >
                {t('findMatch.queue.leave')}
              </button>
            </div>
          )}
          {queueStatus === 'matched' && (
            <div className="queue-matched">
              <span>{t('findMatch.queue.matched')}</span>
              {matchedMatchId && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() =>
                    navigate('/matches', {
                      state: { matchId: matchedMatchId },
                    })
                  }
                >
                  {t('findMatch.queue.matched')}
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Pending invitations */}
      <section
        className={`find-match-section ${
          disabledByPresence ? 'section-disabled' : ''
        }`}
      >
        <h2>{t('findMatch.invitations.title')}</h2>
        <div className="invitations-columns">
          <div className="invitations-column">
            <h3>{t('findMatch.invitations.incoming')}</h3>
            {incomingInvitations.length === 0 ? (
              <div className="empty-state">
                {t('findMatch.invitations.noneIncoming')}
              </div>
            ) : (
              <div className="invitations-list">
                {incomingInvitations.map((inv) => (
                  <InvitationCard
                    key={inv.invitationId}
                    invitation={inv}
                    direction="incoming"
                    onAccept={handleAccept}
                    onDecline={handleDecline}
                    onExpire={handleInvitationExpired}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="invitations-column">
            <h3>{t('findMatch.invitations.outgoing')}</h3>
            {outgoingInvitations.length === 0 ? (
              <div className="empty-state">
                {t('findMatch.invitations.noneOutgoing')}
              </div>
            ) : (
              <div className="invitations-list">
                {outgoingInvitations.map((inv) => (
                  <InvitationCard
                    key={inv.invitationId}
                    invitation={inv}
                    direction="outgoing"
                    onExpire={handleInvitationExpired}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Players ready right now (queue) */}
      <section
        className={`find-match-section ${
          disabledByPresence ? 'section-disabled' : ''
        }`}
      >
        <h2>{t('findMatch.online.inQueue')}</h2>
        {visibleQueueEntries.length === 0 ? (
          <div className="empty-state">{t('findMatch.online.empty')}</div>
        ) : (
          <ul className="player-list">
            {visibleQueueEntries.map((entry) => (
              <li key={entry.playerId} className="player-row">
                <div className="player-info">
                  <div className="player-name">{entry.name}</div>
                  <div className="player-wrestler">{entry.currentWrestler}</div>
                </div>
                <span className="badge in-queue">
                  {t('findMatch.online.inQueue')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Online players */}
      <section
        className={`find-match-section ${
          disabledByPresence ? 'section-disabled' : ''
        }`}
      >
        <h2>{t('findMatch.online.title')}</h2>
        {visibleOnlinePlayers.length === 0 ? (
          <div className="empty-state">{t('findMatch.online.empty')}</div>
        ) : (
          <ul className="player-list">
            {visibleOnlinePlayers.map((player) => {
              const alreadyInvited = outgoingTargetIds.has(player.playerId);
              return (
                <li key={player.playerId} className="player-row">
                  <div className="player-info">
                    <div className="player-name">{player.name}</div>
                    <div className="player-wrestler">
                      {player.currentWrestler}
                    </div>
                  </div>
                  {player.inQueue && (
                    <span className="badge in-queue">
                      {t('findMatch.online.inQueue')}
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={disabledByPresence || alreadyInvited}
                    onClick={() => void handleInvite(player.playerId)}
                  >
                    {alreadyInvited
                      ? t('findMatch.online.alreadyInvited')
                      : t('findMatch.online.invite')}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
