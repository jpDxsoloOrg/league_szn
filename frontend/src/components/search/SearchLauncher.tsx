import { Suspense, lazy, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './SearchLauncher.css';

const SiteSearch = lazy(() => import('./SiteSearch'));

export interface SearchLauncherProps {
  /** Icon-only trigger for the mobile header. */
  compact?: boolean;
}

/**
 * Search trigger and Ctrl/Cmd+K shortcut. The dialog and fuse.js load on first
 * use, and it stays mounted afterwards so its data is only fetched once.
 */
export default function SearchLauncher({ compact = false }: SearchLauncherProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setUsed(true);
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleOpen = () => {
    setUsed(true);
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        className={compact ? 'search-launcher search-launcher--compact' : 'search-launcher'}
        onClick={handleOpen}
        aria-label={t('search.open')}
        aria-haspopup="dialog"
      >
        <Search aria-hidden="true" size={compact ? 22 : 18} />
        {!compact && <span className="search-launcher__label">{t('search.launcher')}</span>}
      </button>
      {used && (
        <Suspense fallback={null}>
          <SiteSearch open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
