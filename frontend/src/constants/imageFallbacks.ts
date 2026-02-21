import type { SyntheticEvent } from 'react';

export const DEFAULT_WRESTLER_IMAGE = '/images/placeholders/wrestler-default.svg';
export const DEFAULT_CHAMPIONSHIP_IMAGE = '/images/placeholders/championship-default.svg';

export function resolveImageSrc(src: string | null | undefined, fallbackSrc: string): string {
  return src?.trim() ? src : fallbackSrc;
}

export function applyImageFallback(
  event: SyntheticEvent<HTMLImageElement, Event>,
  fallbackSrc: string
): void {
  const imageElement = event.currentTarget;
  if (imageElement.dataset['fallbackApplied'] === 'true') {
    return;
  }

  imageElement.dataset['fallbackApplied'] = 'true';
  imageElement.src = fallbackSrc;
}
