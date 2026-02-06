import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { championshipsApi, contendersApi } from '../../services/api';
import type { Championship } from '../../types';
import type { ChampionshipContenders } from '../../types/contender';
import ContenderCard from './ContenderCard';
import './ContenderRankings.css';

export default function ContenderRankings() {
  const { t } = useTranslation();
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [selectedChampionshipId, setSelectedChampionshipId] = useState<string | null>(null);
  const [contenderData, setContenderData] = useState<ChampionshipContenders | null>(null);
  const [loading, setLoading] = useState(true);
  const [contendersLoading, setContendersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load championships on mount
  useEffect(() => {
    const controller = new AbortController();
    const loadChampionships = async () => {
      try {
        setLoading(true);
        const data = await championshipsApi.getAll(controller.signal);
        const activeChamps = data.filter((c) => c.isActive);
        setChampionships(activeChamps);
        if (activeChamps.length > 0 && activeChamps[0]) {
          setSelectedChampionshipId(activeChamps[0].championshipId);
        }
        setError(null);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Failed to load championships');
        }
      } finally {
        setLoading(false);
      }
    };
    loadChampionships();
    return () => controller.abort();
  }, []);

  // Load contenders when selected championship changes
  useEffect(() => {
    if (!selectedChampionshipId) return;
    const controller = new AbortController();
    const loadContenders = async () => {
      try {
        setContendersLoading(true);
        const data = await contendersApi.getForChampionship(selectedChampionshipId, controller.signal);
        setContenderData(data);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setContenderData(null);
        }
      } finally {
        setContendersLoading(false);
      }
    };
    loadContenders();
    return () => controller.abort();
  }, [selectedChampionshipId]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="contender-rankings">
        <div className="loading-message">{t('common.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="contender-rankings">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  if (championships.length === 0) {
    return (
      <div className="contender-rankings">
        <header className="rankings-header">
          <h2>{t('contenders.title')}</h2>
          <p className="subtitle">{t('contenders.subtitle')}</p>
        </header>
        <div className="empty-state">
          <p>{t('contenders.noData')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="contender-rankings">
      <header className="rankings-header">
        <h2>{t('contenders.title')}</h2>
        <p className="subtitle">{t('contenders.subtitle')}</p>
      </header>

      {/* Championship Selector Tabs */}
      <div className="championship-tabs">
        {championships.map((championship) => (
          <button
            key={championship.championshipId}
            className={`tab ${
              selectedChampionshipId === championship.championshipId ? 'active' : ''
            }`}
            onClick={() => setSelectedChampionshipId(championship.championshipId)}
          >
            {championship.name}
          </button>
        ))}
      </div>

      {contendersLoading ? (
        <div className="loading-message">{t('common.loading')}</div>
      ) : contenderData ? (
        <>
          {/* Current Champion Section */}
          {contenderData.currentChampion && (
            <section className="current-champion-section">
              <h3>{t('contenders.currentChampion')}</h3>
              <div className="champion-card">
                <div className="champion-badge">
                  <span className="trophy-icon">&#127942;</span>
                </div>
                <div className="champion-image">
                  {contenderData.currentChampion.imageUrl ? (
                    <img
                      src={contenderData.currentChampion.imageUrl}
                      alt={contenderData.currentChampion.wrestlerName}
                    />
                  ) : (
                    <div className="placeholder-image">
                      {contenderData.currentChampion.wrestlerName?.charAt(0) || '?'}
                    </div>
                  )}
                </div>
                <div className="champion-info">
                  <h4 className="champion-wrestler-name">
                    {contenderData.currentChampion.wrestlerName}
                  </h4>
                  <p className="champion-player-name">
                    {contenderData.currentChampion.playerName}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Contenders List */}
          <section className="contenders-section">
            <h3>{t('contenders.rankings')}</h3>
            <div className="contenders-list">
              {contenderData.contenders.length === 0 ? (
                <div className="empty-state">
                  <p>{t('contenders.noContenders')}</p>
                  <span className="hint">
                    {t('contenders.noContendersHint', { minMatches: 3 })}
                  </span>
                </div>
              ) : (
                contenderData.contenders.map((contender) => (
                  <ContenderCard key={contender.playerId} contender={contender} />
                ))
              )}
            </div>
          </section>

          {/* Last Calculated */}
          {contenderData.calculatedAt && (
            <footer className="rankings-footer">
              <p className="last-calculated">
                {t('contenders.lastCalculated')}: {formatDate(contenderData.calculatedAt)}
              </p>
            </footer>
          )}
        </>
      ) : (
        <div className="empty-state">
          <p>{t('contenders.noContenders')}</p>
          <span className="hint">
            {t('contenders.noContendersHint', { minMatches: 3 })}
          </span>
        </div>
      )}
    </div>
  );
}
