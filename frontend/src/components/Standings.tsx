import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { standingsApi, seasonsApi, divisionsApi } from '../services/api';
import { logger } from '../utils/logger';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { Standings as StandingsType, Season, Division, Player } from '../types';
import PlayerHoverCard from './PlayerHoverCard';
import DivisionFilter from './DivisionFilter';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';
import {
  DEFAULT_WRESTLER_IMAGE,
  applyImageFallback,
  resolveImageSrc,
} from '../constants/imageFallbacks';
import './Standings.css';

export default function Standings() {
  const { t } = useTranslation();
  useDocumentTitle(t('standings.title'));
  const navigate = useNavigate();
  const [standings, setStandings] = useState<StandingsType | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reload standings when retry button is clicked
  const loadStandings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await standingsApi.get(selectedSeasonId || undefined);
      setStandings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load standings');
    } finally {
      setLoading(false);
    }
  }, [selectedSeasonId]);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchInitialData = async () => {
      try {
        const [seasonsData, divisionsData] = await Promise.all([
          seasonsApi.getAll(abortController.signal),
          divisionsApi.getAll(abortController.signal),
        ]);
        if (!abortController.signal.aborted) {
          setSeasons(seasonsData);
          setDivisions(divisionsData);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Failed to load initial standings data');
        }
      }
    };

    fetchInitialData();
    return () => abortController.abort();
  }, []);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchStandings = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await standingsApi.get(selectedSeasonId || undefined, abortController.signal);
        if (!abortController.signal.aborted) {
          setStandings(data);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message || 'Failed to load standings');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchStandings();
    return () => abortController.abort();
  }, [selectedSeasonId]);

  // Memoize filtered players to avoid recalculation on every render
  const filteredPlayers = useMemo((): Player[] => {
    if (!standings) return [];

    if (selectedDivision === 'all') {
      return standings.players;
    }

    if (selectedDivision === 'none') {
      return standings.players.filter(p => !p.divisionId);
    }

    return standings.players.filter(p => p.divisionId === selectedDivision);
  }, [standings, selectedDivision]);

  // Memoize player data with calculated win percentages
  const playersWithStats = useMemo(() => {
    return filteredPlayers.map(player => {
      const totalMatches = player.wins + player.losses + player.draws;
      const winPercentage = totalMatches > 0
        ? ((player.wins / totalMatches) * 100).toFixed(1)
        : '0.0';
      return { ...player, winPercentage };
    });
  }, [filteredPlayers]);

  const getDivisionName = useCallback((divisionId?: string) => {
    if (!divisionId) return null;
    const division = divisions.find(d => d.divisionId === divisionId);
    return division?.name || null;
  }, [divisions]);

  const getSeasonName = useCallback(() => {
    if (!selectedSeasonId) return t('standings.allTime');
    const season = seasons.find(s => s.seasonId === selectedSeasonId);
    return season ? season.name : t('standings.allTime');
  }, [selectedSeasonId, seasons, t]);

  if (loading) {
    return <Skeleton variant="table" className="standings-skeleton" />;
  }

  if (error) {
    return (
      <div className="error">
        <p>{t('common.error')}: {error}</p>
        <button onClick={loadStandings}>{t('common.retry')}</button>
      </div>
    );
  }

  if (!standings || standings.players.length === 0) {
    return (
      <EmptyState
        title={t('standings.pageTitle')}
        description={t('standings.noPlayers')}
      />
    );
  }

  return (
    <div className="standings-container">
      <div className="standings-header">
        <h2>{t('standings.title')}</h2>
        {seasons.length > 0 && (
          <div className="season-selector">
            <label htmlFor="season-select">{t('standings.season')}:</label>
            <select
              id="season-select"
              value={selectedSeasonId}
              onChange={(e) => setSelectedSeasonId(e.target.value)}
            >
              <option value="">{t('standings.allTime')}</option>
              {seasons.map((season) => (
                <option key={season.seasonId} value={season.seasonId}>
                  {season.name} {season.status === 'active' ? `(${t('common.active')})` : ''}
                </option>
              ))}
            </select>
            <span className="season-selector-help">
              {t(
                'standings.seasonHelp',
                'Choose a season for season-only standings, or All-Time for overall records.'
              )}
            </span>
          </div>
        )}
      </div>

      {selectedSeasonId && (
        <div className="season-badge">
          {t('standings.showingFor')}: <strong>{getSeasonName()}</strong>
        </div>
      )}

      {divisions.length > 0 && (
        <DivisionFilter
          divisions={divisions}
          selectedDivision={selectedDivision}
          onSelect={setSelectedDivision}
          labelKey="standings.filterByDivision"
          showNoDivision
        />
      )}

      <div className="standings-table-wrapper">
        <table className="standings-table">
          <thead>
            <tr>
              <th>{t('standings.table.rank')}</th>
              <th className="image-header">{t('standings.table.image')}</th>
              <th>{t('standings.table.player')}</th>
              <th>{t('standings.table.wrestler')}</th>
              <th>{t('standings.table.psn')}</th>
              {selectedDivision === 'all' && <th>{t('standings.table.division')}</th>}
              <th>{t('standings.table.wins')}</th>
              <th>{t('standings.table.losses')}</th>
              <th>{t('standings.table.draws')}</th>
              <th>{t('standings.table.winPercent')}</th>
              <th>{t('standings.table.form')}</th>
              <th>{t('standings.table.streak')}</th>
            </tr>
          </thead>
          <tbody>
            {playersWithStats.map((player, index) => (
              <tr
                key={player.playerId}
                className="standings-row-clickable"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/player/${player.playerId}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/player/${player.playerId}`);
                  }
                }}
                aria-label={t('standings.table.player')}
              >
                <td className="rank">{index + 1}</td>
                <td className="wrestler-image-cell">
                  <img
                    src={resolveImageSrc(player.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                    onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
                    alt={player.currentWrestler}
                    className="wrestler-thumbnail"
                  />
                </td>
                <td className="player-name">
                  <PlayerHoverCard player={player} divisions={divisions}>
                    <Link
                      to={`/player/${player.playerId}`}
                      className="player-name-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {player.name}
                    </Link>
                  </PlayerHoverCard>
                </td>
                <td className="wrestler-name">{player.currentWrestler}</td>
                <td className="psn-id">{player.psnId || '-'}</td>
                {selectedDivision === 'all' && (
                  <td className="division-name">
                    {getDivisionName(player.divisionId) || <span className="no-division">-</span>}
                  </td>
                )}
                <td className="wins">{player.wins}</td>
                <td className="losses">{player.losses}</td>
                <td className="draws">{player.draws}</td>
                <td className="win-percentage">{player.winPercentage}%</td>
                <td className="form-cell">
                  {player.recentForm && player.recentForm.length > 0 ? (
                    <span className="form-dots" aria-label={player.recentForm.join(', ')}>
                      {player.recentForm.map((r, i) => (
                        <span
                          key={i}
                          className={`form-dot ${r === 'W' ? 'win' : r === 'L' ? 'loss' : 'draw'}`}
                          title={r === 'W' ? 'Win' : r === 'L' ? 'Loss' : 'Draw'}
                        />
                      ))}
                    </span>
                  ) : (
                    <span className="form-empty">-</span>
                  )}
                </td>
                <td className="streak-cell">
                  {player.currentStreak && player.currentStreak.count >= 3 ? (
                    <span
                      className={`streak-badge ${player.currentStreak.type === 'W' ? 'hot' : player.currentStreak.type === 'L' ? 'cold' : 'neutral'}`}
                      title={
                        player.currentStreak.type === 'W'
                          ? t('standings.winStreak')
                          : player.currentStreak.type === 'L'
                            ? t('standings.lossStreak')
                            : t('standings.drawStreak')
                      }
                    >
                      {player.currentStreak.type === 'W' && '🔥 '}
                      {player.currentStreak.type === 'L' && '❄️ '}
                      {player.currentStreak.type === 'D' && '➖ '}
                      {player.currentStreak.count}
                      {player.currentStreak.type === 'W' ? 'W' : player.currentStreak.type === 'L' ? 'L' : 'D'}
                    </span>
                  ) : (
                    <span className="streak-empty">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
