import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Swords, UserRoundPen } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePresence } from '../../contexts/PresenceContext';
import { useSignupBlock } from '../../hooks/useSignupBlock';
import { matchmakingApi } from '../../services/api/matchmaking.api';
import { matchTypesApi } from '../../services/api/matchTypes.api';
import { stipulationsApi } from '../../services/api/stipulations.api';
import type { MatchType, Stipulation } from '../../types';
import type {
  MatchInvitation,
  MatchmakingPreferences,
  OnlinePlayer,
  QueueEntry,
} from '../../types/matchmaking';
import { refusalOr } from '../../utils/discipline';
import { isNeedsWrestler } from '../../utils/needsWrestler';
import SuspensionNotice from '../discipline/SuspensionNotice';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Select from '../ui/Select';
import InvitationCard from './InvitationCard';
import { useVisiblePolling } from './useVisiblePolling';
import '../MeForms.css';
import './FindMatchPage.css';

type QueueStatus = 'idle' | 'queued' | 'matched';

const POLL_INTERVAL_MS = 5000;

export default function FindMatchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isWrestler, playerId, currentWrestler } = useAuth();
  const { presenceEnabled, enablePresence, disablePresence } = usePresence();
  const signupBlock = useSignupBlock();

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
  const [matchTypes, setMatchTypes] = useState<MatchType[]>([]);
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [justQueued, setJustQueued] = useState<boolean>(false);

  // Fetch available match types and stipulations for the preference dropdowns.
  useEffect(() => {
    let cancelled = false;
    const loadConfig = async (): Promise<void> => {
      try {
        const [mt, st] = await Promise.all([matchTypesApi.getAll(), stipulationsApi.getAll()]);
        if (cancelled) return;
        setMatchTypes(mt);
        setStipulations(st);
      } catch (err) {
        console.error('[FindMatchPage] failed to load match config', err);
      }
    };
    void loadConfig();
    return () => { cancelled = true; };
  }, []);

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

  // The server refuses matchmaking for a player with no wrestler name. Null
  // means the name is not known here, not that the player has none.
  const needsWrestlerName = currentWrestler !== null && isNeedsWrestler(currentWrestler);

  // Poll while presence is enabled.
  useVisiblePolling(
    fetchAll,
    POLL_INTERVAL_MS,
    presenceEnabled && isWrestler && Boolean(playerId) && !needsWrestlerName,
  );

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
        setJustQueued(true);
        setTimeout(() => setJustQueued(false), 4000);
      }
      // Refresh so the new queue state is reflected immediately.
      void fetchAll();
    } catch (err) {
      console.error('[FindMatchPage] joinQueue failed', err);
      setError(refusalOr(err, t('findMatch.queue.joinError')));
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
  const stipulationNameById = useMemo(
    () => new Map(stipulations.map((s) => [s.stipulationId, s.name])),
    [stipulations]
  );
  const queueEntryByPlayerId = useMemo(
    () => new Map(queueEntries.map((entry) => [entry.playerId, entry])),
    [queueEntries]
  );
  const visibleQueueEntries = useMemo(() => {
    if (!playerId) return queueEntries;
    return [...queueEntries].sort((a, b) => {
      if (a.playerId === playerId) return -1;
      if (b.playerId === playerId) return 1;
      return a.joinedAt.localeCompare(b.joinedAt);
    });
  }, [queueEntries, playerId]);

  // Gate: must be a wrestler with a profile
  if (!isWrestler || !playerId) {
    return (
      <div className="find-match">
        <PageHeader title={t('findMatch.title')} subtitle={t('findMatch.subtitle')} />
        <EmptyState icon={<Swords aria-hidden="true" size={32} />} title={t('findMatch.needsWrestler')} />
      </div>
    );
  }

  if (needsWrestlerName) {
    return (
      <div className="find-match">
        <PageHeader title={t('findMatch.title')} subtitle={t('findMatch.subtitle')} />
        <EmptyState
          icon={<UserRoundPen aria-hidden="true" size={32} />}
          title={t('me.matchmaking.needsNameTitle')}
          description={t('me.matchmaking.needsNameBody')}
          actionLabel={t('me.matchmaking.needsNameAction')}
          onAction={() => navigate('/profile', { state: { editProfile: true } })}
        />
      </div>
    );
  }

  const disabledByPresence = !presenceEnabled;
  const visibleOnlinePlayers = onlinePlayers.filter(
    (p) => p.playerId !== playerId
  );
  const preferencesLocked = disabledByPresence || queueStatus === 'queued';
  const anyOption = { value: '', label: t('findMatch.preferences.any') };

  const renderPreferenceBadges = (format?: string, stipulationName?: string) =>
    (format || stipulationName) && (
      <div className="match-row__prefs">
        {format && <Badge tone="violet">{format}</Badge>}
        {stipulationName && <Badge tone="violet">{stipulationName}</Badge>}
      </div>
    );

  return (
    <div className="find-match">
      <PageHeader
        title={t('findMatch.title')}
        subtitle={t('findMatch.subtitle')}
        actions={
          <div className="find-match__presence">
            <Badge tone={presenceEnabled ? 'live' : 'neutral'}>
              {presenceEnabled ? t('findMatch.appearOnline.on') : t('findMatch.appearOnline.off')}
            </Badge>
            <Button
              variant={presenceEnabled ? 'secondary' : 'primary'}
              loading={presenceBusy}
              disabled={signupBlock.blocked && !presenceEnabled}
              onClick={presenceEnabled ? handleDisablePresence : handleEnablePresence}
            >
              {presenceEnabled ? t('me.matchmaking.goOffline') : t('me.matchmaking.goOnline')}
            </Button>
          </div>
        }
      />

      {signupBlock.until && <SuspensionNotice until={signupBlock.until} />}
      {error && <p className="me-alert me-alert--error" role="alert">{error}</p>}

      {incomingInvitations.length > 0 && (
        <section className="find-match__section" aria-labelledby="find-match-incoming">
          <h2 className="find-match__heading" id="find-match-incoming">{t('findMatch.invitations.incoming')}</h2>
          <Card padding="none">
            <ul className="match-list">
              {incomingInvitations.map((inv) => (
                <InvitationCard
                  key={inv.invitationId}
                  invitation={inv}
                  direction="incoming"
                  onAccept={handleAccept}
                  onDecline={handleDecline}
                  onExpire={handleInvitationExpired}
                  acceptDisabled={signupBlock.blocked}
                />
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section className="find-match__section" aria-labelledby="find-match-queue">
        <h2 className="find-match__heading" id="find-match-queue">{t('findMatch.queue.title')}</h2>
        <Card>
          <div className="find-match__preferences">
            <div className="me-field">
              <span className="me-field__label">{t('findMatch.preferences.matchFormat')}</span>
              <Select
                label={t('findMatch.preferences.matchFormat')}
                value={preferences.matchFormat ?? ''}
                disabled={preferencesLocked}
                onValueChange={(value) =>
                  setPreferences((prev) => ({ ...prev, matchFormat: value || undefined }))
                }
                options={[anyOption, ...matchTypes.map((mt) => ({ value: mt.name, label: mt.name }))]}
              />
            </div>
            <div className="me-field">
              <span className="me-field__label">{t('findMatch.preferences.stipulation')}</span>
              <Select
                label={t('findMatch.preferences.stipulation')}
                value={preferences.stipulationId ?? ''}
                disabled={preferencesLocked}
                onValueChange={(value) =>
                  setPreferences((prev) => ({ ...prev, stipulationId: value || undefined }))
                }
                options={[anyOption, ...stipulations.map((s) => ({ value: s.stipulationId, label: s.name }))]}
              />
            </div>
          </div>

          <p className="me-hint find-match__notice">{t('findMatch.queue.championshipNotice')}</p>

          {disabledByPresence && (
            <p className="me-hint find-match__notice">{t('findMatch.appearOnline.appearFirstHint')}</p>
          )}

          {queueStatus === 'idle' && (
            <Button fullWidth disabled={disabledByPresence || loading || signupBlock.blocked} onClick={handleJoinQueue}>
              {t('findMatch.queue.join')}
            </Button>
          )}
          {queueStatus === 'queued' && (
            <div className="find-match__queue-state" role="status">
              <span>{justQueued ? t('findMatch.queue.queued') : t('findMatch.queue.searching')}</span>
              <Button variant="secondary" disabled={loading} onClick={handleLeaveQueue}>
                {t('findMatch.queue.leave')}
              </Button>
            </div>
          )}
          {queueStatus === 'matched' && (
            <div className="find-match__queue-state" role="status">
              <span>{t('findMatch.queue.matched')}</span>
              {matchedMatchId && (
                <Button onClick={() => navigate('/matches', { state: { matchId: matchedMatchId } })}>
                  {t('findMatch.queue.matched')}
                </Button>
              )}
            </div>
          )}
        </Card>
      </section>

      <div className="find-match__columns">
        <section className="find-match__section" aria-labelledby="find-match-in-queue">
          <h2 className="find-match__heading" id="find-match-in-queue">{t('me.matchmaking.queueHeading')}</h2>
          <Card padding="none">
            {visibleQueueEntries.length === 0 ? (
              <p className="find-match__empty">{t('me.matchmaking.queueEmpty')}</p>
            ) : (
              <ul className="match-list">
                {visibleQueueEntries.map((entry) => {
                  const isCurrentPlayer = entry.playerId === playerId;
                  const stipId = entry.preferences?.stipulationId;
                  return (
                    <li key={entry.playerId} className="match-row">
                      <Avatar src={entry.imageUrl} name={entry.currentWrestler || entry.name} size="md" />
                      <div className="match-row__text">
                        <p className="match-row__name">{entry.name}</p>
                        <p className="match-row__meta">{entry.currentWrestler}</p>
                        {renderPreferenceBadges(
                          entry.preferences?.matchFormat,
                          stipId ? stipulationNameById.get(stipId) : undefined,
                        )}
                      </div>
                      {isCurrentPlayer && <Badge tone="primary">{t('findMatch.queue.you')}</Badge>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>

        <section className="find-match__section" aria-labelledby="find-match-online">
          <h2 className="find-match__heading" id="find-match-online">{t('findMatch.online.title')}</h2>
          <Card padding="none">
            {visibleOnlinePlayers.length === 0 ? (
              <p className="find-match__empty">{t('findMatch.online.empty')}</p>
            ) : (
              <ul className="match-list">
                {visibleOnlinePlayers.map((player) => {
                  const alreadyInvited = outgoingTargetIds.has(player.playerId);
                  const queueEntry = queueEntryByPlayerId.get(player.playerId);
                  const stipId = queueEntry?.preferences?.stipulationId;
                  return (
                    <li key={player.playerId} className="match-row">
                      <Avatar src={player.imageUrl} name={player.currentWrestler || player.name} size="md" />
                      <div className="match-row__text">
                        <p className="match-row__name">{player.name}</p>
                        <p className="match-row__meta">{player.currentWrestler}</p>
                        {player.inQueue && renderPreferenceBadges(
                          queueEntry?.preferences?.matchFormat,
                          stipId ? stipulationNameById.get(stipId) : undefined,
                        )}
                      </div>
                      <div className="match-row__actions">
                        {player.inQueue && <Badge tone="win">{t('findMatch.online.inQueue')}</Badge>}
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={disabledByPresence || alreadyInvited || signupBlock.blocked}
                          onClick={() => void handleInvite(player.playerId)}
                        >
                          {alreadyInvited ? t('findMatch.online.alreadyInvited') : t('findMatch.online.invite')}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>
      </div>

      <section className="find-match__section" aria-labelledby="find-match-outgoing">
        <h2 className="find-match__heading" id="find-match-outgoing">{t('findMatch.invitations.outgoing')}</h2>
        <Card padding="none">
          {outgoingInvitations.length === 0 ? (
            <p className="find-match__empty">{t('findMatch.invitations.noneOutgoing')}</p>
          ) : (
            <ul className="match-list">
              {outgoingInvitations.map((inv) => (
                <InvitationCard
                  key={inv.invitationId}
                  invitation={inv}
                  direction="outgoing"
                  onExpire={handleInvitationExpired}
                />
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
