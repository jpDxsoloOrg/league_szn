import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import type { PatchNotesImage } from './patchNotesImages';

interface PatchNotesLightboxProps {
  /** The screenshots of the section that was opened, in post order. */
  images: PatchNotesImage[];
  /** Position in `images` of the one on screen, or null when closed. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/**
 * Full-size screenshot in the shared Modal, which supplies the focus trap,
 * Escape and backdrop close, and returns focus to the thumbnail.
 */
export default function PatchNotesLightbox({ images, index, onIndexChange, onClose }: PatchNotesLightboxProps) {
  const { t } = useTranslation();
  const image = index === null ? undefined : images[index];
  const count = images.length;
  const hasSiblings = count > 1;

  useEffect(() => {
    if (index === null || !hasSiblings) return undefined;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onIndexChange((index + 1) % count);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onIndexChange((index - 1 + count) % count);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [index, count, hasSiblings, onIndexChange]);

  const title = image?.alt || t('patchNotes.lightbox.untitled');

  // Stays mounted while closed so the Modal can hand focus back to the thumbnail.
  return (
    <Modal open={image !== undefined} onClose={onClose} title={title} hideTitle size="lg" className="patch-notes-lightbox">
      {image && index !== null && (
        <>
          <figure className="patch-notes-lightbox__figure">
            <div className="patch-notes-lightbox__stage">
              <img className="patch-notes-lightbox__image" src={image.src} alt={image.alt} />
            </div>
            <figcaption className="patch-notes-lightbox__caption">
              {image.alt && <span>{image.alt}</span>}
              {hasSiblings && (
                <span className="patch-notes-lightbox__count">
                  {t('patchNotes.lightbox.position', { current: index + 1, total: count })}
                </span>
              )}
            </figcaption>
          </figure>
          <button type="button" className="patch-notes-lightbox__close" aria-label={t('patchNotes.lightbox.close')} onClick={onClose}>
            <X aria-hidden="true" size={22} />
          </button>
          {hasSiblings && (
            <>
              <button
                type="button"
                className="patch-notes-lightbox__nav patch-notes-lightbox__nav--prev"
                aria-label={t('patchNotes.lightbox.previous')}
                onClick={() => onIndexChange((index - 1 + count) % count)}
              >
                <ChevronLeft aria-hidden="true" size={26} />
              </button>
              <button
                type="button"
                className="patch-notes-lightbox__nav patch-notes-lightbox__nav--next"
                aria-label={t('patchNotes.lightbox.next')}
                onClick={() => onIndexChange((index + 1) % count)}
              >
                <ChevronRight aria-hidden="true" size={26} />
              </button>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
