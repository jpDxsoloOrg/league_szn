import { useState, useEffect, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { seasonAwardsApi, seasonsApi, playersApi } from '../../services/api';
import type { SeasonAwardsResponse } from '../../services/api';
import type { Season, Player, SeasonAward } from '../../types';
import './ManageSeasonAwards.css';

export default function ManageSeasonAwards() {
  const { t } = useTranslation();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [awardsData, setAwardsData] = useState<SeasonAwardsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAwards, setLoadingAwards] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', playerId: '', description: '' });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedSeasonId) {
      loadAwards(selectedSeasonId);
    } else {
      setAwardsData(null);
    }
  }, [selectedSeasonId]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [seasonsData, playersData] = await Promise.all([
        seasonsApi.getAll(),
        playersApi.getAll(),
      ]);
      setSeasons(seasonsData);
      setPlayers(playersData);
      if (seasonsData.length > 0) {
        setSelectedSeasonId(seasonsData[0].seasonId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadAwards = async (seasonId: string) => {
    try {
      setLoadingAwards(true);
      const data = await seasonAwardsApi.getAll(seasonId);
      setAwardsData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load awards');
    } finally {
      setLoadingAwards(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedSeasonId || !formData.name || !formData.playerId) return;

    try {
      setError(null);
      await seasonAwardsApi.create(selectedSeasonId, {
        name: formData.name,
        playerId: formData.playerId,
        description: formData.description || undefined,
      });
      setSuccessMsg(t('seasonAwards.admin.createSuccess'));
      setFormData({ name: '', playerId: '', description: '' });
      setShowForm(false);
      await loadAwards(selectedSeasonId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create award');
    }
  };

  const handleDelete = async (award: SeasonAward) => {
    if (!window.confirm(t('seasonAwards.admin.confirmDelete', { name: award.name }))) return;

    try {
      setError(null);
      await seasonAwardsApi.delete(award.seasonId, award.awardId);
      setSuccessMsg(t('seasonAwards.admin.deleteSuccess'));
      await loadAwards(selectedSeasonId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete award');
    }
  };

  if (loading) return <div className="loading">{t('common.loading')}</div>;

  return (
    <div className="manage-season-awards">
      <h2>{t('seasonAwards.admin.title')}</h2>

      {error && <div className="error-message">{error}</div>}
      {successMsg && <div className="success-message">{successMsg}</div>}

      <div className="season-selector">
        <label htmlFor="season-select">{t('seasonAwards.admin.selectSeason')}</label>
        <select
          id="season-select"
          value={selectedSeasonId}
          onChange={e => setSelectedSeasonId(e.target.value)}
        >
          <option value="">{t('seasonAwards.admin.chooseSeason')}</option>
          {seasons.map(s => (
            <option key={s.seasonId} value={s.seasonId}>
              {s.name} ({s.status})
            </option>
          ))}
        </select>
      </div>

      {selectedSeasonId && (
        <>
          <button
            className="btn btn-primary"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? t('common.cancel') : t('seasonAwards.admin.createAward')}
          </button>

          {showForm && (
            <form className="award-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="award-name">{t('seasonAwards.admin.awardName')}</label>
                <input
                  id="award-name"
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="award-player">{t('seasonAwards.admin.awardPlayer')}</label>
                <select
                  id="award-player"
                  value={formData.playerId}
                  onChange={e => setFormData({ ...formData, playerId: e.target.value })}
                  required
                >
                  <option value="">{t('seasonAwards.admin.choosePlayer')}</option>
                  {players.map(p => (
                    <option key={p.playerId} value={p.playerId}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="award-description">{t('seasonAwards.admin.description')}</label>
                <input
                  id="award-description"
                  type="text"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <button type="submit" className="btn btn-success">
                {t('seasonAwards.admin.createAward')}
              </button>
            </form>
          )}

          {loadingAwards ? (
            <div className="loading">{t('common.loading')}</div>
          ) : awardsData ? (
            <div className="awards-list">
              {awardsData.autoAwards.length > 0 && (
                <div className="awards-section">
                  <h3>{t('seasonAwards.autoAwards')}</h3>
                  <table className="awards-table">
                    <thead>
                      <tr>
                        <th>{t('seasonAwards.admin.awardName')}</th>
                        <th>{t('seasonAwards.admin.awardPlayer')}</th>
                        <th>{t('seasonAwards.admin.value')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {awardsData.autoAwards.map(award => (
                        <tr key={award.awardId}>
                          <td>{award.name}</td>
                          <td>{award.playerName}</td>
                          <td>{(award as Record<string, unknown>).value as string}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {awardsData.customAwards.length > 0 && (
                <div className="awards-section">
                  <h3>{t('seasonAwards.customAwards')}</h3>
                  <table className="awards-table">
                    <thead>
                      <tr>
                        <th>{t('seasonAwards.admin.awardName')}</th>
                        <th>{t('seasonAwards.admin.awardPlayer')}</th>
                        <th>{t('seasonAwards.admin.description')}</th>
                        <th>{t('common.delete')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {awardsData.customAwards.map(award => (
                        <tr key={award.awardId}>
                          <td>{award.name}</td>
                          <td>{award.playerName}</td>
                          <td>{award.description || '-'}</td>
                          <td>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDelete(award)}
                            >
                              {t('common.delete')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {awardsData.autoAwards.length === 0 && awardsData.customAwards.length === 0 && (
                <p className="no-awards">{t('seasonAwards.noAwards')}</p>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
