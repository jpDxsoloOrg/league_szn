import { useState, useEffect } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface WikiArticleEntry {
  slug: string;
  titleKey: string;
  file: string;
}

export default function WikiBreadcrumbs() {
  const { slug } = useParams<{ slug: string }>();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const [articleTitle, setArticleTitle] = useState<string | null>(null);

  const isIndex = pathname === '/guide/wiki' || pathname === '/guide/wiki/';
  const isArticle = Boolean(slug);

  useEffect(() => {
    if (!slug) {
      setArticleTitle(null);
      return;
    }
    fetch('/wiki/index.json')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: WikiArticleEntry[]) => {
        const entry = Array.isArray(data)
          ? data.find((e) => e.slug === slug)
          : undefined;
        setArticleTitle(entry ? t(entry.titleKey) : slug);
      })
      .catch(() => setArticleTitle(slug));
  }, [slug, t]);

  return (
    <nav
      className="wiki-breadcrumbs"
      aria-label={t('wiki.breadcrumbNav')}
    >
      <ol className="wiki-breadcrumbs-list">
        <li>
          <Link to="/guide">{t('wiki.breadcrumb.help')}</Link>
        </li>
        <li>
          {isIndex ? (
            <span className="wiki-breadcrumbs-current" aria-current="page">
              {t('wiki.breadcrumb.wiki')}
            </span>
          ) : (
            <Link to="/guide/wiki">{t('wiki.breadcrumb.wiki')}</Link>
          )}
        </li>
        {isArticle && (
          <li>
            <span className="wiki-breadcrumbs-current" aria-current="page">
              {articleTitle ?? slug}
            </span>
          </li>
        )}
      </ol>
    </nav>
  );
}
