import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { videosApi } from '../services/api';
import type { Video, VideoCategory } from '../types';
import { toMediaUrl } from '../utils/mediaUrl';
import Badge from './ui/Badge';
import type { BadgeTone } from './ui/Badge';
import Card from './ui/Card';
import EmptyState from './ui/EmptyState';
import PageHeader from './ui/PageHeader';
import Skeleton from './ui/Skeleton';
import Tabs from './ui/Tabs';
import './Highlights.css';

const CATEGORIES: (VideoCategory | 'all')[] = ['all', 'match', 'highlight', 'promo', 'other'];

const CATEGORY_TONES: Record<VideoCategory, BadgeTone> = {
  match: 'primary',
  highlight: 'pink',
  promo: 'violet',
  other: 'neutral',
};

function VideoCard({ video }: { video: Video }) {
  const { t } = useTranslation();
  const mediaUrl = toMediaUrl(video.videoUrl);
  const posterUrl = video.thumbnailUrl ? toMediaUrl(video.thumbnailUrl) : undefined;

  return (
    <Card padding="none" className="highlight-card">
      <video
        controls
        playsInline
        preload="metadata"
        poster={posterUrl}
        className="highlight-video"
      >
        <source src={mediaUrl} />
        {t('highlights.videoNotSupported')}
      </video>
      <div className="highlight-info">
        <h2 className="highlight-title">{video.title}</h2>
        <div className="highlight-meta">
          <Badge tone={CATEGORY_TONES[video.category]}>{t(`videos.categories.${video.category}`)}</Badge>
          <span className="highlight-date">{new Date(video.createdAt).toLocaleDateString()}</span>
        </div>
        {video.description && <p className="highlight-description">{video.description}</p>}
        {video.tags.length > 0 && <p className="highlight-tags">{video.tags.join(' · ')}</p>}
      </div>
    </Card>
  );
}

export default function Highlights() {
  const { t } = useTranslation();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  // Empty string means the request failed without a usable message.
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<VideoCategory | 'all'>('all');

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

  return (
    <div className="highlights-page">
      <PageHeader title={t('highlights.title')} subtitle={t('highlights.subtitle')} />

      <Tabs
        className="highlights-filters"
        label={t('highlights.title')}
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
            <VideoCard key={video.videoId} video={video} />
          ))}
        </div>
      )}
    </div>
  );
}
