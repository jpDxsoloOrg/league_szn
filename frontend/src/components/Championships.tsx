import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { championshipsApi, playersApi } from '../services/api';
import type { Championship, ChampionshipReign, Player } from '../types';
import './Championships.css';

export default function Championships() {
  const { t } = useTranslation();
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedChampionship, setSelectedChampionship] = useState<string | null>(null);
  const [history, setHistory] = useState<ChampionshipReign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [champData, playerData] = await Promise.all([
        championshipsApi.getAll(),
        playersApi.getAll(),
      ]);
      setChampionships(champData);
      setPlayers(playerData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load championships');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (championshipId: string) => {
    try {
      setLoadingHistory(true);
      const historyData = await championshipsApi.getHistory(championshipId);
      setHistory(historyData);
      setSelectedChampionship(championshipId);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const getPlayerName = (playerId: string | string[]) => {
    if (Array.isArray(playerId)) {
      return playerId.map(id => {
        const player = players.find(p => p.playerId === id);
        return player ? player.name : t('common.unknown');
      }).join(' & ');
    }
    const player = players.find(p => p.playerId === playerId);
    return player ? player.name : t('common.unknown');
  };

  if (loading) {
    return <div className="loading">{t('championships.loading')}</div>;
  }

  if (error) {
    return (
      <div className="error">
        <p>{t('common.error')}: {error}</p>
        <button onClick={loadData}>{t('common.retry')}</button>
      </div>
    );
  }

  if (championships.length === 0) {
    return (
      <div className="empty-state">
        <h2>{t('championships.title')}</h2>
        <p>{t('championships.noChampionships')}</p>
      </div>
    );
  }

  return (
    <div className="championships-container">
      <h2>{t('championships.title')}</h2>

      <div className="championships-grid">
        {championships.map((championship) => (
          <div key={championship.championshipId} className="championship-card">
            {championship.imageUrl ? (
              <div className="championship-image-container">
                <img
                  src={championship.imageUrl}
                  alt={championship.name}
                  className="championship-image"
                />
              </div>
            ) : (
              <div className="championship-image-placeholder">
                <span>{t('common.noImage')}</span>
              </div>
            )}
            <div className="championship-header">
              <h3>{championship.name}</h3>
              <span className="championship-type">
                {championship.type === 'singles' ? t('championships.singles') : t('championships.tagTeam')}
              </span>
            </div>

            <div className="current-champion">
              <label>{t('championships.currentChampion')}:</label>
              <p>
                {championship.currentChampion
                  ? getPlayerName(championship.currentChampion)
                  : t('common.vacant')}
              </p>
            </div>

            <button
              onClick={() => loadHistory(championship.championshipId)}
              className="view-history-btn"
            >
              {t('championships.viewHistory')}
            </button>
          </div>
        ))}
      </div>

      {selectedChampionship && (
        <div className="history-modal">
          <div className="history-content">
            <div className="history-header">
              <h3>
                {championships.find(c => c.championshipId === selectedChampionship)?.name} {t('championships.history')}
              </h3>
              <button
                onClick={() => setSelectedChampionship(null)}
                className="close-btn"
              >
                ×
              </button>
            </div>

            {loadingHistory ? (
              <div className="loading">{t('championships.loadingHistory')}</div>
            ) : history.length === 0 ? (
              <p>{t('championships.noHistory')}</p>
            ) : (
              <div className="history-table-wrapper">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>{t('championships.table.champion')}</th>
                      <th>{t('championships.table.wonDate')}</th>
                      <th>{t('championships.table.lostDate')}</th>
                      <th>{t('championships.table.daysHeld')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((reign, index) => (
                      <tr key={index}>
                        <td className="champion-name">
                          {getPlayerName(reign.champion)}
                        </td>
                        <td>{new Date(reign.wonDate).toLocaleDateString()}</td>
                        <td>
                          {reign.lostDate
                            ? new Date(reign.lostDate).toLocaleDateString()
                            : t('common.current')}
                        </td>
                        <td>
                          {reign.daysHeld !== undefined
                            ? `${reign.daysHeld} ${t('common.days')}`
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
