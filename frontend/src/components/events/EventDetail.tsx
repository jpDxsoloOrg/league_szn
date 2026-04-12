import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { eventsApi, matchesApi, playersApi, tagTeamsApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import type {
  MatchDesignation,
  EventWithMatches,
  EventCheckIn as EventCheckInRow,
  EventCheckInStatus,
  EventCheckInSummary,
} from '../../types/event';
import type { Match, Player } from '../../types';
import type { TagTeam } from '../../types/tagTeam';
import Skeleton from '../ui/Skeleton';
import MatchResultForm from './MatchResultForm';
import MatchEditForm from './MatchEditForm';
import EventCheckIn from './EventCheckIn';
import EventCheckInRosterPanel from './EventCheckInRosterPanel';
import './EventDetail.css';

const eventTypeColors: Record<string, string> = {
  ppv: '#d4af37',
  weekly: '#60a5fa',
  special: '#a78bfa',
  house: '#9ca3af',
};

const statusColors: Record<string, string> = {
  upcoming: '#60a5fa',
  'in-progress': '#4ade80',
  completed: '#9ca3af',
  cancelled: '#f87171',
};

const designationLabels: Record<MatchDesignation, string> = {
  'pre-show': 'events.designations.preShow',
  'opener': 'events.designations.opener',
  'midcard': 'events.designations.midcard',
  'co-main': 'events.designations.coMain',
  'main-event': 'events.designations.mainEvent',
};

const designationColors: Record<MatchDesignation, string> = {
  'pre-show': '#6b7280',
  'opener': '#60a5fa',
  'midcard': '#a78bfa',
  'co-main': '#f59e0b',
  'main-event': '#d4af37',
};

type HydratedTagTeam = TagTeam & { player1Name?: string; player2Name?: string };

export default function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdminOrModerator, isAuthenticated, isWrestler, playerId } = useAuth();
  const [eventData, setEventData] = useState<EventWithMatches | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Admin-only data for inline record/edit/delete flows
  const [scheduledMatches, setScheduledMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [tagTeams, setTagTeams] = useState<HydratedTagTeam[]>([]);
  const [recordingMatchId, setRecordingMatchId] = useState<string | null>(null);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [matchActionError, setMatchActionError] = useState<string | null>(null);
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);

  // Check-in state
  const [myCheckIn, setMyCheckIn] = useState<EventCheckInRow | null>(null);
  const [checkInSummary, setCheckInSummary] = useState<EventCheckInSummary | null>(null);
  const [checkInError, setCheckInError] = useState<string | null>(null);

  const loadEvent = useCallback(async (signal?: AbortSignal) => {
    if (!eventId) return;
    try {
      setLoading(true);
      const data = await eventsApi.getById(eventId, signal);
      setEventData(data);
      setError(null);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Failed to load event');
      }
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  const loadAdminData = useCallback(async () => {
    if (!isAdminOrModerator) return;
    try {
      const [scheduled, playersData, tagTeamsData] = await Promise.all([
        matchesApi.getAll({ status: 'scheduled' }),
        playersApi.getAll(),
        tagTeamsApi.getAll({ status: 'active' }).catch(() => [] as TagTeam[]),
      ]);
      setScheduledMatches(scheduled);
      setPlayers(playersData);
      setTagTeams(tagTeamsData as HydratedTagTeam[]);
    } catch (err) {
      console.error('Failed to load admin data for event:', err);
    }
  }, [isAdminOrModerator]);

  const refreshAfterMutation = useCallback(async () => {
    await Promise.all([loadEvent(), loadAdminData()]);
    setRecordingMatchId(null);
    setEditingMatchId(null);
    setMatchActionError(null);
  }, [loadEvent, loadAdminData]);

  const handleStatusChange = async (newStatus: string) => {
    if (!eventData || !eventId || newStatus === eventData.status) return;
    setUpdatingStatus(true);
    try {
      await eventsApi.update(eventId, { status: newStatus as 'upcoming' | 'in-progress' | 'completed' | 'cancelled' });
      setEventData({ ...eventData, status: newStatus as EventWithMatches['status'] });
    } catch (err) {
      console.error('Failed to update event status:', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!eventData || !eventId || deleting) return;
    const confirmMsg = t('events.admin.confirmDeleteEvent', { name: eventData.name });
    if (!window.confirm(confirmMsg)) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await eventsApi.delete(eventId);
      navigate('/events');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('events.admin.deleteEventError'));
      setDeleting(false);
    }
  };

  const handleDeleteMatch = async (matchId: string) => {
    const targetMatch = scheduledMatches.find(m => m.matchId === matchId)
      ?? eventData?.enrichedMatches.find(em => em.matchId === matchId)?.matchData;
    if (!targetMatch) return;

    const isCompleted = (targetMatch as { status?: string }).status === 'completed';
    const isChampionship = 'isChampionship' in targetMatch && targetMatch.isChampionship && 'championshipId' in targetMatch && targetMatch.championshipId;
    const isTournament = 'tournamentId' in targetMatch && !!(targetMatch as { tournamentId?: string }).tournamentId;
    const matchFormat = 'matchFormat' in targetMatch ? (targetMatch as { matchFormat: string }).matchFormat : 'match';

    let confirmMsg: string;
    if (!isCompleted) {
      confirmMsg = `Delete this ${matchFormat} match? This cannot be undone.`;
    } else if (isChampionship) {
      confirmMsg = `Delete this completed CHAMPIONSHIP match? Player stats AND championship history will be rolled back. This cannot be undone.`;
    } else if (isTournament) {
      confirmMsg = `Delete this completed TOURNAMENT match? Player stats AND tournament progression will be rolled back. This cannot be undone.`;
    } else {
      confirmMsg = `Delete this completed ${matchFormat} match? Player stats (wins/losses/draws) will be rolled back. This cannot be undone.`;
    }

    if (!window.confirm(confirmMsg)) return;

    setDeletingMatchId(matchId);
    setMatchActionError(null);
    try {
      await matchesApi.delete(matchId);
      await refreshAfterMutation();
    } catch (err) {
      setMatchActionError(err instanceof Error ? err.message : 'Failed to delete match');
    } finally {
      setDeletingMatchId(null);
    }
  };

  useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();
    loadEvent(controller.signal);
    return () => controller.abort();
  }, [eventId, loadEvent]);

  useEffect(() => {
    if (!isAdminOrModerator) return;
    loadAdminData();
  }, [isAdminOrModerator, loadAdminData]);

  useEffect(() => {
    if (!eventId || !isAuthenticated || !isWrestler || !playerId) {
      setMyCheckIn(null);
      setCheckInSummary(null);
      return;
    }
    let ignore = false;
    (async () => {
      try {
        const [mine, summary] = await Promise.all([
          eventsApi.getMyCheckIn(eventId),
          eventsApi.getCheckInSummary(eventId),
        ]);
        if (ignore) return;
        setMyCheckIn(mine);
        setCheckInSummary(summary);
        setCheckInError(null);
      } catch (err) {
        if (ignore) return;
        setCheckInError(err instanceof Error ? err.message : 'events.checkIn.error');
      }
    })();
    return () => {
      ignore = true;
    };
  }, [eventId, isAuthenticated, isWrestler, playerId]);

  const handleCheckInChange = useCallback(
    async (status: EventCheckInStatus | null) => {
      if (!eventId) return;
      const prevStatus: EventCheckInStatus | null = myCheckIn?.status ?? null;
      const prevSummary = checkInSummary;
      const prevCheckIn = myCheckIn;

      // Optimistic update
      if (prevSummary) {
        const nextSummary: EventCheckInSummary = { ...prevSummary };
        if (prevStatus) {
          nextSummary[prevStatus] = Math.max(0, nextSummary[prevStatus] - 1);
        }
        if (status) {
          nextSummary[status] = nextSummary[status] + 1;
        }
        // Total: if we previously had no response and now set one, +1.
        // If we previously had a response and now clear it, -1.
        // Otherwise (transitioning between buckets), unchanged.
        if (!prevStatus && status) {
          nextSummary.total = nextSummary.total + 1;
        } else if (prevStatus && !status) {
          nextSummary.total = Math.max(0, nextSummary.total - 1);
        }
        setCheckInSummary(nextSummary);
      }
      setCheckInError(null);

      try {
        if (status === null) {
          await eventsApi.deleteCheckIn(eventId);
          setMyCheckIn(null);
        } else {
          const row = await eventsApi.checkIn(eventId, status);
          setMyCheckIn(row);
        }
      } catch {
        // Revert
        setMyCheckIn(prevCheckIn);
        setCheckInSummary(prevSummary);
        setCheckInError('events.checkIn.error');
      }
    },
    [eventId, myCheckIn, checkInSummary]
  );

  const scheduledMatchesById = useMemo(() => {
    const map = new Map<string, Match>();
    for (const m of scheduledMatches) {
      map.set(m.matchId, m);
    }
    return map;
  }, [scheduledMatches]);

  if (loading) {
    return (
      <div className="event-detail-page">
        <Skeleton variant="block" count={4} />
      </div>
    );
  }

  if (error || !eventData) {
    return (
      <div className="event-detail-page">
        <div className="event-not-found">
          <p>{error || t('events.detail.notFound')}</p>
          <Link to="/events" className="back-link">{t('events.detail.backToEvents')}</Link>
        </div>
      </div>
    );
  }

  const typeColor = eventTypeColors[eventData.eventType] || '#9ca3af';
  const statusColor = statusColors[eventData.status] || '#9ca3af';

  const formattedDate = new Date(eventData.date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const formattedTime = new Date(eventData.date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  // Separate pre-show and main card matches
  const enrichedMatches = eventData.enrichedMatches || [];
  const preShowMatches = enrichedMatches.filter(
    (m) => m.designation === 'pre-show'
  );
  const mainCardMatches = enrichedMatches.filter(
    (m) => m.designation !== 'pre-show'
  );

  const renderStarRating = (rating: number) => {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5;
    const stars: string[] = [];
    for (let i = 0; i < full; i++) stars.push('\u2605');
    if (half) stars.push('\u00BD');
    return stars.join('');
  };

  const handleRecordResult = (matchId: string) => {
    setRecordingMatchId(matchId);
    setEditingMatchId(null);
    setMatchActionError(null);
  };

  const handleEditMatch = (matchId: string) => {
    setEditingMatchId(matchId);
    setRecordingMatchId(null);
    setMatchActionError(null);
  };

  const handleCancelInlineForm = () => {
    setRecordingMatchId(null);
    setEditingMatchId(null);
    setMatchActionError(null);
  };

  const renderMatchEntry = (
    match: typeof enrichedMatches[number],
  ) => {
    const isRecording = recordingMatchId === match.matchId;
    const isEditing = editingMatchId === match.matchId;
    const rawMatch = scheduledMatchesById.get(match.matchId);

    return (
      <div key={match.matchId} className="match-entry-with-actions">
        <MatchEntry
          match={match}
          isCompleted={match.matchData?.status === 'completed'}
          isAdmin={isAdminOrModerator}
          isDeleting={deletingMatchId === match.matchId}
          onRecordResult={
            isAdminOrModerator && match.matchData?.status === 'scheduled'
              ? () => handleRecordResult(match.matchId)
              : undefined
          }
          onEdit={
            isAdminOrModerator && match.matchData?.status === 'scheduled'
              ? () => handleEditMatch(match.matchId)
              : undefined
          }
          onDelete={
            isAdminOrModerator
              ? () => handleDeleteMatch(match.matchId)
              : undefined
          }
        />
        {isRecording && rawMatch && (
          <div className="inline-form-container">
            <MatchResultForm
              match={rawMatch}
              players={players}
              tagTeams={tagTeams}
              onSuccess={refreshAfterMutation}
              onCancel={handleCancelInlineForm}
            />
          </div>
        )}
        {isRecording && !rawMatch && (
          <div className="inline-form-container">
            <div className="inline-form-error">
              {t('events.detail.matchNotFound', 'Match data is not available. Try refreshing the page.')}
            </div>
          </div>
        )}
        {isEditing && (
          <div className="inline-form-container">
            <MatchEditForm
              matchId={match.matchId}
              lockedEventId={eventData.eventId}
              onSuccess={refreshAfterMutation}
              onCancel={handleCancelInlineForm}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="event-detail-page">
      <Link to="/events" className="back-link">
        &larr; {t('events.detail.backToEvents')}
      </Link>

      {eventData.imageUrl && (
        <div className="event-banner">
          <img
            src={eventData.imageUrl}
            alt={eventData.name}
            className="event-banner-img"
          />
        </div>
      )}

      {/* Event Header */}
      <div
        className="event-detail-header"
        style={{ borderTopColor: typeColor }}
      >
        <div className="event-detail-title-row">
          <h2 className="event-detail-name">{eventData.name}</h2>
          <div className="event-detail-badges">
            <span
              className="event-detail-type-badge"
              style={{ backgroundColor: typeColor }}
            >
              {t(`events.types.${eventData.eventType}`)}
            </span>
            {isAdminOrModerator ? (
              <>
                <select
                  className="event-status-select"
                  value={eventData.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  disabled={updatingStatus}
                  style={{ color: statusColor, borderColor: statusColor }}
                >
                  <option value="upcoming">{t('events.status.upcoming')}</option>
                  <option value="in-progress">{t('events.status.in-progress')}</option>
                  <option value="completed">{t('events.status.completed')}</option>
                  <option value="cancelled">{t('events.status.cancelled')}</option>
                </select>
                <button
                  type="button"
                  className="event-detail-delete-btn"
                  onClick={handleDeleteEvent}
                  disabled={deleting}
                  title={t('events.admin.deleteEvent')}
                  aria-label={t('events.admin.deleteEvent')}
                >
                  {deleting ? t('common.saving') : t('events.admin.deleteEvent')}
                </button>
              </>
            ) : (
              <span
                className="event-detail-status-badge"
                style={{ color: statusColor, borderColor: statusColor }}
              >
                {t(`events.status.${eventData.status}`)}
              </span>
            )}
          </div>
        </div>
        {deleteError && (
          <div className="event-detail-delete-error" role="alert">
            {deleteError}
          </div>
        )}

        <div className="event-detail-info">
          <div className="event-detail-info-item">
            <span className="info-label">{t('events.detail.date')}:</span>
            <span>{formattedDate} - {formattedTime}</span>
          </div>
          {eventData.venue && (
            <div className="event-detail-info-item">
              <span className="info-label">{t('events.detail.venue')}:</span>
              <span>{eventData.venue}</span>
            </div>
          )}
          {eventData.attendance && (
            <div className="event-detail-info-item">
              <span className="info-label">{t('events.detail.attendance')}:</span>
              <span>{eventData.attendance.toLocaleString()}</span>
            </div>
          )}
          {eventData.rating && (
            <div className="event-detail-info-item">
              <span className="info-label">{t('events.detail.rating')}:</span>
              <span className="event-rating">
                {renderStarRating(eventData.rating)} ({eventData.rating}/5)
              </span>
            </div>
          )}
        </div>

        {eventData.description && (
          <p className="event-detail-description">{eventData.description}</p>
        )}

        {isAuthenticated && isWrestler && playerId && checkInSummary && (
          <>
            <EventCheckIn
              eventStatus={eventData.status}
              currentStatus={myCheckIn?.status ?? null}
              summary={checkInSummary}
              onChange={handleCheckInChange}
            />
            {checkInError && (
              <div className="event-checkin-error" role="alert">
                {t(checkInError, { defaultValue: 'Failed to update check-in.' })}
              </div>
            )}
          </>
        )}

        {enrichedMatches.some(m => m.matchData?.status === 'completed') && (
          <Link
            to={`/events/${eventData.eventId}/results`}
            className="view-results-btn"
          >
            {t('events.detail.viewResults')}
          </Link>
        )}
      </div>

      {/* Match Card */}
      <div className="event-match-card-section">
        <div className="match-card-header">
          <h3 className="match-card-title">{t('events.detail.matchCard')}</h3>
          {isAdminOrModerator && (eventData.status === 'upcoming' || eventData.status === 'in-progress') && (
            <button
              className="add-match-btn"
              onClick={() => navigate('/admin/schedule', {
                state: { fromEvent: { eventId: eventData.eventId, name: eventData.name, date: eventData.date } },
              })}
            >
              + {t('events.detail.addMatch', 'Add Match')}
            </button>
          )}
        </div>

        {matchActionError && (
          <div className="event-detail-delete-error" role="alert">
            {matchActionError}
          </div>
        )}

        {enrichedMatches.length === 0 ? (
          <div className="no-matches-block">
            <p className="no-matches-message">{t('events.detail.noMatches')}</p>
            {isAdminOrModerator && (eventData.status === 'upcoming' || eventData.status === 'in-progress') && (
              <button
                className="add-match-btn add-match-btn-lg"
                onClick={() => navigate('/admin/schedule', {
                  state: { fromEvent: { eventId: eventData.eventId, name: eventData.name, date: eventData.date } },
                })}
              >
                + {t('events.detail.scheduleFirstMatch', 'Schedule First Match')}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Pre-show */}
            {preShowMatches.length > 0 && (
              <div className="pre-show-section">
                <div className="pre-show-divider">
                  <span>{t('events.detail.preShow')}</span>
                </div>
                <div className="match-list">
                  {preShowMatches.map(renderMatchEntry)}
                </div>
              </div>
            )}

            {/* Main Card */}
            {mainCardMatches.length > 0 && (
              <div className="main-card-section">
                {preShowMatches.length > 0 && (
                  <div className="main-card-divider">
                    <span>{t('events.detail.mainCard')}</span>
                  </div>
                )}
                <div className="match-list">
                  {mainCardMatches.map(renderMatchEntry)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {isAdminOrModerator && eventId && (
        <EventCheckInRosterPanel eventId={eventId} />
      )}
    </div>
  );
}

interface MatchEntryProps {
  match: {
    position: number;
    matchId: string;
    designation: MatchDesignation;
    notes?: string;
    matchData: {
      matchId: string;
      matchFormat: string;
      stipulationId?: string;
      stipulationName?: string;
      participants: {
        playerId: string;
        playerName: string;
        wrestlerName: string;
      }[];
      winners?: string[];
      losers?: string[];
      isChampionship: boolean;
      championshipName?: string;
      status: 'scheduled' | 'completed';
      starRating?: number;
      matchOfTheNight?: boolean;
    } | null;
  };
  isCompleted: boolean;
  isAdmin?: boolean;
  isDeleting?: boolean;
  onRecordResult?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function matchStarsDisplay(rating: number): string {
  const stars: string[] = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(i <= Math.floor(rating) ? '\u2605' : '\u2606');
  }
  return stars.join('');
}

function MatchEntry({
  match,
  isCompleted,
  isAdmin = false,
  isDeleting = false,
  onRecordResult,
  onEdit,
  onDelete,
}: MatchEntryProps) {
  const { t } = useTranslation();
  const { designation, matchData } = match;
  const desColor = designationColors[designation];
  const isMainEvent = designation === 'main-event';

  if (!matchData) {
    return (
      <div className={`match-entry ${isMainEvent ? 'main-event-match' : ''}`}>
        <div className="match-entry-header">
          <span
            className="match-designation-badge"
            style={{ backgroundColor: desColor }}
          >
            {t(designationLabels[designation])}
          </span>
          <span className="match-type-label">{t('events.detail.matchTBA', 'Match TBA')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`match-entry ${isMainEvent ? 'main-event-match' : ''}`}>
      <div className="match-entry-header">
        <span
          className="match-designation-badge"
          style={{ backgroundColor: desColor }}
        >
          {t(designationLabels[designation])}
        </span>
        <span className="match-type-label">
          {matchData.matchFormat}
          {matchData.stipulationName && ` - ${matchData.stipulationName}`}
        </span>
        {matchData.isChampionship && (
          <span className="match-championship-badge">
            {matchData.championshipName || t('events.detail.championshipMatch')}
          </span>
        )}
        {isCompleted && (matchData.starRating != null || matchData.matchOfTheNight) && (
          <span className="match-awards">
            {matchData.starRating != null && (
              <span className="match-star-rating" title={t('match.starRating')}>
                {matchStarsDisplay(matchData.starRating)}
                <span className="match-star-value">{matchData.starRating}</span>
              </span>
            )}
            {matchData.matchOfTheNight && (
              <span className="match-motn-badge">{t('match.matchOfTheNightBadge')}</span>
            )}
          </span>
        )}
      </div>

      <div className="match-participants">
        {matchData.participants.map((p) => {
          const isWinner = isCompleted && matchData.winners?.includes(p.playerId);
          const isLoser = isCompleted && matchData.losers?.includes(p.playerId);
          return (
            <span
              key={p.playerId}
              className={`participant ${isWinner ? 'winner' : ''} ${isLoser ? 'loser' : ''}`}
            >
              {p.wrestlerName}
              <span className="participant-player">({p.playerName})</span>
              {isWinner && <span className="winner-indicator"> {t('events.detail.winner')}</span>}
            </span>
          );
        })}
      </div>

      {match.notes && (
        <div className="match-notes">{match.notes}</div>
      )}

      {isAdmin && (onRecordResult || onEdit || onDelete) && (
        <div className="match-entry-actions">
          {onRecordResult && (
            <button
              type="button"
              className="match-action-btn match-action-btn-primary"
              onClick={onRecordResult}
              disabled={isDeleting}
            >
              {t('events.detail.recordResult', 'Record Result')}
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              className="match-action-btn match-action-btn-secondary"
              onClick={onEdit}
              disabled={isDeleting}
            >
              {t('events.detail.editMatch', 'Edit')}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="match-action-btn match-action-btn-destructive"
              onClick={onDelete}
              disabled={isDeleting}
            >
              {isDeleting ? t('common.saving') : t('events.detail.deleteMatch', 'Delete')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
