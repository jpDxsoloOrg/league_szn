import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Tv } from 'lucide-react';
import { episodesApi, eventsApi, isApiError } from '../../services/api';
import type { CreateEpisodeInput, UpdateEpisodeInput } from '../../services/api';
import type { Episode, YoutubeLookupResult } from '../../types';
import type { LeagueEvent } from '../../types/event';
import { isYoutubeId, youtubeThumbnailUrl, youtubeWatchUrl } from '../../utils/youtube';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Select from '../ui/Select';
import Skeleton from '../ui/Skeleton';
import { formatAirDate, todayAirDate } from '../episodes/episodeDisplay';
import AdminFormModal from './AdminFormModal';
import AdminNotice from './AdminNotice';
import LiveStreamPanel from './LiveStreamPanel';
import useAdminConfirm from './useAdminConfirm';
import './adminContent.css';
import './ManageEpisodes.css';

interface EpisodeForm {
  url: string;
  title: string;
  channelName: string;
  description: string;
  airDate: string;
  /** '' means no event. */
  eventId: string;
  isPublished: boolean;
}

const emptyForm = (): EpisodeForm => ({
  url: '',
  title: '',
  channelName: '',
  description: '',
  airDate: todayAirDate(),
  eventId: '',
  isPublished: false,
});

