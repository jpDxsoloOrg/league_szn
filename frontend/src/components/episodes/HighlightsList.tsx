import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { episodesApi, videosApi } from '../../services/api';
import type { VideoCategory, Video } from '../../types';
import EmptyState from '../ui/EmptyState';
import Skeleton from '../ui/Skeleton';
import Tabs from '../ui/Tabs';
import HighlightVideoCard from './HighlightVideoCard';
import './HighlightsList.css';

const CATEGORIES: (VideoCategory | 'all')[] = ['all', 'match', 'highlight', 'promo', 'other'];

/** The Highlights tab: site-hosted highlight packages, filterable by category. */
export default function HighlightsList() {
  const { t } = useTranslation();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  // Empty string means the request failed without a usable message.
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<VideoCategory | 'all'>('all');
  const [episodeTitles, setEpisodeTitles] = useState<Map<string, string>>(new Map());

  const loadVideos = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(null);
      const category = selectedCategory === 'all' ? undefined : selectedCategory;
      const data = await videosApi.getPublished(category, signal);
      if (!signal?.aborted) setVideos(data);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : '');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    const controller = new AbortController();
    void loadVideos(controller.signal);
    return () => controller.abort();
  }, [loadVideos]);

  // Episode titles for the "From episode" links. Kept apart from the videos
  // fetch: if it fails, the links are hidden and the videos still show.
  useEffect(() => {
    const controller = new AbortController();
    const loadEpisodeTitles = async () => {
      try {
        const episodes = await episodesApi.getPublished(controller.signal);
        if (!controller.signal.aborted) {
          setEpisodeTitles(new Map(episodes.map((episode) => [episode.episodeId, episode.title])));
        }
      } catch {
        // No links; the videos render regardless.
      }
    };
    void loadEpisodeTitles();
    return () => controller.abort();
  }, []);

  const episodeFor = (video: Video) => {
    if (!video.episodeId) return undefined;
    const title = episodeTitles.get(video.episodeId);
    return title ? { episodeId: video.episodeId, title } : undefined;
  };

  return (
    <div className="highlights-list">
      <Tabs
        className="highlights-filters"
        label={t('episodes.tabs.highlights')}
        value={selectedCategory}
        onValueChange={(value) => setSelectedCategory(value as VideoCategory | 'all')}
        items={CATEGORIES.map((category) => ({
          value: category,
          label: category === 'all' ? t('common.all') : t(`videos.categories.${category}`),
        }))}
      />

      {loading && <Skeleton variant="cards" count={6} />}

      {!loading && error !== null && (
        <EmptyState
          title={t('highlights.loadError')}
          description={error || undefined}
          actionLabel={t('common.retry')}
          onAction={() => void loadVideos()}
        />
      )}

      {!loading && error === null && videos.length === 0 && <EmptyState title={t('highlights.noVideos')} />}

      {!loading && error === null && videos.length > 0 && (
        <div className="highlights-grid">
          {videos.map((video) => (
            <HighlightVideoCard key={video.videoId} video={video} episode={episodeFor(video)} />
          ))}
        </div>
      )}
    </div>
  );
}
