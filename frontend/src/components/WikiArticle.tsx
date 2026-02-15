import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import './Wiki.css';

export default function WikiArticle() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setError('Missing slug');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/wiki/${slug}.md`)
      .then((res) => {
        if (!res.ok) throw new Error('Article not found');
        return res.text();
      })
      .then((text) => {
        setContent(text);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
        setContent(null);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <p className="wiki-loading">{t('common.loading')}</p>;
  }
  if (error || !content) {
    return <p className="wiki-error">{t('common.error')}: {error ?? 'No content'}</p>;
  }

  return (
    <article className="wiki-article">
      <div className="wiki-content">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </article>
  );
}
