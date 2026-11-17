import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Ticker from '../ui/Ticker';
import { useTickerFeed } from '../../hooks/useTickerFeed';
import { feedToTickerItems, isTickerHiddenPath } from './tickerItems';
import './LeagueTicker.css';

/** sessionStorage key: set once the visitor closes the ticker for this visit. */
export const TICKER_DISMISSED_KEY = 'leagueTicker.dismissed';

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(TICKER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function saveDismissed(): void {
  try {
    window.sessionStorage.setItem(TICKER_DISMISSED_KEY, '1');
  } catch {
    // Storage blocked: the ticker stays closed until the page reloads.
  }
}

/**
 * The league's news crawl from `GET /ticker`, under the top bar. It holds its
 * height while the first answer loads so the page does not jump, renders
 * nothing when there is no headline, and stays off admin and sign-in pages.
 * The "×" closes it for the rest of the visit.
 */
export default function LeagueTicker() {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(readDismissed);
  const hiddenHere = isTickerHiddenPath(pathname);
  const { segments, loaded } = useTickerFeed(!hiddenHere && !dismissed);
  const items = useMemo(() => feedToTickerItems(segments, t, i18n), [segments, t, i18n]);

  if (hiddenHere || dismissed) return null;
  if (!loaded) return <div className="league-ticker league-ticker--pending" aria-hidden="true" data-testid="league-ticker-pending" />;
  if (items.length === 0) return null;

  return (
    <Ticker
      className="league-ticker"
      label={t('ticker.label')}
      ariaLabel={t('ticker.ariaLabel')}
      pauseLabel={t('ticker.pause')}
      resumeLabel={t('ticker.resume')}
      dismissLabel={t('ticker.dismiss')}
      onDismiss={() => {
        saveDismissed();
        setDismissed(true);
      }}
      items={items}
    />
  );
}
