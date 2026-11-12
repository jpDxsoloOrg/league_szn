import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Fuse from 'fuse.js';
import { ChevronRight, SearchX } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Card from './ui/Card';
import EmptyState from './ui/EmptyState';
import PageHeader from './ui/PageHeader';
import Skeleton from './ui/Skeleton';
import { buildWikiNav, wikiTitle, type WikiArticleEntry } from './wikiNav';
import './Wiki.css';

interface SearchableEntry extends WikiArticleEntry {
  title: string;
}

export default function WikiIndex() {
  const { t } = useTranslation();
  const { isAdminOrModerator } = useAuth();
  const [articles, setArticles] = useState<WikiArticleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const loadIndex = async () => {
      try {
        const res = await fetch('/wiki/index.json');
        if (!res.ok) throw new Error('Failed to load wiki index');
        const data: WikiArticleEntry[] = await res.json();
        setArticles(Array.isArray(data) ? data : []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load wiki index');
        setArticles([]);
      } finally {
        setLoading(false);
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

  const searchableList = useMemo<SearchableEntry[]>(
    () => visibleArticles.map((a) => ({ ...a, title: wikiTitle(t, a) })),
    [visibleArticles, t]
  );

  const fuse = useMemo(
    () =>
      new Fuse(searchableList, {
        keys: ['title'],
        threshold: 0.3,
      }),
    [searchableList]
  );

  const trimmedQuery = query.trim();
  const searchResults = useMemo(
    () => (trimmedQuery ? fuse.search(trimmedQuery).map((r) => r.item) : []),
    [trimmedQuery, fuse]
  );

  // Search results are a flat ranked list, so they keep the full titles.
  const navItems = useMemo(
    () =>
      trimmedQuery
        ? searchResults.map((entry) => ({ entry, children: [] }))
        : buildWikiNav(visibleArticles),
    [trimmedQuery, searchResults, visibleArticles]
  );

  if (loading) {
    return (
      <div className="wiki-loading">
        <Skeleton variant="block" count={4} />
      </div>
    );
  }
  if (error) {
    return <p className="wiki-error">{t('common.error')}: {error}</p>;
  }

  return (
    <>
      <PageHeader title={t('wiki.indexTitle')} />
      <label htmlFor="wiki-search" className="wiki-search-label">
        <span className="sr-only">{t('wiki.searchPlaceholder')}</span>
        <input
          id="wiki-search"
          type="search"
          className="wiki-search-input"
          placeholder={t('wiki.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </label>
      {navItems.length > 0 ? (
        <Card padding="none">
          <ul className="wiki-index-list">
            {navItems.map(({ entry, children }) => (
              <li key={entry.slug}>
                <Link to={`/guide/wiki/${entry.slug}`}>
                  {wikiTitle(t, entry)}
                  <ChevronRight aria-hidden="true" size={18} />
                </Link>
                {children.length > 0 && (
                  <ul className="wiki-index-sublist">
                    {children.map((child) => (
                      <li key={child.slug}>
                        <Link to={`/guide/wiki/${child.slug}`}>
                          {wikiTitle(t, child, child.navTitleKey)}
                          <ChevronRight aria-hidden="true" size={18} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState icon={<SearchX aria-hidden="true" size={32} />} title={t('wiki.noResults')} />
      )}
    </>
  );
}
