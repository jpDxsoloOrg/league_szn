import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Play } from 'lucide-react';
import { isYoutubeId, youtubeEmbedUrl, youtubeThumbnailUrl, youtubeWatchUrl } from '../../utils/youtube';
import './YouTubeFacade.css';

export interface YouTubeFacadeProps {
  videoId: string;
  title: string;
  thumbnailUrl?: string;
}

/**
 * Click-to-load YouTube player. Shows the thumbnail until the viewer clicks,
 * then swaps in the privacy-enhanced iframe. Plays started here count as
 * YouTube views. "Watch on YouTube" is always available beside it.
 */
export default function YouTubeFacade({ videoId, title, thumbnailUrl }: YouTubeFacadeProps) {
  const { t } = useTranslation();
  const [active, setActive] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (active) iframeRef.current?.focus();
  }, [active]);

  if (!isYoutubeId(videoId)) return null;

  return (
    <div className="yt-facade-wrap">
      {active ? (
        <iframe
          ref={iframeRef}
          className="yt-facade__frame"
          src={youtubeEmbedUrl(videoId)}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
        />
      ) : (
        <button
          type="button"
          className="yt-facade"
          aria-label={t('episodes.play', { title })}
          onClick={() => setActive(true)}
        >
          <img
            className="yt-facade__thumb"
            src={thumbnailUrl ?? youtubeThumbnailUrl(videoId)}
            alt=""
            loading="lazy"
          />
          <span className="yt-facade__play">
            <Play aria-hidden="true" size={32} />
          </span>
        </button>
      )}
      <a
        className="ui-btn ui-btn--secondary ui-btn--sm yt-facade__external"
        href={youtubeWatchUrl(videoId)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ExternalLink aria-hidden="true" size={16} />
        {t('episodes.watchOnYoutube')}
      </a>
    </div>
  );
}
