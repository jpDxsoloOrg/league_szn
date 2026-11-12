import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';
import type { ProgressionEventEntry, ProgressionEventType, ProgressionTrack } from '../../../types/progression';
import { progressionApi } from '../../../services/api';
import Badge, { type BadgeTone } from '../../ui/Badge';
import Button from '../../ui/Button';
import DataTable from '../../ui/DataTable';
import EmptyState from '../../ui/EmptyState';
import Select from '../../ui/Select';
import AdminNotice from '../AdminNotice';

/** How many events the history asks for (the API allows up to 200). */
export const HISTORY_LIMIT = 100;

const SYSTEM_ACTOR = 'system';

const TYPE_TONE: Record<ProgressionEventType, BadgeTone> = {
  consideration_added: 'warning',
  consideration_removed: 'neutral',
  executed: 'win',
};

export interface EventHistoryProps {
  tracks: ProgressionTrack[];
}

/** Recent ProgressionEvents: who was flagged, unflagged or moved, and by whom. */
export default function EventHistory({ tracks }: EventHistoryProps) {
  const { t, i18n } = useTranslation();
  const [trackId, setTrackId] = useState('');
  const [events, setEvents] = useState<ProgressionEventEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const rows = await progressionApi.getEvents(
          { trackId: trackId || undefined, limit: HISTORY_LIMIT },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setEvents(rows);
      } catch (err) {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [trackId, retryKey]);

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language],
  );

  const trackOptions = useMemo(() => [
    { value: '', label: t('progression.admin.history.allTracks') },
    ...tracks.map((track) => ({ value: track.trackId, label: track.name })),
  ], [tracks, t]);

  const actorLabel = (event: ProgressionEventEntry): string => {
    if (event.actorUserId === SYSTEM_ACTOR) return t('progression.admin.history.system');
    return event.actorName ?? t('progression.admin.history.unknownStaff');
  };

  const route = (event: ProgressionEventEntry): string => {
    const from = event.fromDivisionName ?? event.fromDivisionId;
    if (!event.toDivisionId) return from;
    return t('progression.admin.trackRoute', { from, to: event.toDivisionName ?? event.toDivisionId });
  };

  return (
    <div className="mp-section">
      <div className="ac-toolbar">
        <Select
          id="progression-history-track"
          label={t('progression.admin.history.trackFilter')}
          value={trackId}
          onValueChange={setTrackId}
          options={trackOptions}
        />
        <span className="ac-toolbar__spacer" />
        {!loading && !loadError && (
          <span className="ac-toolbar__count">{t('progression.admin.history.count', { count: events.length })}</span>
        )}
      </div>

      {loadError ? (
        <AdminNotice
          tone="error"
          action={<Button variant="ghost" size="sm" onClick={() => setRetryKey((key) => key + 1)}>{t('common.retry', 'Retry')}</Button>}
        >
          {t('progression.admin.history.loadFailed', { message: loadError })}
        </AdminNotice>
      ) : (
        <DataTable
          caption={t('progression.admin.tabs.history')}
          density="dense"
          loading={loading}
          rows={events}
          rowKey={(event) => event.eventId}
          empty={(
            <EmptyState
              icon={<History aria-hidden="true" size={32} />}
              title={t('progression.admin.history.empty')}
            />
          )}
          columns={[
            {
              key: 'date',
              header: t('progression.admin.history.columns.date'),
              sortValue: (event) => event.createdAt,
              render: (event) => (
                <time className="ac-nowrap" dateTime={event.createdAt}>{dateFormat.format(new Date(event.createdAt))}</time>
              ),
            },
            {
              key: 'type',
              header: t('progression.admin.history.columns.event'),
              render: (event) => (
                <Badge tone={TYPE_TONE[event.type]}>
                  {t(`progression.admin.history.types.${event.type}.${event.kind}`)}
                </Badge>
              ),
            },
            {
              key: 'player',
              header: t('progression.admin.history.columns.player'),
              sortValue: (event) => event.playerName ?? '',
              render: (event) => (
                <span className="ac-cell__text">
                  <span className="ac-cell__title">{event.playerName ?? t('progression.admin.history.unknownPlayer')}</span>
                  {event.wrestlerName && <span className="ac-cell__sub">{event.wrestlerName}</span>}
                </span>
              ),
            },
            {
              key: 'divisions',
              header: t('progression.admin.history.columns.divisions'),
              render: (event) => (
                <span className="ac-cell__text">
                  <span>{route(event)}</span>
                  {event.trackName && <span className="ac-cell__sub">{event.trackName}</span>}
                </span>
              ),
            },
            {
              key: 'actor',
              header: t('progression.admin.history.columns.actor'),
              sortValue: (event) => actorLabel(event),
              render: (event) => actorLabel(event),
            },
          ]}
        />
      )}
    </div>
  );
}
