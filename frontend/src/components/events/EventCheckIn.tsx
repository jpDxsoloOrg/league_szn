import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventStatus, EventCheckInStatus, EventCheckInSummary } from '../../types/event';
import './EventCheckIn.css';

interface EventCheckInProps {
  eventStatus: EventStatus;
  currentStatus: EventCheckInStatus | null;
  summary: EventCheckInSummary;
  onChange: (status: EventCheckInStatus | null) => Promise<void>;
}

const RSVP_OPTIONS: EventCheckInStatus[] = ['available', 'tentative', 'unavailable'];

function EventCheckIn({ eventStatus, currentStatus, summary, onChange }: EventCheckInProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const locked = eventStatus !== 'upcoming' && eventStatus !== 'in-progress';
  const disabled = locked || submitting;

  const handleChange = async (status: EventCheckInStatus | null) => {
    if (disabled) return;
    setSubmitting(true);
    try {
      await onChange(status);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`event-checkin${locked ? ' disabled' : ''}`}>
      <div className="event-checkin-buttons">
        {RSVP_OPTIONS.map((status) => {
          const isSelected = currentStatus === status;
          return (
            <button
              key={status}
              type="button"
              className={`event-checkin-btn event-checkin-btn-${status}${isSelected ? ' selected' : ''}`}
              disabled={disabled}
              onClick={() => handleChange(status)}
            >
              {t(`events.checkIn.${status}`)}
            </button>
          );
        })}
      </div>

      <div className="event-checkin-summary">
        {t('events.checkIn.summary', {
          available: summary.available,
          tentative: summary.tentative,
          unavailable: summary.unavailable,
          defaultValue: `${summary.available} available · ${summary.tentative} tentative · ${summary.unavailable} unavailable`,
        })}
      </div>

      {currentStatus !== null && (
        <button
          type="button"
          className="event-checkin-clear"
          disabled={disabled}
          onClick={() => handleChange(null)}
        >
          {t('events.checkIn.clearResponse')}
        </button>
      )}

      {locked && (
        <div className="event-checkin-locked-hint">
          {t('events.checkIn.lockedAfterStart')}
        </div>
      )}
    </div>
  );
}

export default EventCheckIn;
