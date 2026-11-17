import { useTranslation } from 'react-i18next';
import type { Announcement } from '../../types';
import { formatDate } from '../../utils/dateUtils';
import { toMediaUrl } from '../../utils/mediaUrl';
import { sanitizeHtml } from '../../utils/sanitizeHtml';
import Badge from '../ui/Badge';
import { BREAKING_PRIORITY } from './useNews';
import './FeatureStory.css';

/**
 * A news story laid out like a wrestling news site: a wide hero image, a
 * kicker, a big headline and standfirst, a byline, then the body. Body HTML
 * can use the `fs-*` classes (match cards, interview quotes, results list)
 * styled in FeatureStory.css.
 */
export default function FeatureStory({ story }: { story: Announcement }) {
  const { t } = useTranslation();

  return (
    <article className="feature-story">
      {story.heroImageUrl && (
        <figure className="feature-story__hero">
          <img src={toMediaUrl(story.heroImageUrl)} alt={story.heroAlt ?? ''} />
        </figure>
      )}

      <header className="feature-story__header">
        <p className="feature-story__kicker">
          {story.priority >= BREAKING_PRIORITY && <Badge tone="pink">{t('news.breaking')}</Badge>}
          {story.kicker && <span className="feature-story__kicker-label">{story.kicker}</span>}
        </p>
        <h1 className="feature-story__title">{story.title}</h1>
        {story.dek && <p className="feature-story__dek">{story.dek}</p>}
        <p className="feature-story__byline">
          {story.byline && <span className="feature-story__author">{story.byline}</span>}
          <time dateTime={story.createdAt}>{formatDate(story.createdAt)}</time>
        </p>
      </header>

      <div className="feature-story__body" dangerouslySetInnerHTML={{ __html: sanitizeHtml(story.body) }} />

      {story.videoUrl && (
        <video controls playsInline preload="metadata" className="feature-story__video">
          <source src={toMediaUrl(story.videoUrl)} />
          {t('highlights.videoNotSupported')}
        </video>
      )}
    </article>
  );
}
