import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { eventsApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import type { MatchDesignation, EventWithMatches } from '../../types/event';
import Skeleton from '../ui/Skeleton';
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

export default function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdminOrModerator } = useAuth();
  const [eventData, setEventData] = useState<EventWithMatches | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();
    const loadEvent = async () => {
      try {
        setLoading(true);
        const data = await eventsApi.getById(eventId, controller.signal);
        setEventData(data);
        setError(null);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Failed to load event');
        }
      } finally {
        setLoading(false);
      }
    };
    loadEvent();
    return () => controller.abort();
  }, [eventId]);

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
            <span
              className="event-detail-status-badge"
              style={{ color: statusColor, borderColor: statusColor }}
            >
              {t(`events.status.${eventData.status}`)}
            </span>
          </div>
        </div>

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
                  {preShowMatches.map((match) => (
                    <MatchEntry
                      key={match.matchId}
                      match={match}
                      isCompleted={match.matchData?.status === 'completed'}
                      t={t}
                    />
                  ))}
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
                  {mainCardMatches.map((match) => (
                    <MatchEntry
                      key={match.matchId}
                      match={match}
                      isCompleted={match.matchData?.status === 'completed'}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
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
    };
  };
  isCompleted: boolean;
  t: (key: string) => string;
}

function matchStarsDisplay(rating: number): string {
  const stars: string[] = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(i <= Math.floor(rating) ? '\u2605' : '\u2606');
  }
  return stars.join('');
}

function MatchEntry({ match, isCompleted, t }: MatchEntryProps) {
  const { designation, matchData } = match;
  const desColor = designationColors[designation];
  const isMainEvent = designation === 'main-event';

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
    </div>
  );
}
