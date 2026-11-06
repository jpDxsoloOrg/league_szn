import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { eventsApi } from '../../services/api';
import type { EventWithMatches } from '../../types/event';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import { StarRating } from '../matches/StarRating';
import { DESIGNATION_LABEL_KEYS } from './eventDisplay';
import { formatMatchType } from '../../utils/matchDisplay';
import './EventResults.css';

export default function EventResults() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
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
      <div className="event-results-page">
        <Skeleton variant="block" count={4} />
      </div>
    );
  }

  if (error || !eventData) {
    return (
      <div className="event-results-page">
        <EmptyState
          title={error || t('events.results.notFound')}
          actionLabel={t('events.detail.backToEvents')}
          onAction={() => navigate('/events')}
        />
      </div>
    );
  }

  const enrichedMatches = eventData.enrichedMatches || [];
  const completedMatches = enrichedMatches.flatMap((m) =>
    m.matchData?.status === 'completed' ? [{ ...m, matchData: m.matchData }] : [],
  );

  if (completedMatches.length === 0) {
    return (
      <div className="event-results-page">
        <EmptyState
          title={t('events.results.notCompleted')}
          description={t('emptyState.checkBackSoon')}
          actionLabel={t('events.results.backToEvent')}
          onAction={() => eventId && navigate(`/events/${eventId}`)}
        />
      </div>
    );
  }

  const titleMatches = completedMatches.filter(
    (m) => m.matchData.isChampionship && m.matchData.winners && m.matchData.winners.length > 0
  );

  return (
    <div className="event-results-page">
      <Button className="event-results-back" variant="ghost" size="sm" to={`/events/${eventId}`} icon={<ArrowLeft aria-hidden="true" size={18} />}>
        {t('events.results.backToEvent')}
      </Button>

      <PageHeader title={eventData.name} eyebrow={t('events.results.title')} />

      <dl className="event-results-stats">
        <div>
          <dt>{t('events.results.totalMatches')}</dt>
          <dd>{completedMatches.length}</dd>
        </div>
        <div>
          <dt>{t('events.results.titleChanges')}</dt>
          <dd>{titleMatches.length}</dd>
        </div>
        {eventData.attendance && (
          <div>
            <dt>{t('events.results.attendance')}</dt>
            <dd>{eventData.attendance.toLocaleString()}</dd>
          </div>
        )}
        {eventData.rating && (
          <div>
            <dt>{t('events.detail.rating')}</dt>
            <dd>{eventData.rating} / 5</dd>
          </div>
        )}
      </dl>

      <section className="event-results-section">
        <h2 className="event-results-section__title">{t('events.results.matchResults')}</h2>

        <ol className="event-results-list">
          {completedMatches.map((match) => {
            const { matchData, designation } = match;
            const winnerNames = matchData.participants
              .filter((p) => matchData.winners?.includes(p.playerId))
              .map((p) => p.wrestlerName);
            const loserNames = matchData.participants
              .filter((p) => matchData.losers?.includes(p.playerId))
              .map((p) => p.wrestlerName);
            // A draw is stored with every participant as a winner and no losers.
            const isDraw = loserNames.length === 0;

            return (
              <li
                key={match.matchId}
                className={`event-result${designation === 'main-event' ? ' event-result--main' : ''}`}
              >
                <div className="event-result__meta">
                  <Badge tone={designation === 'main-event' ? 'pink' : 'neutral'}>{t(DESIGNATION_LABEL_KEYS[designation])}</Badge>
                  <span>
                    {formatMatchType(matchData.matchFormat, t)}
                    {matchData.stipulationName && ` · ${matchData.stipulationName}`}
                  </span>
                  {matchData.isChampionship && (
                    <Badge tone="warning">{matchData.championshipName || t('events.results.titleChange')}</Badge>
                  )}
                </div>

                {isDraw ? (
                  <p className="event-result__outcome">
                    <span className="event-result__winners">{winnerNames.join(' & ')}</span>
                    <span className="event-result__def">{t('events.results.draw', 'Draw')}</span>
                  </p>
                ) : (
                  <p className="event-result__outcome">
                    <span className="sr-only">{t('events.results.winnersLabel')}: </span>
                    <span className="event-result__winners">{winnerNames.join(' & ')}</span>
                    <span className="event-result__def">{t('events.results.defeatedLabel')}</span>
                    <span className="event-result__losers">{loserNames.join(' & ')}</span>
                  </p>
                )}

                {(matchData.starRating != null || matchData.matchOfTheNight) && (
                  <div className="event-result__awards">
                    {matchData.starRating != null && (
                      <StarRating starRating={matchData.starRating} ratingsCount={matchData.ratingsCount} size="sm" />
                    )}
                    {matchData.matchOfTheNight && <Badge tone="violet">{t('match.matchOfTheNightBadge')}</Badge>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
