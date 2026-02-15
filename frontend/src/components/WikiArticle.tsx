import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Components } from 'react-markdown';
import './Wiki.css';

interface WikiArticleEntry {
  slug: string;
  titleKey: string;
  file: string;
}

interface TocItem {
  level: 2 | 3;
  text: string;
  id: string;
}

function slugify(text: string): string {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function parseHeadings(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  const idCount: Record<string, number> = {};
  const lines = markdown.split('\n');
  for (const line of lines) {
    const h2 = /^##\s+(.+)$/.exec(line);
    const h3 = /^###\s+(.+)$/.exec(line);
    if (h2?.[1]) {
      const text = h2[1].trim();
      const baseId = slugify(text) || 'section';
      idCount[baseId] = (idCount[baseId] ?? 0) + 1;
      const id = idCount[baseId]! > 1 ? `${baseId}-${idCount[baseId]}` : baseId;
      items.push({ level: 2, text, id });
    } else if (h3?.[1]) {
      const text = h3[1].trim();
      const baseId = slugify(text) || 'section';
      idCount[baseId] = (idCount[baseId] ?? 0) + 1;
      const id = idCount[baseId]! > 1 ? `${baseId}-${idCount[baseId]}` : baseId;
      items.push({ level: 3, text, id });
    }
  }
  return items;
}

const baseMarkdownComponents: Components = {
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
  const { hasRole } = useAuth();
  const [content, setContent] = useState<string | null>(null);
  const [articles, setArticles] = useState<WikiArticleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const headingIndexRef = useRef(0);
  const tocItems = useMemo(() => (content ? parseHeadings(content) : []), [content]);
  const showToc = tocItems.length >= 2;
  if (content) headingIndexRef.current = 0;
  const wikiMarkdownComponents = useMemo(
    (): Components => ({
      ...baseMarkdownComponents,
      h2: ({ children }) => {
        const id = tocItems[headingIndexRef.current]?.id ?? slugify(String(children));
        headingIndexRef.current += 1;
        return <h2 id={id}>{children}</h2>;
      },
      h3: ({ children }) => {
        const id = tocItems[headingIndexRef.current]?.id ?? slugify(String(children));
        headingIndexRef.current += 1;
        return <h3 id={id}>{children}</h3>;
      },
    }),
    [tocItems]
  );

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

  const repo = import.meta.env['VITE_GITHUB_REPO'] as string | undefined;
  const branch = (import.meta.env['VITE_GITHUB_BRANCH'] as string | undefined) ?? 'main';
  const editUrl =
    repo && slug
      ? `https://github.com/${repo}/edit/${branch}/frontend/public/wiki/${slug}.md`
      : null;
  const showEditLink = editUrl && hasRole('Admin');

  return (
    <article className="wiki-article">
      {showEditLink ? (
        <a
          href={editUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="wiki-edit-link"
        >
          {t('wiki.editThisPage')}
        </a>
      ) : null}
      {showToc ? (
        <nav className="wiki-toc" aria-label={t('wiki.onThisPage')}>
          <button
            type="button"
            className="wiki-toc-toggle"
            onClick={() => setTocOpen((prev) => !prev)}
            aria-expanded={tocOpen}
          >
            {t('wiki.onThisPage')}
          </button>
          <div className={`wiki-toc-list-wrap ${tocOpen ? 'wiki-toc-open' : ''}`}>
            <ul className="wiki-toc-list">
              {tocItems.map((item) => (
                <li key={item.id} className={`wiki-toc-level-${item.level}`}>
                  <a href={`#${item.id}`} onClick={() => setTocOpen(false)}>
                    {item.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      ) : null}
      <div className="wiki-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={wikiMarkdownComponents}>{content}</ReactMarkdown>
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
