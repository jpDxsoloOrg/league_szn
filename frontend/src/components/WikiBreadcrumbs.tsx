import { useState, useEffect } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { wikiTitle } from './wikiNav';

interface WikiArticleEntry {
  slug: string;
  titleKey: string;
  file: string;
  title?: string;
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
    const loadTitle = async () => {
      try {
        const res = await fetch('/wiki/index.json');
        const data: WikiArticleEntry[] = res.ok ? await res.json() : [];
        const entry = Array.isArray(data) ? data.find((e) => e.slug === slug) : undefined;
        setArticleTitle(entry ? wikiTitle(t, entry) : t('wiki.articleNotFound'));
      } catch {
        setArticleTitle(slug);
      }
    };
    void loadTitle();
  }, [slug, t]);

  return (
    <nav
      className="wiki-breadcrumbs"
      aria-label={t('wiki.breadcrumbNav')}
    >
      <ol className="wiki-breadcrumbs-list">
        {/* Help and the wiki index are one page, so the trail starts there. */}
        <li>
          {isIndex ? (
            <span className="wiki-breadcrumbs-current" aria-current="page">
              {t('wiki.breadcrumb.help')}
            </span>
          ) : (
            <Link to="/guide/wiki">{t('wiki.breadcrumb.help')}</Link>
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
