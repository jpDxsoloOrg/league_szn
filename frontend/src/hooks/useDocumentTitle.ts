import { useEffect } from 'react';

const BASE_TITLE = 'League SZN';

/**
 * Sets the document title for the current page.
 * @param pageTitle - The page-specific title (e.g. "Standings"). Resulting title: "{pageTitle} | League SZN"
 * @param options - If { fullTitle: true }, use pageTitle as the entire title with no suffix.
 */
export function useDocumentTitle(
  pageTitle: string,
  options?: { fullTitle?: boolean }
): void {
  useEffect(() => {
    const previous = document.title;
    document.title = options?.fullTitle
      ? pageTitle
      : pageTitle
        ? `${pageTitle} | ${BASE_TITLE}`
        : BASE_TITLE;
    return () => {
      document.title = previous;
    };
  }, [pageTitle, options?.fullTitle]);
}
