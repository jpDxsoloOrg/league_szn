import type { i18n as I18n, TFunction } from 'i18next';
import type { TickerItem, TickerTagTone } from '../ui/Ticker';
import type { TickerFeedItem, TickerFeedSegment } from '../../services/api';
import { isAdminPath } from '../../config/navConfig';

/** Sign-in pages keep their focus; the ticker stays off them. */
const AUTH_PATHS = ['/login', '/signup', '/forgot-password'];

/** Pill colour for each segment. Unknown segments get the neutral pill. */
const SEGMENT_TONES: Readonly<Record<string, TickerTagTone>> = {
  pinned: 'action',
  tonight: 'action',
  newChampions: 'prestige',
  potentialCallups: 'data',
  promotionWatch: 'data',
  hotRivalries: 'heat',
  custom: 'neutral',
  news: 'neutral',
  upcomingShows: 'data',
  champions: 'prestige',
  latestResults: 'data',
};

/** Admin and sign-in pages show no ticker. */
export function isTickerHiddenPath(pathname: string): boolean {
  return isAdminPath(pathname) || AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Site paths go through the router; GM messages may also link out over http(s). */
function linkFor(href: string | undefined): Pick<TickerItem, 'to' | 'externalHref'> {
  if (!href) return {};
  if (href.startsWith('/') && !href.startsWith('//')) return { to: href };
  if (/^https?:\/\//i.test(href)) return { externalHref: href };
  return {};
}

function itemText(item: TickerFeedItem, t: TFunction, i18n: I18n): string {
  // With the params, so a plural key ("_one"/"_other") counts as present.
  if (item.textKey && i18n.exists(item.textKey, item.textParams)) return t(item.textKey, item.textParams ?? {});
  return item.text;
}

/** The feed's segments as one run of headlines; each headline carries its segment's pill. */
export function feedToTickerItems(segments: TickerFeedSegment[], t: TFunction, i18n: I18n): TickerItem[] {
  return segments.flatMap((segment) => {
    const tag = i18n.exists(segment.labelKey) ? t(segment.labelKey) : undefined;
    const tagTone = SEGMENT_TONES[segment.key] ?? 'neutral';
    return segment.items.map((item, index) => ({
      id: `${segment.key}-${index}`,
      text: itemText(item, t, i18n),
      ...(tag ? { tag, tagTone } : {}),
      ...linkFor(item.href),
    }));
  });
}
