import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';

/** Same-site paths like "/guide/wiki/call-ups"; "//host" is protocol-relative, not internal. */
function isInternalPath(href: string | undefined): href is string {
  return typeof href === 'string' && href.startsWith('/') && !href.startsWith('//');
}

/**
 * The page already has an h1 (Patch Notes) and an h2 per post, so the post's
 * own "##" sections drop one level.
 */
const components: Components = {
  h1: ({ children }) => <h2>{children}</h2>,
  h2: ({ children }) => <h3>{children}</h3>,
  h3: ({ children }) => <h4>{children}</h4>,
  a: ({ href, children }) =>
    isInternalPath(href) ? (
      <Link to={href}>{children}</Link>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
};

export default function PatchNotesMarkdown({ content }: { content: string }) {
  return (
    <div className="wiki-content patch-notes__body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
