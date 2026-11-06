import { useEffect, useState } from 'react';

/**
 * Body attributes that keep the announcement and profile-setup modals from
 * stacking. A hidden player's wrestler prompt goes first, because they stay off
 * the site until they answer it. Announcements then go ahead of the rest of
 * the profile checklist.
 */
export const ANNOUNCEMENT_OPEN_ATTR = 'data-announcement-open';
export const WRESTLER_PROMPT_PENDING_ATTR = 'data-wrestler-prompt-pending';

function setBodyAttribute(attribute: string, on: boolean): void {
  if (typeof document === 'undefined') return;
  if (on) document.body.setAttribute(attribute, '1');
  else document.body.removeAttribute(attribute);
}

function useBodyAttribute(attribute: string): boolean {
  const [on, setOn] = useState<boolean>(
    () => typeof document !== 'undefined' && document.body.hasAttribute(attribute),
  );

  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => {
      setOn(document.body.hasAttribute(attribute));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: [attribute] });
    setOn(document.body.hasAttribute(attribute));
    return () => observer.disconnect();
  }, [attribute]);

  return on;
}

export function setAnnouncementOpen(open: boolean): void {
  setBodyAttribute(ANNOUNCEMENT_OPEN_ATTR, open);
}

export function useAnnouncementOpen(): boolean {
  return useBodyAttribute(ANNOUNCEMENT_OPEN_ATTR);
}

/** On while the profile is being checked, or while the wrestler prompt is up. */
export function setWrestlerPromptPending(pending: boolean): void {
  setBodyAttribute(WRESTLER_PROMPT_PENDING_ATTR, pending);
}

export function useWrestlerPromptPending(): boolean {
  return useBodyAttribute(WRESTLER_PROMPT_PENDING_ATTR);
}
