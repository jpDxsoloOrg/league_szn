import { useEffect } from 'react';

const BASE_TITLE = 'League SZN';

function formatTitle(pageTitle: string): string {
  return pageTitle ? `${pageTitle} | ${BASE_TITLE}` : BASE_TITLE;
}

/** The app sets one title per route. A page that knows better overrides it. */
let routeTitle = BASE_TITLE;
const pageTitles: { title: string }[] = [];

function applyTitle(): void {
  document.title = pageTitles[pageTitles.length - 1]?.title ?? routeTitle;
}

/** Default title for the current route, used until or unless a page sets its own. */
export function useRouteTitle(pageTitle: string): void {
  useEffect(() => {
    routeTitle = formatTitle(pageTitle);
    applyTitle();
  }, [pageTitle]);
}

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
    const entry = { title: options?.fullTitle ? pageTitle : formatTitle(pageTitle) };
    pageTitles.push(entry);
    applyTitle();
    return () => {
      pageTitles.splice(pageTitles.indexOf(entry), 1);
      applyTitle();
    };
  }, [pageTitle, options?.fullTitle]);
}
