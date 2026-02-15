import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Components } from 'react-markdown';
import './Wiki.css';

interface WikiArticleEntry {
  slug: string;
  titleKey: string;
  file: string;
}

const wikiMarkdownComponents: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className ?? '');
    if (match) {
      return (
        <SyntaxHighlighter
          style={oneDark}
          language={match[1]}
          PreTag="div"
          customStyle={{ margin: '0.75rem 0', borderRadius: '6px' }}
          codeTagProps={{ style: { fontFamily: 'inherit' } }}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

export default function WikiArticle() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [articles, setArticles] = useState<WikiArticleEntry[]>([]);
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
    const articlesPromise = fetch('/wiki/index.json')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: WikiArticleEntry[]) => (Array.isArray(data) ? data : []))
      .catch(() => []);
    const contentPromise = fetch(`/wiki/${slug}.md`)
      .then((res) => {
        if (!res.ok) throw new Error('Article not found');
        return res.text();
      });
    Promise.all([articlesPromise, contentPromise])
      .then(([articleList, text]) => {
        setArticles(articleList);
        setContent(text);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
        setContent(null);
        setArticles([]);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <p className="wiki-loading">{t('common.loading')}</p>;
  }
  if (error || !content) {
    return <p className="wiki-error">{t('common.error')}: {error ?? 'No content'}</p>;
  }

  const currentIndex = articles.findIndex((a) => a.slug === slug);
  const prevEntry = currentIndex > 0 ? articles[currentIndex - 1] : null;
  const nextEntry = currentIndex >= 0 && currentIndex < articles.length - 1 ? articles[currentIndex + 1] : null;

  return (
    <article className="wiki-article">
      <div className="wiki-content">
        <ReactMarkdown components={wikiMarkdownComponents}>{content}</ReactMarkdown>
      </div>
      {(prevEntry || nextEntry) ? (
        <nav className="wiki-article-nav" aria-label={t('wiki.articleNavLabel')}>
          <div className="wiki-article-nav-inner">
            {prevEntry ? (
              <Link
                to={`/guide/wiki/${prevEntry.slug}`}
                className="wiki-article-nav-prev"
                aria-label={t('wiki.previousArticle', { title: t(prevEntry.titleKey) })}
              >
                {t('wiki.previousArticle', { title: t(prevEntry.titleKey) })}
              </Link>
            ) : (
              <span className="wiki-article-nav-placeholder" aria-hidden="true" />
            )}
            {nextEntry ? (
              <Link
                to={`/guide/wiki/${nextEntry.slug}`}
                className="wiki-article-nav-next"
                aria-label={t('wiki.nextArticle', { title: t(nextEntry.titleKey) })}
              >
                {t('wiki.nextArticle', { title: t(nextEntry.titleKey) })}
              </Link>
            ) : (
              <span className="wiki-article-nav-placeholder" aria-hidden="true" />
            )}
          </div>
        </nav>
      ) : null}
    </article>
  );
}
