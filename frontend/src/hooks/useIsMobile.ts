import { useMediaQuery } from './useMediaQuery';

export const MOBILE_MEDIA_QUERY = '(max-width: 768px)';

/** True at phone widths, the same breakpoint the app shell switches at. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_MEDIA_QUERY);
}
