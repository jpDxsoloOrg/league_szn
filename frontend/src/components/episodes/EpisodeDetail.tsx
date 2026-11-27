import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { episodesApi, eventsApi, isApiError } from '../../services/api';
import type { EpisodeDetail as EpisodeDetailData } from '../../types';
import type { EventWithMatches } from '../../types/event';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import EpisodeEventCard from './EpisodeEventCard';
import HighlightVideoCard from './HighlightVideoCard';
import YouTubeFacade from './YouTubeFacade';
import { formatAirDate } from './episodeDisplay';
import './EpisodeDetail.css';

type LoadState = 'loading' | 'ready' | 'notFound' | 'error';

/** One episode: the YouTube player, its event card and its highlight packages. */
export default function EpisodeDetail() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const { t, i18n } = useTranslation();
  const [detail, setDetail] = useState<EpisodeDetailData | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [event, setEvent] = useState<EventWithMatches | null>(null);

  useDocumentTitle(detail?.episode.title ?? t('episodes.detail.pageTitle'));

  const loadEpisode = useCallback(async (signal?: AbortSignal) => {
    if (!episodeId) return;
    try {
      setState('loading');
      const data = await episodesApi.getById(episodeId, signal);
      if (signal?.aborted) return;
      setDetail(data);
      setState('ready');
    } catch (err) {
      if (signal?.aborted) return;
      if (isApiError(err, 404)) {
        setState('notFound');
      } else {
        setErrorMessage(err instanceof Error ? err.message : '');
        setState('error');
      }
    }
  }, [episodeId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadEpisode(controller.signal);
    return () => controller.abort();
  }, [loadEpisode]);

  // The linked event's card. A missing (deleted) or failing event hides the section.
  const eventId = detail?.episode.eventId;
  useEffect(() => {
    setEvent(null);
    if (!eventId) return;
    const controller = new AbortController();
    const loadEvent = async () => {
      try {
        const data = await eventsApi.getById(eventId, controller.signal);
        if (!controller.signal.aborted) setEvent(data);
      } catch {
        // Section stays hidden.
      }
    };
    void loadEvent();
    return () => controller.abort();
  }, [eventId]);

  const backLink = (
    <Button className="episode-detail__back" variant="ghost" size="sm" to="/episodes" icon={<ArrowLeft aria-hidden="true" size={18} />}>
      {t('episodes.detail.back')}
    </Button>
  );

  if (state === 'loading') {
    return (
      <div className="episode-detail">
        {backLink}
        <Skeleton variant="block" />
      </div>
    );
  }

  if (state === 'notFound' || (state === 'ready' && !detail)) {
    return (
      <div className="episode-detail">
        {backLink}
        <EmptyState title={t('episodes.detail.notFound')} />
      </div>
    );
  }

  if (state === 'error' || !detail) {
    return (
      <div className="episode-detail">
        {backLink}
        <EmptyState
          title={t('episodes.detail.loadError')}
          description={errorMessage || undefined}
          actionLabel={t('common.retry')}
          onAction={() => void loadEpisode()}
        />
      </div>
    );
  }

  const { episode, highlights } = detail;
  const subtitle = [
    t('episodes.airDate', { date: formatAirDate(episode.airDate, i18n.language) }),
    episode.channelName,
  ].filter(Boolean).join(' · ');
  const paragraphs = episode.description.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);

  return (
    <div className="episode-detail">
      {backLink}
      <PageHeader title={episode.title} subtitle={subtitle} />

      <div className="episode-detail__player">
        <YouTubeFacade videoId={episode.youtubeVideoId} title={episode.title} thumbnailUrl={episode.thumbnailUrl} />
      </div>

      {paragraphs.length > 0 && (
        <div className="episode-detail__description">
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      )}

      {event && <EpisodeEventCard event={event} />}

      {highlights.length > 0 && (
        <section className="episode-detail__highlights" aria-labelledby="episode-highlights-title">
          <h2 id="episode-highlights-title" className="episode-detail__section-title">{t('episodes.detail.highlights')}</h2>
          <div className="highlights-grid">
            {highlights.map((video) => (
              <HighlightVideoCard key={video.videoId} video={video} headingLevel="h3" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
