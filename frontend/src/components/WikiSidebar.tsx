import { useState, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import './Wiki.css';

interface WikiArticleEntry {
  slug: string;
  titleKey: string;
  file: string;
  adminOnly?: boolean;
}

export default function WikiSidebar() {
  const { slug: currentSlug } = useParams<{ slug?: string }>();
  const { t } = useTranslation();
  const { isAdminOrModerator } = useAuth();
  const [articles, setArticles] = useState<WikiArticleEntry[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch('/wiki/index.json')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: WikiArticleEntry[]) => setArticles(Array.isArray(data) ? data : []))
      .catch(() => setArticles([]));
  }, []);

  const visibleArticles = useMemo(
    () =>
      articles.filter((a) => !a.adminOnly || isAdminOrModerator),
    [articles, isAdminOrModerator]
  );

  return (
    <>
      <button
        type="button"
        className="wiki-sidebar-toggle"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={t('wiki.articlesLabel')}
      >
        {t('wiki.articlesLabel')}
      </button>
      <aside
        className={`wiki-sidebar ${open ? 'wiki-sidebar-open' : ''}`}
        aria-label={t('wiki.articlesLabel')}
      >
        <nav>
          <ul className="wiki-sidebar-list">
            {visibleArticles.map((entry) => (
              <li key={entry.slug}>
                <Link
                  to={`/guide/wiki/${entry.slug}`}
                  className={currentSlug === entry.slug ? 'wiki-sidebar-current' : ''}
                  aria-current={currentSlug === entry.slug ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                >
                  {t(entry.titleKey)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      {open ? (
        <div
          className="wiki-sidebar-overlay"
          role="button"
          tabIndex={0}
          aria-label={t('common.close')}
          onClick={() => setOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        />
      ) : null}
    </>
  );
}
