import { Children, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import './SwipeRow.css';

export interface SwipeRowProps {
  /** Each child becomes one slide. */
  children: ReactNode;
  /** Names the row for screen readers. */
  label: string;
  className?: string;
}

/**
 * Horizontally swipeable row. Slide width is set with --swipe-row-slide on the
 * row. Arrows appear on devices with a mouse when the row overflows.
 */
export default function SwipeRow({ children, label, className = '' }: SwipeRowProps) {
  const { t } = useTranslation();
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [viewportRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    containScroll: 'trimSnaps',
    dragFree: true,
    duration: prefersReducedMotion ? 0 : 25,
  });
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const syncButtons = useCallback(() => {
    if (!emblaApi) return;
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return undefined;
    syncButtons();
    emblaApi.on('select', syncButtons).on('reInit', syncButtons);
    return () => {
      emblaApi.off('select', syncButtons).off('reInit', syncButtons);
    };
  }, [emblaApi, syncButtons]);

  const slides = Children.toArray(children);

  return (
    <section className={`ui-swipe ${className}`.trim()} aria-roledescription="carousel" aria-label={label}>
      <div className="ui-swipe__viewport" ref={viewportRef}>
        <div className="ui-swipe__track">
          {slides.map((slide, index) => (
            // Keyboard focus moving to a slide brings that slide into view.
            <div key={index} className="ui-swipe__slide" onFocusCapture={() => emblaApi?.scrollTo(index)}>
              {slide}
            </div>
          ))}
        </div>
      </div>
      {(canScrollPrev || canScrollNext) && (
        <div className="ui-swipe__controls">
          <button
            type="button"
            className="ui-swipe__arrow"
            onClick={() => emblaApi?.scrollPrev()}
            disabled={!canScrollPrev}
            aria-label={t('common.previous')}
          >
            <ChevronLeft aria-hidden="true" size={20} />
          </button>
          <button
            type="button"
            className="ui-swipe__arrow"
            onClick={() => emblaApi?.scrollNext()}
            disabled={!canScrollNext}
            aria-label={t('common.next')}
          >
            <ChevronRight aria-hidden="true" size={20} />
          </button>
        </div>
      )}
    </section>
  );
}
