import { useEffect, useState } from 'react';

/**
 * Body attribute the announcement modal sets while it is on screen. The
 * profile-setup modal waits for it to clear so the two never stack.
 */
export const ANNOUNCEMENT_OPEN_ATTR = 'data-announcement-open';

export function setAnnouncementOpen(open: boolean): void {
  if (typeof document === 'undefined') return;
  if (open) document.body.setAttribute(ANNOUNCEMENT_OPEN_ATTR, '1');
  else document.body.removeAttribute(ANNOUNCEMENT_OPEN_ATTR);
}

export function useAnnouncementOpen(): boolean {
  const [open, setOpen] = useState<boolean>(
    () => typeof document !== 'undefined' && document.body.hasAttribute(ANNOUNCEMENT_OPEN_ATTR),
  );

  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => {
      setOpen(document.body.hasAttribute(ANNOUNCEMENT_OPEN_ATTR));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: [ANNOUNCEMENT_OPEN_ATTR] });
    setOpen(document.body.hasAttribute(ANNOUNCEMENT_OPEN_ATTR));
    return () => observer.disconnect();
  }, []);

  return open;
}
