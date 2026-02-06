import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getEventWithMatches } from '../../mocks/eventMockData';
import type { MatchDesignation } from '../../types/event';
import './EventResults.css';

const designationLabels: Record<MatchDesignation, string> = {
  'pre-show': 'events.designations.preShow',
  'opener': 'events.designations.opener',
  'midcard': 'events.designations.midcard',
  'co-main': 'events.designations.coMain',
  'main-event': 'events.designations.mainEvent',
};

export default function EventResults() {
  const { eventId } = useParams<{ eventId: string }>();
  const { t } = useTranslation();

  const eventData = useMemo(() => {
    if (!eventId) return null;
    return getEventWithMatches(eventId);
  }, [eventId]);

  if (!eventData) {
    return (
      <div className="event-results-page">
        <div className="results-not-found">
          <p>{t('events.results.notFound')}</p>
          <Link to="/events" className="results-back-link">{t('events.detail.backToEvents')}</Link>
        </div>
      </div>
    );
  }

  if (eventData.status !== 'completed') {
    return (
      <div className="event-results-page">
        <div className="results-not-ready">
          <p>{t('events.results.notCompleted')}</p>
          <Link to={`/events/${eventId}`} className="results-back-link">
            {t('events.results.backToEvent')}
          </Link>
        </div>
      </div>
    );
  }

  const completedMatches = eventData.enrichedMatches.filter(
    (m) => m.matchData.status === 'completed'
  );

  const titleChanges = completedMatches.filter(
    (m) => m.matchData.isChampionship && m.matchData.winners && m.matchData.winners.length > 0
  );

  const renderStarRating = (rating: number) => {
    const stars: string[] = [];
    for (let i = 1; i <= 5; i++) {
      if (i <= Math.floor(rating)) {
        stars.push('\u2605');
      } else if (i === Math.ceil(rating) && rating % 1 >= 0.5) {
        stars.push('\u2605');
      } else {
        stars.push('\u2606');
      }
    }
    return stars.join('');
  };

  return (
    <div className="event-results-page">
      <Link to={`/events/${eventId}`} className="results-back-link">
        &larr; {t('events.results.backToEvent')}
      </Link>

      {/* Results Header */}
      <div className="results-header">
        <h2 className="results-event-name">{eventData.name}</h2>
        <p className="results-subtitle">{t('events.results.title')}</p>

        {eventData.rating && (
          <div className="results-rating">
            <span className="results-stars">{renderStarRating(eventData.rating)}</span>
            <span className="results-rating-value">{eventData.rating} / 5</span>
          </div>
        )}

        <div className="results-summary">
          <div className="results-stat">
            <span className="results-stat-value">{completedMatches.length}</span>
            <span className="results-stat-label">{t('events.results.totalMatches')}</span>
          </div>
          <div className="results-stat">
            <span className="results-stat-value results-title-changes">
              {titleChanges.length}
            </span>
            <span className="results-stat-label">{t('events.results.titleChanges')}</span>
          </div>
          {eventData.attendance && (
            <div className="results-stat">
              <span className="results-stat-value">{eventData.attendance.toLocaleString()}</span>
              <span className="results-stat-label">{t('events.results.attendance')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Results List */}
      <div className="results-match-list">
        <h3 className="results-section-title">{t('events.results.matchResults')}</h3>

        {completedMatches.map((match, index) => {
          const { matchData, designation } = match;
          const winnerNames = matchData.participants
            .filter((p) => matchData.winners?.includes(p.playerId))
            .map((p) => p.wrestlerName);
          const loserNames = matchData.participants
            .filter((p) => matchData.losers?.includes(p.playerId))
            .map((p) => p.wrestlerName);

          return (
            <div
              key={match.matchId}
              className={`results-match-entry ${matchData.isChampionship ? 'championship-result' : ''} ${designation === 'main-event' ? 'main-event-result' : ''}`}
            >
              <div className="results-match-number">#{index + 1}</div>
              <div className="results-match-content">
                <div className="results-match-meta">
                  <span className="results-designation">
                    {t(designationLabels[designation])}
                  </span>
                  <span className="results-match-type">
                    {matchData.matchType}
                    {matchData.stipulation && ` - ${matchData.stipulation}`}
                  </span>
                  {matchData.isChampionship && (
                    <span className="results-championship-tag">
                      {matchData.championshipName}
                    </span>
                  )}
                </div>

                <div className="results-outcome">
                  <div className="results-winners">
                    <span className="outcome-label">{t('events.results.winnersLabel')}:</span>
                    <span className="winner-names">{winnerNames.join(' & ')}</span>
                  </div>
                  <div className="results-losers">
                    <span className="outcome-label">{t('events.results.defeatedLabel')}:</span>
                    <span className="loser-names">{loserNames.join(' & ')}</span>
                  </div>
                </div>

                {matchData.isChampionship && (
                  <div className="title-change-indicator">
                    {t('events.results.titleChange')}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
