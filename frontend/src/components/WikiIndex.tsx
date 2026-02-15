import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Fuse from 'fuse.js';
import './Wiki.css';

interface WikiArticleEntry {
  slug: string;
  titleKey: string;
  file: string;
}

interface SearchableEntry extends WikiArticleEntry {
  title: string;
}

export default function WikiIndex() {
  const { t } = useTranslation();
  const [articles, setArticles] = useState<WikiArticleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/wiki/index.json')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load wiki index');
        return res.json();
      })
      .then((data: WikiArticleEntry[]) => {
        setArticles(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
        setArticles([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const searchableList = useMemo<SearchableEntry[]>(
    () => articles.map((a) => ({ ...a, title: t(a.titleKey) })),
    [articles, t]
  );

  const fuse = useMemo(
    () =>
      new Fuse(searchableList, {
        keys: ['title'],
        threshold: 0.3,
      }),
    [searchableList]
  );

  const filteredArticles = useMemo(() => {
    const q = query.trim();
    if (!q) return articles;
    const results = fuse.search(q);
    return results.map((r) => r.item);
  }, [query, articles, fuse]);

  if (loading) {
    return <p className="wiki-loading">{t('common.loading')}</p>;
  }
  if (error) {
    return <p className="wiki-error">{t('common.error')}: {error}</p>;
  }

  return (
    <>
      <h2 className="wiki-index-title">{t('wiki.indexTitle')}</h2>
      <label htmlFor="wiki-search" className="wiki-search-label">
        <span className="visually-hidden">{t('wiki.searchPlaceholder')}</span>
        <input
          id="wiki-search"
          type="search"
          className="wiki-search-input"
          placeholder={t('wiki.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('wiki.searchPlaceholder')}
          autoComplete="off"
        />
      </label>
      {filteredArticles.length > 0 ? (
        <ul className="wiki-index-list">
          {filteredArticles.map((entry) => (
            <li key={entry.slug}>
              <Link to={`/guide/wiki/${entry.slug}`}>{t(entry.titleKey)}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="wiki-search-no-results" role="status">
          {t('wiki.noResults')}
        </p>
      )}
    </>
  );
}
