import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Tv } from 'lucide-react';
import type { Video, VideoCategory } from '../../types';
import { toMediaUrl } from '../../utils/mediaUrl';
import Badge from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import Card from '../ui/Card';
import './HighlightsList.css';

const CATEGORY_TONES: Record<VideoCategory, BadgeTone> = {
  match: 'primary',
  highlight: 'pink',
  promo: 'violet',
  other: 'neutral',
};

export interface HighlightVideoCardProps {
  video: Video;
  /** Linked episode, shown as a "From episode" link when known. */
  episode?: { episodeId: string; title: string };
}

/** A site-hosted highlight package with a native player. */
export default function HighlightVideoCard({ video, episode }: HighlightVideoCardProps) {
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
        {episode && (
          <Link className="highlight-episode-link" to={`/episodes/${episode.episodeId}`}>
            <Tv aria-hidden="true" size={16} />
            {t('episodes.fromEpisode', { title: episode.title })}
          </Link>
        )}
        {video.description && <p className="highlight-description">{video.description}</p>}
        {video.tags.length > 0 && <p className="highlight-tags">{video.tags.join(' · ')}</p>}
      </div>
    </Card>
  );
}
