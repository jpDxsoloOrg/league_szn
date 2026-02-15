import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Components } from 'react-markdown';
import './Wiki.css';

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
        <ReactMarkdown components={wikiMarkdownComponents}>{content}</ReactMarkdown>
      </div>
    </article>
  );
}
