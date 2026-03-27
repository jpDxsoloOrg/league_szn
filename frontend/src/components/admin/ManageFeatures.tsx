import { useState } from 'react';
import { siteConfigApi, type SiteFeatures } from '../../services/api';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import './ManageFeatures.css';

const FEATURE_LABELS: Record<keyof SiteFeatures, { name: string; description: string }> = {
  fantasy: {
    name: 'Fantasy League',
    description: 'Fantasy picks, leaderboards, wrestler costs, and dashboard',
  },
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
    name: 'Stables & Tag Teams',
    description: 'Stables, tag teams, group standings, and invitation system',
  },
};

export default function ManageFeatures() {
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
      setError(err instanceof Error ? err.message : 'Failed to update feature');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="manage-features">
      <h2>Feature Management</h2>
      <p className="features-description">
        Toggle site features on or off. Disabled features will be hidden from navigation
        and inaccessible to users. Data continues to be collected while features are disabled.
      </p>

      {error && (
        <div className="error-message" role="alert">
          {error}
          <button onClick={() => setError(null)} className="dismiss-btn">Dismiss</button>
        </div>
      )}

      <div className="features-list">
        {(Object.keys(FEATURE_LABELS) as Array<keyof SiteFeatures>).map((key) => (
          <div key={key} className="feature-card">
            <div className="feature-info">
              <h3>{FEATURE_LABELS[key].name}</h3>
              <p>{FEATURE_LABELS[key].description}</p>
            </div>
            <div className="feature-toggle">
              <button
                className={`toggle-btn ${features[key] ? 'enabled' : 'disabled'}`}
                onClick={() => handleToggle(key)}
                disabled={saving === key}
                aria-label={`${features[key] ? 'Disable' : 'Enable'} ${FEATURE_LABELS[key].name}`}
              >
                {saving === key ? 'Saving...' : features[key] ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
