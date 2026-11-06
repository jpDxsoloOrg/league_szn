const DISMISSED_KEY = 'dismissed_announcements';

/** sessionStorage key for announcements closed with the X or read to the end. */
export const ANNOUNCEMENTS_CLOSED_KEY = 'announcements.closed';

function readIds(storage: Storage, key: string): string[] {
  try {
    const stored: unknown = JSON.parse(storage.getItem(key) || '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function addIds(storage: Storage, key: string, ids: string[]): void {
  const merged = [...new Set([...readIds(storage, key), ...ids])];
  try {
    storage.setItem(key, JSON.stringify(merged));
  } catch {
    // Storage is unavailable, so the announcement shows again next time.
  }
}

/** Ids to hold back: "Don't show again" for good, closed ones for this session. */
export function getHiddenAnnouncementIds(): Set<string> {
  return new Set([...readIds(localStorage, DISMISSED_KEY), ...readIds(sessionStorage, ANNOUNCEMENTS_CLOSED_KEY)]);
}

export function dismissAnnouncement(id: string): void {
  addIds(localStorage, DISMISSED_KEY, [id]);
}

export function closeAnnouncementsForSession(ids: string[]): void {
  addIds(sessionStorage, ANNOUNCEMENTS_CLOSED_KEY, ids);
}
