import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { eventsApi } from '../../services/api/events.api';
import type {
  EventCheckInRoster,
  EventCheckInPlayerSummary,
} from '../../types/event';
import './EventCheckInRosterPanel.css';

interface EventCheckInRosterPanelProps {
  eventId: string;
  compact?: boolean;
}

type BucketKey = 'available' | 'tentative' | 'unavailable' | 'noResponse';

const BUCKET_ORDER: BucketKey[] = [
  'available',
  'tentative',
  'unavailable',
  'noResponse',
];

const FALLBACK_AVATAR =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="%23444"/><text x="50%25" y="55%25" dominant-baseline="middle" text-anchor="middle" fill="%23fff" font-size="16" font-family="sans-serif">?</text></svg>';

function PlayerChip({ player }: { player: EventCheckInPlayerSummary }) {
  return (
    <li className="checkin-roster-chip">
      <img
        className="checkin-roster-chip-avatar"
        src={player.imageUrl || FALLBACK_AVATAR}
        alt=""
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = FALLBACK_AVATAR;
        }}
      />
      <div className="checkin-roster-chip-text">
        <span className="checkin-roster-chip-name">{player.name}</span>
        <span className="checkin-roster-chip-wrestler">
          {player.currentWrestler}
        </span>
      </div>
    </li>
  );
}

export default function EventCheckInRosterPanel({
  eventId,
  compact = false,
}: EventCheckInRosterPanelProps) {
  const { t } = useTranslation();
  const [roster, setRoster] = useState<EventCheckInRoster | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const fetchRoster = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await eventsApi.getCheckIns(eventId);
      setRoster(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void fetchRoster();
  }, [fetchRoster]);

  const handleCopy = useCallback(async () => {
    if (!roster) return;
    const lines: string[] = [];
    for (const key of BUCKET_ORDER) {
      const bucket = roster[key];
      const label = t(`events.checkIn.roster.${key}`, {
        defaultValue:
          key === 'noResponse'
            ? 'No Response'
            : key.charAt(0).toUpperCase() + key.slice(1),
      });
      lines.push(`${label} (${bucket.length}):`);
      for (const player of bucket) {
        lines.push(`  - ${player.name} (${player.currentWrestler})`);
      }
      lines.push('');
    }
    const text = lines.join('\n').trimEnd();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failures silently
    }
  }, [roster, t]);

  if (loading && !roster) {
    return (
      <div className="checkin-roster-panel">
        <p className="checkin-roster-loading">
          {t('events.checkIn.roster.loading', { defaultValue: 'Loading...' })}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="checkin-roster-panel">
        <p className="checkin-roster-error" role="alert">
          {t('events.checkIn.roster.error', {
            defaultValue: 'Failed to load check-in roster.',
          })}
        </p>
      </div>
    );
  }

  if (!roster) {
    return null;
  }

  const isEmpty =
    roster.available.length === 0 &&
    roster.tentative.length === 0 &&
    roster.unavailable.length === 0 &&
    roster.noResponse.length === 0;

  if (compact) {
    return (
      <div className="checkin-roster-panel checkin-roster-panel--compact">
        <h4 className="checkin-roster-compact-title">
          {t('events.checkIn.roster.available', { defaultValue: 'Available' })}{' '}
          ({roster.available.length})
        </h4>
        {roster.available.length === 0 ? (
          <p className="checkin-roster-empty">
            {t('events.checkIn.roster.empty', {
              defaultValue: 'No check-ins yet.',
            })}
          </p>
        ) : (
          <ul className="checkin-roster-list">
            {roster.available.map((player) => (
              <PlayerChip key={player.playerId} player={player} />
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="checkin-roster-panel">
      <div className="checkin-roster-header">
        <h3 className="checkin-roster-title">
          {t('events.checkIn.roster.title', {
            defaultValue: 'Check-in Roster',
          })}
        </h3>
        <div className="checkin-roster-actions">
          <button
            type="button"
            className="checkin-roster-button"
            onClick={() => void fetchRoster()}
            disabled={loading}
          >
            {t('events.checkIn.roster.refresh', { defaultValue: 'Refresh' })}
          </button>
          <button
            type="button"
            className="checkin-roster-button"
            onClick={() => void handleCopy()}
            disabled={isEmpty}
          >
            {t('events.checkIn.roster.copy', {
              defaultValue: 'Copy as text',
            })}
          </button>
          {copied && (
            <span className="checkin-roster-copied" role="status">
              {t('events.checkIn.roster.copySuccess', {
                defaultValue: 'Copied!',
              })}
            </span>
          )}
        </div>
      </div>

      {isEmpty ? (
        <p className="checkin-roster-empty">
          {t('events.checkIn.roster.empty', {
            defaultValue: 'No check-ins yet.',
          })}
        </p>
      ) : (
        <div className="checkin-roster-grid">
          {BUCKET_ORDER.map((key) => {
            const bucket = roster[key];
            const label = t(`events.checkIn.roster.${key}`, {
              defaultValue:
                key === 'noResponse'
                  ? 'No Response'
                  : key.charAt(0).toUpperCase() + key.slice(1),
            });
            return (
              <div key={key} className="checkin-roster-column">
                <h4 className="checkin-roster-column-title">
                  {label} ({bucket.length})
                </h4>
                <ul className="checkin-roster-list">
                  {bucket.map((player) => (
                    <PlayerChip key={player.playerId} player={player} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
