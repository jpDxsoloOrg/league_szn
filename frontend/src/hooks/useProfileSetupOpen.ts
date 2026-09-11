import { useEffect, useState } from 'react';

/**
 * Body attribute the profile-setup modal sets while it is on screen. The
 * suspension-reinstate modal waits for it to clear so post-login dialogs
 * never stack.
 */
export const PROFILE_SETUP_OPEN_ATTR = 'data-profile-setup-open';

export function setProfileSetupOpen(open: boolean): void {
  if (typeof document === 'undefined') return;
  if (open) document.body.setAttribute(PROFILE_SETUP_OPEN_ATTR, '1');
  else document.body.removeAttribute(PROFILE_SETUP_OPEN_ATTR);
}

export function useProfileSetupOpen(): boolean {
  const [open, setOpen] = useState<boolean>(
    () => typeof document !== 'undefined' && document.body.hasAttribute(PROFILE_SETUP_OPEN_ATTR),
  );

  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => {
      setOpen(document.body.hasAttribute(PROFILE_SETUP_OPEN_ATTR));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: [PROFILE_SETUP_OPEN_ATTR] });
    setOpen(document.body.hasAttribute(PROFILE_SETUP_OPEN_ATTR));
    return () => observer.disconnect();
  }, []);

  return open;
}
