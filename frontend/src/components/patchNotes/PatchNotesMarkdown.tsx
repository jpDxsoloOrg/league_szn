import { useCallback, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PatchNotesLightbox from './PatchNotesLightbox';
import { collectPatchNotesImages } from './patchNotesImages';
import type { PatchNotesImage } from './patchNotesImages';

/** Same-site paths like "/guide/wiki/call-ups"; "//host" is protocol-relative, not internal. */
function isInternalPath(href: string | undefined): href is string {
  return typeof href === 'string' && href.startsWith('/') && !href.startsWith('//');
}

interface HastLikeNode {
  type: string;
  tagName?: string;
  value?: string;
  children?: HastLikeNode[];
}

/** A paragraph that holds only images (and the line breaks between them) becomes a gallery row. */
function isImageOnlyParagraph(node: HastLikeNode | undefined): boolean {
  const children = node?.children ?? [];
  const content = children.filter((child) => !(child.type === 'text' && (child.value ?? '').trim() === ''));
  return content.length > 0 && content.every((child) => child.type === 'element' && (child.tagName === 'img' || child.tagName === 'br'));
}

function PatchNotesThumbnail({ image, onOpen }: { image: PatchNotesImage; onOpen: (image: PatchNotesImage) => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="patch-notes-thumb" aria-label={t('patchNotes.lightbox.open', { alt: image.alt })} onClick={() => onOpen(image)}>
      <img className="patch-notes-thumb__image" src={image.src} alt={image.alt} loading="lazy" />
      {image.alt && (
        <span className="patch-notes-thumb__caption" aria-hidden="true">
          {image.alt}
        </span>
      )}
    </button>
  );
}

interface OpenImage {
  section: number;
  index: number;
}

export default function PatchNotesMarkdown({ content }: { content: string }) {
  const images = useMemo(() => collectPatchNotesImages(content), [content]);
  const [open, setOpen] = useState<OpenImage | null>(null);

  const sectionImages = useMemo<PatchNotesImage[]>(
    () => (open ? images.filter((image) => image.section === open.section) : []),
    [images, open],
  );

  const handleIndexChange = useCallback((index: number) => setOpen((current) => (current ? { ...current, index } : current)), []);
  const handleClose = useCallback(() => setOpen(null), []);
  const openImage = useCallback(
    (image: PatchNotesImage) => {
      const inSection = images.filter((candidate) => candidate.section === image.section);
      setOpen({ section: image.section, index: inSection.indexOf(image) });
    },
    [images],
  );

  /**
   * The page already has an h1 (Patch Notes) and an h2 per post, so the post's
   * own "##" sections drop one level.
   */
  const components = useMemo<Components>(
    () => ({
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
      p: ({ node, children }) =>
        isImageOnlyParagraph(node as HastLikeNode | undefined) ? <div className="patch-notes-gallery">{children}</div> : <p>{children}</p>,
      img: ({ node, src, alt }) => {
        const offset = node?.position?.start.offset;
        const image = images.find((candidate) => candidate.offset === offset);
        if (!image || typeof src !== 'string') return <img src={src} alt={alt ?? ''} loading="lazy" />;
        return <PatchNotesThumbnail image={image} onOpen={openImage} />;
      },
    }),
    [images, openImage],
  );

  return (
    <div className="wiki-content patch-notes__body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
      <PatchNotesLightbox images={sectionImages} index={open ? open.index : null} onIndexChange={handleIndexChange} onClose={handleClose} />
    </div>
  );
}
