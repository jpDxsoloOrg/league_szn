import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { siteConfigApi, type SiteFeatures } from '../../services/api';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import Card from '../ui/Card';
import PageHeader from '../ui/PageHeader';
import AdminNotice from './AdminNotice';
import './adminContent.css';
import './ManageFeatures.css';

const FEATURE_LABELS: Record<keyof SiteFeatures, { name: string; description: string }> = {
  challenges: {
    name: 'Challenges',
    description: 'Wrestler challenge board, issuing and managing challenges',
  },
  promos: {
    name: 'Promos',
    description: 'Promo feed, promo threads, and promo editor',
  },
  contenders: {
    name: 'Contender Rankings',
    description: 'Championship contender rankings and status tracking',
  },
  statistics: {
    name: 'Statistics',
    description: 'Player stats, head-to-head, leaderboards, records, and achievements',
  },
  stables: {
    name: 'Factions & Tag Teams',
    description: 'Factions, tag teams, group standings, and invitation system',
  },
  notifications: {
    name: 'Notifications',
    description: 'Announcements banner and in-app notification bell for users',
  },
  rivalries: {
    name: 'Rivalries',
    description: 'Persistent rivalries hub, messaging threads, and admin moderation',
  },
};

export default function ManageFeatures() {
  const { t } = useTranslation();
  const { features, refreshConfig } = useSiteConfig();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (feature: keyof SiteFeatures) => {
    setSaving(feature);
    setError(null);
    try {
      await siteConfigApi.updateFeatures({ [feature]: !features[feature] });
      await refreshConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminContent.features.updateFailed', 'Failed to update feature'));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="ac-page">
      <PageHeader
        title={t('adminContent.features.title', 'Feature Management')}
        subtitle={t(
          'adminContent.features.subtitle',
          'Toggle site features on or off. Disabled features will be hidden from navigation and inaccessible to users. Data continues to be collected while features are disabled.',
        )}
      />

      {error && <AdminNotice tone="error" onDismiss={() => setError(null)}>{error}</AdminNotice>}

      <Card padding="none">
        <ul className="features-list">
          {(Object.keys(FEATURE_LABELS) as Array<keyof SiteFeatures>).map((key) => {
            const name = t(`adminContent.features.${key}.name`, FEATURE_LABELS[key].name);
            const enabled = features[key];
            return (
              <li key={key} className="features-list__row">
                <div className="ac-cell__text">
                  <h2 className="features-list__name">{name}</h2>
                  <p className="ac-cell__sub features-list__description">
                    {t(`adminContent.features.${key}.description`, FEATURE_LABELS[key].description)}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  className={`feature-switch${enabled ? ' feature-switch--on' : ''}`}
                  onClick={() => handleToggle(key)}
                  disabled={saving === key}
                  aria-label={enabled
                    ? t('adminContent.features.disable', { name, defaultValue: `Disable ${name}` })
                    : t('adminContent.features.enable', { name, defaultValue: `Enable ${name}` })}
                >
                  <span className="feature-switch__track" aria-hidden="true"><span className="feature-switch__thumb" /></span>
                  <span className="feature-switch__label">
                    {saving === key
                      ? t('common.saving', 'Saving...')
                      : enabled
                        ? t('adminContent.features.enabled', 'Enabled')
                        : t('adminContent.features.disabled', 'Disabled')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
