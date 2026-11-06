import { useEffect } from 'react';
import type { RefObject } from 'react';

function updateFade(row: HTMLElement): void {
  const hiddenWidth = row.scrollWidth - row.clientWidth;
  // Sub-pixel layout can leave a fraction of a pixel at either end.
  const atStart = row.scrollLeft <= 1;
  const atEnd = row.scrollLeft >= hiddenWidth - 1;

  if (hiddenWidth <= 1) delete row.dataset['fade'];
  else if (atStart) row.dataset['fade'] = 'end';
  else if (atEnd) row.dataset['fade'] = 'start';
  else row.dataset['fade'] = 'both';
}

/**
 * Marks a sideways-scrolling row with `data-fade` (`start`, `end` or `both`),
 * naming the edges with more to see, so its CSS can fade them as a scroll cue.
 */
export function useScrollFade(rowRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;

    const onChange = () => updateFade(row);
    row.addEventListener('scroll', onChange, { passive: true });
    const observer = new ResizeObserver(onChange);
    observer.observe(row);
    return () => {
      row.removeEventListener('scroll', onChange);
      observer.disconnect();
    };
  }, [rowRef]);

  // Labels change with the language without the row itself resizing.
  useEffect(() => {
    if (rowRef.current) updateFade(rowRef.current);
  });
}
