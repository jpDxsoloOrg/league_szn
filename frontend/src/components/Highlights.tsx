import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { videosApi } from '../services/api';
import type { Video, VideoCategory } from '../types';
import Skeleton from './ui/Skeleton';
import './Highlights.css';

const CATEGORIES: (VideoCategory | 'all')[] = ['all', 'match', 'highlight', 'promo', 'other'];

export default function Highlights() {
  const { t } = useTranslation();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<VideoCategory | 'all'>('all');

  const loadVideos = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const category = selectedCategory === 'all' ? undefined : selectedCategory;
      const data = await videosApi.getPublished(category, signal);
      setVideos(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : t('highlights.loadError'));
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, t]);

  useEffect(() => {
    const controller = new AbortController();
    loadVideos(controller.signal);
    return () => controller.abort();
  }, [loadVideos]);

  return (
    <div className="highlights-page">
      <div className="highlights-header">
        <h1>{t('highlights.title')}</h1>
        <p className="highlights-subtitle">{t('highlights.subtitle')}</p>
      </div>

      <div className="highlights-filters">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat === 'all' ? t('common.all') : t(`videos.categories.${cat}`)}
          </button>
        ))}
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <Skeleton variant="block" count={6} />
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <p>{t('highlights.noVideos')}</p>
        </div>
      ) : (
        <div className="highlights-grid">
          {videos.map((video) => (
            <div key={video.videoId} className="highlight-card">
              <div className="highlight-preview">
                <video
                  src={video.videoUrl}
                  poster={video.thumbnailUrl || undefined}
                  controls
                  playsInline
                  preload="metadata"
                  className="highlight-video"
                >
                  {t('highlights.videoNotSupported')}
                </video>
              </div>
              <div className="highlight-info">
                <h3>{video.title}</h3>
                <div className="highlight-meta">
                  <span className={`category-badge category-${video.category}`}>
                    {t(`videos.categories.${video.category}`)}
                  </span>
                  <span className="highlight-date">
                    {new Date(video.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {video.description && (
                  <p className="highlight-description">{video.description}</p>
                )}
                {video.tags.length > 0 && (
                  <div className="highlight-tags">
                    {video.tags.map((tag) => (
                      <span key={tag} className="tag">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
