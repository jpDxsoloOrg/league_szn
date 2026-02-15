import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './Wiki.css';

interface WikiArticleEntry {
  slug: string;
  titleKey: string;
  file: string;
}

export default function WikiIndex() {
  const { t } = useTranslation();
  const [articles, setArticles] = useState<WikiArticleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return <p className="wiki-loading">{t('common.loading')}</p>;
  }
  if (error) {
    return <p className="wiki-error">{t('common.error')}: {error}</p>;
  }

  return (
    <>
      <h2 className="wiki-index-title">{t('wiki.indexTitle')}</h2>
      <ul className="wiki-index-list">
        {articles.map((entry) => (
          <li key={entry.slug}>
            <Link to={`/guide/wiki/${entry.slug}`}>{t(entry.titleKey)}</Link>
          </li>
        ))}
      </ul>
    </>
  );
}
