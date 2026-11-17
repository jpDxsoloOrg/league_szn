import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  siteConfigApi,
  TICKER_SCROLL_SPEEDS,
  TICKER_SEGMENT_KEYS,
  type TickerScrollSpeed,
  type TickerSegmentKey,
  type TickerSettings,
} from '../../services/api';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import Button from '../ui/Button';
import Card from '../ui/Card';
import AdminNotice from './AdminNotice';
import './adminContent.css';
import './TickerSettingsPanel.css';

const SEGMENT_FALLBACKS: Record<TickerSegmentKey, string> = {
  pinned: 'Pinned GM messages',
  tonight: 'Tonight',
  newChampions: 'New champions',
  potentialCallups: 'Potential call-ups',
  promotionWatch: 'Promotion watch',
  hotRivalries: 'Hot rivalries',
  custom: 'GM messages',
  news: 'News',
  upcomingShows: 'Upcoming shows',
  champions: 'Current champions',
  latestResults: 'Latest results',
};

const SPEED_FALLBACKS: Record<TickerScrollSpeed, string> = {
  slow: 'Slow',
  normal: 'Normal',
  fast: 'Fast',
};

/** Ticker settings on the Feature Management page (TKR-04). */
export default function TickerSettingsPanel() {
  const { t } = useTranslation();
  const { tickerSettings, refreshConfig } = useSiteConfig();
  const [draft, setDraft] = useState<TickerSettings>(tickerSettings);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  // Pick up the saved settings once the site config loads or refreshes.
  useEffect(() => {
    setDraft(tickerSettings);
  }, [tickerSettings]);

  const toggleSegment = (key: TickerSegmentKey) => {
    setDraft((current) => {
      const enabled = current.enabledSegments.includes(key)
        ? current.enabledSegments.filter((segment) => segment !== key)
        : [...current.enabledSegments, key];
      // Keep the feed's order so the saved list reads the same way every time.
      return { ...current, enabledSegments: TICKER_SEGMENT_KEYS.filter((segment) => enabled.includes(segment)) };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setNotice(null);
    try {
      await siteConfigApi.updateTickerSettings(draft);
      await refreshConfig();
      setNotice({ tone: 'success', text: t('adminContent.features.tickerSettings.saved', 'Ticker settings saved.') });
    } catch (err) {
      setNotice({
        tone: 'error',
        text: err instanceof Error ? err.message : t('adminContent.features.tickerSettings.saveFailed', 'Failed to save ticker settings'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="ac-form ticker-settings">
      <div>
        <h2 className="ac-section__title">{t('adminContent.features.tickerSettings.title', 'Ticker Settings')}</h2>
        <p className="ac-section__text">
          {t('adminContent.features.tickerSettings.description', 'Choose what the league ticker shows and how fast it scrolls.')}
        </p>
      </div>

      {notice && <AdminNotice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</AdminNotice>}

      <fieldset className="ac-field ticker-settings__segments">
        <legend className="ac-field__label">{t('adminContent.features.tickerSettings.segmentsLabel', 'Segments')}</legend>
        {TICKER_SEGMENT_KEYS.map((key) => (
          <label className="ac-check" key={key}>
            <input
              type="checkbox"
              checked={draft.enabledSegments.includes(key)}
              onChange={() => toggleSegment(key)}
            />
            {t(`adminContent.features.tickerSettings.segments.${key}`, SEGMENT_FALLBACKS[key])}
          </label>
        ))}
      </fieldset>

      <fieldset className="ac-field ac-choice-group">
        <legend className="ac-field__label">{t('adminContent.features.tickerSettings.speedLabel', 'Scroll speed')}</legend>
        {TICKER_SCROLL_SPEEDS.map((speed) => (
          <label className="ac-check" key={speed}>
            <input
              type="radio"
              name="tickerScrollSpeed"
              value={speed}
              checked={draft.scrollSpeed === speed}
              onChange={() => setDraft((current) => ({ ...current, scrollSpeed: speed }))}
            />
            {t(`adminContent.features.tickerSettings.speeds.${speed}`, SPEED_FALLBACKS[speed])}
          </label>
        ))}
      </fieldset>

      <div className="ac-field">
        <label className="ac-check">
          <input
            type="checkbox"
            checked={draft.publicRelegationWatch}
            onChange={() => setDraft((current) => ({ ...current, publicRelegationWatch: !current.publicRelegationWatch }))}
          />
          {t('adminContent.features.tickerSettings.publicRelegationWatch', 'Show relegation watch to everyone')}
        </label>
        <p className="ac-field__hint">
          {t(
            'adminContent.features.tickerSettings.publicRelegationWatchHint',
            'Off keeps relegation watch and relegation zones visible to GMs only.',
          )}
        </p>
      </div>

      <div className="ac-actions">
        <Button onClick={handleSave} loading={saving}>
          {t('adminContent.features.tickerSettings.save', 'Save Ticker Settings')}
        </Button>
      </div>
    </Card>
  );
}