export default function ManageEpisodes() {
  const { t, i18n } = useTranslation();
  const { confirm, confirmDialog } = useAdminConfirm();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [events, setEvents] = useState<LeagueEvent[]>([]);
  // Without the events list a link cannot be judged missing, so it is kept as is.
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Episode | null>(null);
  const [formData, setFormData] = useState<EpisodeForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [lookup, setLookup] = useState<YoutubeLookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const loadEpisodes = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await episodesApi.getAll(signal);
      if (!signal?.aborted) setEpisodes(data);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : t('episodes.admin.loadError'));
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    const loadAll = async () => {
      // Events only feed the picker and the "missing" badge, so a failure there
      // still leaves the episode list usable.
      const eventsLoad = (async () => {
        try {
          const data = await eventsApi.getAll(undefined, controller.signal);
          if (!controller.signal.aborted) {
            setEvents(data);
            setEventsLoaded(true);
          }
        } catch {
          // Picker shows "No event" only.
        }
      })();
      await Promise.all([loadEpisodes(controller.signal), eventsLoad]);
      if (!controller.signal.aborted) setLoading(false);
    };
    void loadAll();
    return () => controller.abort();
  }, [loadEpisodes]);

  const eventsById = useMemo(() => new Map(events.map((event) => [event.eventId, event])), [events]);
  const eventOptions = useMemo(() => [
    { value: '', label: t('episodes.admin.fields.noEvent') },
    ...[...events]
      .sort((first, second) => second.date.localeCompare(first.date))
      .map((event) => ({
        value: event.eventId,
        label: `${event.name} (${new Date(event.date).toLocaleDateString(i18n.language)})`,
      })),
  ], [events, i18n.language, t]);

  const update = <Key extends keyof EpisodeForm>(key: Key, value: EpisodeForm[Key]) => {
    setFormData((current) => ({ ...current, [key]: value }));
  };

  const resetLookup = () => {
    setLookup(null);
    setLookupError(null);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditing(null);
    setFormData(emptyForm());
    setFormError(null);
    resetLookup();
  };

  const handleAdd = () => {
    handleCancel();
    setShowForm(true);
  };

  const handleEdit = (episode: Episode) => {
    resetLookup();
    setFormError(null);
    setEditing(episode);
    setFormData({
      url: youtubeWatchUrl(episode.youtubeVideoId),
      title: episode.title,
      channelName: episode.channelName ?? '',
      description: episode.description ?? '',
      airDate: episode.airDate,
      // A link to a deleted event shows as "No event" and is cleared on save.
      eventId: episode.eventId && (!eventsLoaded || eventsById.has(episode.eventId)) ? episode.eventId : '',
      isPublished: episode.isPublished,
    });
    setShowForm(true);
  };

  const handleLookup = async () => {
    setLookupError(null);
    const url = formData.url.trim();
    if (!url) {
      setLookupError(t('episodes.admin.urlRequired'));
      return;
    }
    setLookingUp(true);
    try {
      const result = await episodesApi.lookup(url);
      setLookup(result);
      setFormData((current) => ({
        ...current,
        title: result.title || current.title,
        channelName: result.channelName ?? '',
      }));
    } catch (err) {
      setLookup(null);
      setLookupError(isApiError(err, 400) ? t('episodes.admin.invalidUrl') : (err instanceof Error ? err.message : t('episodes.admin.invalidUrl')));
    } finally {
      setLookingUp(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setError(null);
    setSuccessMsg(null);

    const url = formData.url.trim();
    const title = formData.title.trim();
    if (!url) {
      setFormError(t('episodes.admin.urlRequired'));
      return;
    }
    if (!title) {
      setFormError(t('episodes.admin.titleRequired'));
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const patch: UpdateEpisodeInput = {
          title,
          description: formData.description,
          airDate: formData.airDate,
          eventId: formData.eventId || null,
          isPublished: formData.isPublished,
        };
        if (url !== youtubeWatchUrl(editing.youtubeVideoId)) patch.url = url;
        if (lookup) patch.channelName = formData.channelName;
        await episodesApi.update(editing.episodeId, patch);
        setSuccessMsg(t('episodes.admin.updateSuccess'));
      } else {
        const input: CreateEpisodeInput = {
          url,
          title,
          description: formData.description,
          airDate: formData.airDate,
          isPublished: formData.isPublished,
        };
        if (formData.channelName) input.channelName = formData.channelName;
        if (formData.eventId) input.eventId = formData.eventId;
        await episodesApi.create(input);
        setSuccessMsg(t('episodes.admin.createSuccess'));
      }
      handleCancel();
      await loadEpisodes();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('episodes.admin.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (episode: Episode) => {
    const confirmed = await confirm({ title: t('episodes.admin.confirmDelete'), confirmLabel: t('common.delete') });
    if (!confirmed) return;
    setDeleting(episode.episodeId);
    setError(null);
    setSuccessMsg(null);
    try {
      await episodesApi.delete(episode.episodeId);
      setSuccessMsg(t('episodes.admin.deleteSuccess'));
      await loadEpisodes();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('episodes.admin.deleteError'));
    } finally {
      setDeleting(null);
    }
  };

  const duplicateOf = lookup?.existingEpisodeId && lookup.existingEpisodeId !== editing?.episodeId
    ? lookup.existingEpisodeId
    : null;
  const title = t('episodes.admin.title');

  if (loading) {
    return (
      <div className="ac-page">
        <PageHeader title={title} />
        <Skeleton variant="table" />
      </div>
    );
  }

  return (
    <div className="ac-page">
      <PageHeader
        title={title}
        actions={(
          <Button icon={<Plus aria-hidden="true" size={18} />} onClick={handleAdd}>
            {t('episodes.admin.add')}
          </Button>
        )}
      />

      <LiveStreamPanel />

      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {successMsg && <AdminNotice tone="success">{successMsg}</AdminNotice>}

      <section className="ac-section">
        <h2 className="ac-section__title">{t('episodes.admin.allEpisodes')} ({episodes.length})</h2>
        <DataTable
          caption={t('episodes.admin.allEpisodes')}
          density="dense"
          rows={episodes}
          rowKey={(episode) => episode.episodeId}
          empty={<EmptyState icon={<Tv aria-hidden="true" size={32} />} title={t('episodes.admin.noEpisodes')} />}
          columns={[
            {
              key: 'title',
              header: t('episodes.admin.fields.title'),
              render: (episode) => (
                <span className="ac-cell">
                  {isYoutubeId(episode.youtubeVideoId) ? (
                    <img src={youtubeThumbnailUrl(episode.youtubeVideoId)} alt="" className="ac-thumb" loading="lazy" />
                  ) : (
                    <span className="ac-thumb ac-thumb--placeholder"><Tv aria-hidden="true" size={18} /></span>
                  )}
                  <span className="ac-cell__text">
                    <span className="ac-cell__title">{episode.title}</span>
                    {episode.channelName && <span className="ac-cell__sub">{episode.channelName}</span>}
                  </span>
                </span>
              ),
              sortValue: (episode) => episode.title,
            },
            {
              key: 'airDate',
              header: t('episodes.admin.fields.airDate'),
              render: (episode) => formatAirDate(episode.airDate, i18n.language),
              sortValue: (episode) => episode.airDate,
            },
            {
              key: 'event',
              header: t('episodes.admin.fields.event'),
              render: (episode) => {
                if (!episode.eventId) return '—';
                const linked = eventsById.get(episode.eventId);
                if (linked) return linked.name;
                return eventsLoaded ? <Badge tone="warning">{t('episodes.admin.eventMissing')}</Badge> : '…';
              },
            },
            {
              key: 'status',
              header: t('adminContent.status', 'Status'),
              render: (episode) => (
                <Badge tone={episode.isPublished ? 'win' : 'neutral'}>
                  {episode.isPublished ? t('videos.published') : t('videos.draft')}
                </Badge>
              ),
            },
            {
              key: 'actions',
              header: t('common.actions'),
              align: 'end',
              render: (episode) => (
                <div className="ac-actions ac-actions--end">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(episode)}>{t('common.edit')}</Button>
                  <Button variant="ghost" size="sm" loading={deleting === episode.episodeId} onClick={() => void handleDelete(episode)}>
                    {t('common.delete')}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </section>

      <AdminFormModal
        open={showForm}
        onClose={handleCancel}
        title={editing ? t('episodes.admin.edit') : t('episodes.admin.add')}
        submitLabel={t('episodes.admin.save')}
        onSubmit={(event) => void handleSubmit(event)}
        busy={saving}
        error={formError}
      >
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="episode-url">{t('episodes.admin.youtubeUrl')}</label>
          <div className="episode-lookup">
            <input
              id="episode-url"
              type="text"
              inputMode="url"
              autoComplete="off"
              value={formData.url}
              placeholder="https://www.youtube.com/watch?v=…"
              aria-describedby={lookupError ? 'episode-url-error' : undefined}
              onChange={(event) => {
                update('url', event.target.value);
                resetLookup();
              }}
            />
            <Button
              variant="secondary"
              loading={lookingUp}
              icon={<Search aria-hidden="true" size={18} />}
              onClick={() => void handleLookup()}
            >
              {t('episodes.admin.fetchDetails')}
            </Button>
          </div>
          {lookupError && <p id="episode-url-error" className="episode-lookup__error" role="alert">{lookupError}</p>}
        </div>

        {lookup && (
          <div className="episode-lookup__preview">
            <img src={youtubeThumbnailUrl(lookup.youtubeVideoId)} alt="" className="episode-lookup__thumb" />
            <div className="episode-lookup__text">
              {lookup.title && <span className="ac-cell__title">{lookup.title}</span>}
              {lookup.channelName && (
                <span className="ac-cell__sub">{t('episodes.admin.channel', { name: lookup.channelName })}</span>
              )}
            </div>
          </div>
        )}
        {lookup && !lookup.oembedAvailable && <AdminNotice tone="warning">{t('episodes.admin.oembedUnavailable')}</AdminNotice>}
        {duplicateOf && <AdminNotice tone="warning">{t('episodes.admin.duplicate')}</AdminNotice>}

        <div className="ac-field">
          <label className="ac-field__label" htmlFor="episode-title">{t('episodes.admin.fields.title')}</label>
          <input
            id="episode-title"
            type="text"
            value={formData.title}
            maxLength={200}
            required
            onChange={(event) => update('title', event.target.value)}
          />
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="episode-description">{t('episodes.admin.fields.description')}</label>
          <textarea
            id="episode-description"
            value={formData.description}
            maxLength={5000}
            rows={4}
            onChange={(event) => update('description', event.target.value)}
          />
        </div>
        <div className="ac-form__row">
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="episode-air-date">{t('episodes.admin.fields.airDate')}</label>
            <input
              id="episode-air-date"
              type="date"
              value={formData.airDate}
              required
              onChange={(event) => update('airDate', event.target.value)}
            />
          </div>
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="episode-event">{t('episodes.admin.fields.event')}</label>
            <Select
              id="episode-event"
              label={t('episodes.admin.fields.event')}
              value={formData.eventId}
              onValueChange={(value) => update('eventId', value)}
              options={eventOptions}
            />
          </div>
        </div>
        <label className="ac-check">
          <input
            type="checkbox"
            checked={formData.isPublished}
            onChange={(event) => update('isPublished', event.target.checked)}
          />
          {t('episodes.admin.fields.published')}
        </label>
        <p className="ac-field__hint">{t('episodes.admin.highlightsHint')}</p>
      </AdminFormModal>

      {confirmDialog}
    </div>
  );
}
