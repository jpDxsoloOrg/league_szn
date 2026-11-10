import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Ticker from '../ui/Ticker';
import { useLeaguePulse } from '../../hooks/useLeaguePulse';
import { buildTickerItems } from './tickerItems';
import './LeagueTicker.css';

/** The league's news crawl, docked along the bottom of the shell. Renders nothing until there is a headline. */
export default function LeagueTicker() {
  const { t, i18n } = useTranslation();
  const pulse = useLeaguePulse();
  const items = useMemo(() => buildTickerItems(pulse, t, i18n.language), [pulse, t, i18n.language]);

  return (
    <Ticker
      className="league-ticker"
      label={t('ticker.label')}
      ariaLabel={t('ticker.ariaLabel')}
      pauseLabel={t('ticker.pause')}
      resumeLabel={t('ticker.resume')}
      items={items}
    />
  );
}
