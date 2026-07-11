import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { EventCalendarEntry } from '../../types/event';
import { formatCalendarDate } from '../../utils/dateUtils';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import './EventCard.css';

interface EventCardProps {
  event: EventCalendarEntry;
}

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

export default function EventCard({ event }: EventCardProps) {
  const { t } = useTranslation();
  // Mobile app card (docs/design/mobile-app/league-szn-events): square date
  // block, LIVE badge + progress bar, chevron. JSDOM has no matchMedia, so
  // tests keep exercising the desktop markup.
  const isMobile = useMediaQuery('(max-width: 768px)');

  const typeColor = eventTypeColors[event.eventType] || '#9ca3af';
  const statusColor = statusColors[event.status] || '#9ca3af';

  const formattedDate = formatCalendarDate(event.date, 'en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const dateBlockMonth = formatCalendarDate(event.date, undefined, { month: 'short' });
  const dateBlockDay = formatCalendarDate(event.date, undefined, { day: '2-digit' });
  const isLive = event.status === 'in-progress';

  return (
    <Link to={`/events/${event.eventId}`} className="event-card-link">
      <div
        className={`event-card${event.status === 'completed' ? ' completed' : ''}${event.imageUrl && !isMobile ? ' has-thumb' : ''}${isLive ? ' live' : ''}`}
        style={{ borderLeftColor: typeColor }}
      >
        {isMobile && (
          <div className="event-card-dateblock" aria-hidden="true">
            <span className="event-card-dateblock-month">{dateBlockMonth}</span>
            <span className="event-card-dateblock-day">{dateBlockDay}</span>
          </div>
        )}
        {event.imageUrl && !isMobile && (
          <div className="event-card-thumb">
            <img src={event.imageUrl} alt="" className="event-card-thumb-img" />
          </div>
        )}
        <div className="event-card-body">
        <div className="event-card-header">
          <h3 className="event-card-name">{event.name}</h3>
          <span
            className="event-type-badge"
            style={{ backgroundColor: typeColor }}
          >
            {t(`events.types.${event.eventType}`)}
          </span>
        </div>

        <div className="event-card-details">
          <div className="event-card-date">
            <span className="event-card-icon">&#128197;</span>
            <span>{formattedDate}</span>
          </div>

          <div className="event-card-meta">
            <span
              className={`event-status-badge event-status-${event.status}`}
              style={{ color: statusColor, borderColor: statusColor }}
            >
              {isMobile && isLive ? t('dashboard.liveBadge', 'Live') : t(`events.status.${event.status}`)}
            </span>

            <span className="event-match-count">
              {event.matchCount} {t('events.card.matches', { count: event.matchCount })}
            </span>

            {event.championshipMatchCount > 0 && (
              <span className="event-championship-count">
                {event.championshipMatchCount} {t('events.card.titleMatches')}
              </span>
            )}
          </div>
        </div>

        {event.status === 'completed' && (
          <div className="event-card-view-results">
            <span>
              {isMobile
                ? t('events.card.resultsAvailable', 'Results available')
                : t('events.card.viewResults', 'View Results')}
            </span>
            <span className="event-card-view-results-arrow">&rarr;</span>
          </div>
        )}

        {isMobile && isLive && (
          <div className="event-card-live-bar" aria-hidden="true">
            <div className="event-card-live-bar-fill" />
          </div>
        )}
        </div>
      </div>
    </Link>
  );
}
