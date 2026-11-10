import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowRight, Newspaper } from 'lucide-react';
import type { Announcement } from '../../types';
import { formatDate } from '../../utils/dateUtils';
import { excerpt, htmlToText } from '../../utils/htmlText';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import { BREAKING_PRIORITY, useNews } from './useNews';
import './News.css';

const LEAD_EXCERPT_LENGTH = 320;
const CARD_EXCERPT_LENGTH = 160;

function StoryMeta({ story }: { story: Announcement }) {
  const { t } = useTranslation();
  return (
    <p className="news-story__meta">
      {story.priority >= BREAKING_PRIORITY && <Badge tone="pink">{t('news.breaking')}</Badge>}
      <time dateTime={story.createdAt}>{formatDate(story.createdAt)}</time>
    </p>
  );
}

/** The league's news desk: the newest story leads, the rest follow as a grid. */
export default function News() {
  const { t } = useTranslation();
  const { items, loading, failed } = useNews();
  const [lead, ...rest] = items;

  return (
    <div className="news">
      <PageHeader eyebrow={t('news.eyebrow')} title={t('news.title')} subtitle={t('news.subtitle')} />

      {loading && <Skeleton variant="cards" count={3} />}
      {!loading && failed && <p className="news__error" role="alert">{t('news.loadFailed')}</p>}
      {!loading && !failed && !lead && (
        <EmptyState icon={<Newspaper aria-hidden="true" size={48} />} title={t('news.empty.title')} description={t('news.empty.description')} />
      )}

      {lead && (
        <article className="news-lead">
          <p className="news-lead__flag">{t('news.topStory')}</p>
          <StoryMeta story={lead} />
          <h2 className="news-lead__title">
            <Link to={`/news/${lead.announcementId}`}>{lead.title}</Link>
          </h2>
          <p className="news-lead__excerpt">{excerpt(htmlToText(lead.body), LEAD_EXCERPT_LENGTH)}</p>
          <Link to={`/news/${lead.announcementId}`} className="news-story__more">
            {t('news.readStory')}
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </article>
      )}

      {rest.length > 0 && (
        <section aria-labelledby="news-more-heading">
          <h2 id="news-more-heading" className="news__heading">{t('news.moreStories')}</h2>
          <ul className="news-grid">
            {rest.map((story) => (
              <li key={story.announcementId}>
                <article className="news-card">
                  <StoryMeta story={story} />
                  <h3 className="news-card__title">
                    <Link to={`/news/${story.announcementId}`}>{story.title}</Link>
                  </h3>
                  <p className="news-card__excerpt">{excerpt(htmlToText(story.body), CARD_EXCERPT_LENGTH)}</p>
                </article>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
