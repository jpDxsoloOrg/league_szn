import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { overallsApi } from '../../services/api';
import type { WrestlerOverallWithPlayer } from '../../types';
import './ManageOveralls.css';

export default function ManageOveralls() {
  const { t } = useTranslation();
  const [overalls, setOveralls] = useState<WrestlerOverallWithPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOveralls();
  }, []);

  const loadOveralls = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await overallsApi.getAllOveralls();
      setOveralls(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load overalls');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">{t('common.loading')}</div>;

  return (
    <div className="manage-overalls">
      <h2>{t('overalls.admin.title')}</h2>
      <p className="overalls-subtitle">{t('overalls.admin.subtitle')}</p>

      {error && <div className="error-message">{error}</div>}

      {overalls.length === 0 ? (
        <p className="no-data">{t('overalls.admin.noData')}</p>
      ) : (
        <table className="overalls-table">
          <thead>
            <tr>
              <th>{t('overalls.admin.player')}</th>
              <th>{t('overalls.admin.wrestler')}</th>
              <th>{t('overalls.admin.mainOverall')}</th>
              <th>{t('overalls.admin.altOverall')}</th>
              <th>{t('overalls.admin.submittedAt')}</th>
            </tr>
          </thead>
          <tbody>
            {overalls.map(entry => (
              <tr key={entry.playerId}>
                <td>{entry.playerName}</td>
                <td>{entry.wrestlerName}</td>
                <td>
                  <span className="overall-badge main-overall">{entry.mainOverall}</span>
                </td>
                <td>
                  {entry.alternateOverall !== undefined ? (
                    <span className="overall-badge alt-overall">{entry.alternateOverall}</span>
                  ) : (
                    <span className="no-alt">—</span>
                  )}
                </td>
                <td>{new Date(entry.submittedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
