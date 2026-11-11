import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Newspaper } from 'lucide-react';
import { formatDate } from '../../utils/dateUtils';
import { toMediaUrl } from '../../utils/mediaUrl';
import { sanitizeHtml } from '../../utils/sanitizeHtml';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import Skeleton from '../ui/Skeleton';
import { BREAKING_PRIORITY, useNews } from './useNews';
import '../announcementContent.css';
import './News.css';

/** One news story, read in full. */
export default function NewsArticle() {
  const { t } = useTranslation();
  const { newsId } = useParams();
  const { items, loading, failed } = useNews();
  const story = items.find((item) => item.announcementId === newsId);
  useDocumentTitle(story?.title ?? t('nav.news'));

  return (
    <div className="news">
      <Link to="/news" className="news__back">
        <ArrowLeft aria-hidden="true" size={16} />
        {t('news.backToNews')}
      </Link>

      {loading && <Skeleton variant="block" />}
      {!loading && failed && <p className="news__error" role="alert">{t('news.loadFailed')}</p>}
      {!loading && !failed && !story && (
        <EmptyState icon={<Newspaper aria-hidden="true" size={48} />} title={t('news.notFound.title')} description={t('news.notFound.description')} />
      )}

      {story && (
        <article className="news-article">
          <header className="news-article__header">
            <p className="news-story__meta">
              {story.priority >= BREAKING_PRIORITY && <Badge tone="pink">{t('news.breaking')}</Badge>}
              <time dateTime={story.createdAt}>{formatDate(story.createdAt)}</time>
            </p>
            <h1 className="news-article__title">{story.title}</h1>
          </header>
          <div className="news-article__body" dangerouslySetInnerHTML={{ __html: sanitizeHtml(story.body) }} />
          {story.videoUrl && (
            <video controls playsInline preload="metadata" className="news-article__video">
              <source src={toMediaUrl(story.videoUrl)} />
              {t('highlights.videoNotSupported')}
            </video>
          )}
        </article>
      )}
    </div>
  );
}
