import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Play, Tv } from 'lucide-react';
import { episodesApi } from '../../services/api';
import type { Episode } from '../../types';
import { isYoutubeId, youtubeThumbnailUrl } from '../../utils/youtube';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import Skeleton from '../ui/Skeleton';
import { formatAirDate } from './episodeDisplay';
import './EpisodeList.css';

function EpisodeCard({ episode }: { episode: Episode }) {
  const { t, i18n } = useTranslation();
  const thumbnail = isYoutubeId(episode.youtubeVideoId) ? youtubeThumbnailUrl(episode.youtubeVideoId) : undefined;

  return (
    <Card padding="none" className="episode-card" to={`/episodes/${episode.episodeId}`}>
      <span className="episode-card__media">
        {thumbnail && <img className="episode-card__thumb" src={thumbnail} alt="" loading="lazy" />}
        <span className="episode-card__play" aria-hidden="true">
          <Play size={24} />
        </span>
      </span>
      <span className="episode-card__info">
        <span className="episode-card__title">{episode.title}</span>
        <span className="episode-card__meta">
          <span className="episode-card__date">
            <CalendarDays aria-hidden="true" size={16} />
            {t('episodes.airDate', { date: formatAirDate(episode.airDate, i18n.language) })}
          </span>
          {episode.eventId && <Badge tone="primary">{t('episodes.hasEvent')}</Badge>}
        </span>
      </span>
    </Card>
  );
}

/** The Full Episodes tab. Cards link to the episode page, where the player lives. */
export default function EpisodeList() {
  const { t } = useTranslation();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  // Empty string means the request failed without a usable message.
  const [error, setError] = useState<string | null>(null);

  const loadEpisodes = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(null);
      const data = await episodesApi.getPublished(signal);
      if (!signal?.aborted) setEpisodes(data);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : '');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadEpisodes(controller.signal);
    return () => controller.abort();
  }, [loadEpisodes]);

  if (loading) return <Skeleton variant="cards" count={6} />;

  if (error !== null) {
    return (
      <EmptyState
        title={t('episodes.loadError')}
        description={error || undefined}
        actionLabel={t('common.retry')}
        onAction={() => void loadEpisodes()}
      />
    );
  }

  if (episodes.length === 0) {
    return <EmptyState icon={<Tv aria-hidden="true" size={32} />} title={t('episodes.noEpisodes')} />;
  }

  return (
    <div className="episodes-grid">
      {episodes.map((episode) => (
        <EpisodeCard key={episode.episodeId} episode={episode} />
      ))}
    </div>
  );
}
