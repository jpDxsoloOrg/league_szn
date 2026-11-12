import { useState, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { buildWikiNav, wikiTitle, type WikiArticleEntry } from './wikiNav';
import './Wiki.css';

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

  const navItems = useMemo(
    () => buildWikiNav(articles.filter((a) => !a.adminOnly || isAdminOrModerator)),
    [articles, isAdminOrModerator]
  );

  const renderLink = (entry: WikiArticleEntry, label: string, hasCurrentChild = false) => {
    const isCurrent = currentSlug === entry.slug;
    const stateClass = hasCurrentChild ? 'wiki-sidebar-parent-current' : '';
    return (
      <Link
        to={`/guide/wiki/${entry.slug}`}
        className={isCurrent ? 'wiki-sidebar-current' : stateClass}
        aria-current={isCurrent ? 'page' : undefined}
        onClick={() => setOpen(false)}
      >
        {label}
      </Link>
    );
  };

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
            {navItems.map(({ entry, children }) => (
              <li key={entry.slug}>
                {renderLink(
                  entry,
                  wikiTitle(t, entry),
                  children.some((child) => child.slug === currentSlug)
                )}
                {children.length > 0 && (
                  <ul className="wiki-sidebar-sublist">
                    {children.map((child) => (
                      <li key={child.slug}>
                        {renderLink(child, wikiTitle(t, child, child.navTitleKey))}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
}
