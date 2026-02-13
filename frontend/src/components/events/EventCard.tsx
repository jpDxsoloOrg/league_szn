import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { EventCalendarEntry } from '../../types/event';
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

  const typeColor = eventTypeColors[event.eventType] || '#9ca3af';
  const statusColor = statusColors[event.status] || '#9ca3af';

  const formattedDate = new Date(event.date).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const formattedTime = new Date(event.date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <Link to={`/events/${event.eventId}`} className="event-card-link">
      <div
        className={`event-card${event.status === 'completed' ? ' completed' : ''}`}
        style={{ borderLeftColor: typeColor }}
      >
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
            <span>{formattedDate} - {formattedTime}</span>
          </div>

          <div className="event-card-meta">
            <span
              className="event-status-badge"
              style={{ color: statusColor, borderColor: statusColor }}
            >
              {t(`events.status.${event.status}`)}
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
            <span>{t('events.card.viewResults', 'View Results')}</span>
            <span className="event-card-view-results-arrow">&rarr;</span>
          </div>
        )}
      </div>
    </Link>
  );
}
