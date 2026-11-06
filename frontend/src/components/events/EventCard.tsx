import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { EventCalendarEntry } from '../../types/event';
import { formatCalendarDate } from '../../utils/dateUtils';
import Badge from '../ui/Badge';
import { EVENT_STATUS_TONES, EVENT_TYPE_TONES } from './eventDisplay';
import './EventCard.css';

interface EventCardProps {
  event: EventCalendarEntry;
  /** Off inside a section that already names the status. */
  showStatus?: boolean;
}

export default function EventCard({ event, showStatus = true }: EventCardProps) {
  const { t } = useTranslation();
  const month = formatCalendarDate(event.date, undefined, { month: 'short' });
  const day = formatCalendarDate(event.date, undefined, { day: '2-digit' });
  const fullDate = formatCalendarDate(event.date, undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const isCompleted = event.status === 'completed';

  return (
    <Link to={`/events/${event.eventId}`} className="event-card">
      <span className="event-card__date" aria-hidden="true">
        <span className="event-card__month">{month}</span>
        <span className="event-card__day">{day}</span>
      </span>

      <span className="event-card__body">
        <span className="event-card__name">{event.name}</span>
        <span className="event-card__meta">
          <span className="sr-only">{fullDate}</span>
          <span>{t('rivalries.card.matchCount', { count: event.matchCount })}</span>
          {event.championshipMatchCount > 0 && (
            <span>{event.championshipMatchCount} {t('events.card.titleMatches')}</span>
          )}
          {isCompleted && <span className="event-card__results">{t('events.card.resultsAvailable', 'Results available')}</span>}
        </span>
      </span>

      <span className="event-card__badges">
        <Badge tone={EVENT_TYPE_TONES[event.eventType]}>{t(`events.types.${event.eventType}`)}</Badge>
        {showStatus && <Badge tone={EVENT_STATUS_TONES[event.status]}>{t(`events.status.${event.status}`)}</Badge>}
      </span>

      <ChevronRight className="event-card__chevron" aria-hidden="true" size={20} />
    </Link>
  );
}
