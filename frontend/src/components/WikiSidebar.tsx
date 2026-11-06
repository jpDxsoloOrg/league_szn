import { useState, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
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
    const loadIndex = async () => {
      try {
        const res = await fetch('/wiki/index.json');
        const data: WikiArticleEntry[] = res.ok ? await res.json() : [];
        setArticles(Array.isArray(data) ? data : []);
      } catch {
        setArticles([]);
      }
    };
    void loadIndex();
  }, []);

  const visibleArticles = useMemo(
    () =>
      articles.filter(
        (a) =>
          !a.adminOnly ||
          isAdminOrModerator
      ),
    [articles, isAdminOrModerator]
  );

  const isAdminCurrent =
    currentSlug === 'admin' || (currentSlug?.startsWith('admin-') ?? false);

  return (
    <>
      <button
        type="button"
        className="wiki-sidebar-toggle"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        {t('wiki.articlesLabel')}
        <ChevronDown aria-hidden="true" size={18} />
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
                  className={
                    currentSlug === entry.slug ||
                    (entry.slug === 'admin' && isAdminCurrent)
                      ? 'wiki-sidebar-current'
                      : ''
                  }
                  aria-current={
                    currentSlug === entry.slug ||
                    (entry.slug === 'admin' && isAdminCurrent)
                      ? 'page'
                      : undefined
                  }
                  onClick={() => setOpen(false)}
                >
                  {t(entry.titleKey)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
}
