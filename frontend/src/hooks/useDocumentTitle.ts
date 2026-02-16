import { useEffect } from 'react';

const BASE_TITLE = 'League SZN';

/**
 * Sets document.title to "title | League SZN" when provided,
 * or restores BASE_TITLE when title is empty.
 */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} | ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [title]);
}
