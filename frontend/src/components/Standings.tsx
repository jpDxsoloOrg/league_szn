import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { standingsApi, seasonsApi, divisionsApi } from '../services/api';
import { logger } from '../utils/logger';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useMediaQuery } from '../hooks/useMediaQuery';
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

/** Mirrors the desktop alignment <select> options (same hardcoded labels). */
const ALIGNMENT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'face', label: '😇 Face' },
  { value: 'neutral', label: '⚖️ Neutral' },
  { value: 'heel', label: '😈 Heel' },
];

export default function Standings() {
  const { t } = useTranslation();
  useDocumentTitle(t('standings.title'));
  const navigate = useNavigate();
  const [standings, setStandings] = useState<StandingsType | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [selectedAlignment, setSelectedAlignment] = useState<string>('all');
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [defaultsResolved, setDefaultsResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useMediaQuery('(max-width: 768px)');

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
          const activeSeason = seasonsData.find(s => s.status === 'active');
          if (activeSeason) setSelectedSeasonId(activeSeason.seasonId);
          const heavyweight = divisionsData.find(
            d => d.name.toLowerCase() === 'heavyweight'
          );
          if (heavyweight) setSelectedDivision(heavyweight.divisionId);
          setDefaultsResolved(true);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Failed to load initial standings data');
        }
        if (!abortController.signal.aborted) setDefaultsResolved(true);
      }
    };

    fetchInitialData();
    return () => abortController.abort();
  }, []);

  useEffect(() => {
    if (!defaultsResolved) return;
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
  }, [selectedSeasonId, defaultsResolved]);

  // Memoize filtered players to avoid recalculation on every render
  const filteredPlayers = useMemo((): Player[] => {
    if (!standings) return [];

    let players = standings.players;

    if (selectedDivision === 'none') {
      players = players.filter(p => !p.divisionId);
    } else if (selectedDivision !== 'all') {
      players = players.filter(p => p.divisionId === selectedDivision);
    }

    if (selectedAlignment === 'none') {
      players = players.filter(p => !p.alignment);
    } else if (selectedAlignment !== 'all') {
      players = players.filter(p => p.alignment === selectedAlignment);
    }

    return players;
  }, [standings, selectedDivision, selectedAlignment]);

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
        <h2 className="page-title--mobile-hidden">{t('standings.title')}</h2>
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

      {/* On mobile the select-based filters become horizontally scrollable
          pill chips (matching the app-shell design); desktop keeps selects. */}
      {isMobile ? (
        <div className="standings-filter-chips">
          {divisions.length > 0 && (
            <div
              className="filter-chip-row"
              role="group"
              aria-label={t('standings.filterByDivision')}
            >
              <button
                type="button"
                className={`filter-chip ${selectedDivision === 'all' ? 'selected' : ''}`}
                aria-pressed={selectedDivision === 'all'}
                onClick={() => setSelectedDivision('all')}
              >
                {t('common.all')}
              </button>
              {divisions.map((division) => (
                <button
                  key={division.divisionId}
                  type="button"
                  className={`filter-chip ${selectedDivision === division.divisionId ? 'selected' : ''}`}
                  aria-pressed={selectedDivision === division.divisionId}
                  onClick={() => setSelectedDivision(division.divisionId)}
                >
                  {division.name}
                </button>
              ))}
              <button
                type="button"
                className={`filter-chip ${selectedDivision === 'none' ? 'selected' : ''}`}
                aria-pressed={selectedDivision === 'none'}
                onClick={() => setSelectedDivision('none')}
              >
                {t('standings.noDivision')}
              </button>
            </div>
          )}

          <div className="filter-chip-row" role="group" aria-label="Alignment">
            {ALIGNMENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`filter-chip ${selectedAlignment === option.value ? 'selected' : ''}`}
                aria-pressed={selectedAlignment === option.value}
                onClick={() => setSelectedAlignment(option.value)}
              >
                {option.value === 'all' ? t('common.all') : option.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
      <div className="standings-filters">
        {divisions.length > 0 && (
          <DivisionFilter
            divisions={divisions}
            selectedDivision={selectedDivision}
            onSelect={setSelectedDivision}
            labelKey="standings.filterByDivision"
            showNoDivision
          />
        )}

        <div className="alignment-filter">
          <label className="alignment-filter-label" htmlFor="alignment-filter-select">Alignment:</label>
          <select
            id="alignment-filter-select"
            className="alignment-filter-select"
            value={selectedAlignment}
            onChange={(e) => setSelectedAlignment(e.target.value)}
          >
            <option value="all">All</option>
            <option value="face">😇 Face</option>
            <option value="neutral">⚖️ Neutral</option>
            <option value="heel">😈 Heel</option>
          </select>
        </div>
      </div>
      )}

      {/* Below 768px (matching the mobile app shell) the table hides half its
          columns off-screen, so swap in a card list that keeps record, form,
          and streak visible. */}
      {isMobile ? (
      <div className="standings-cards">
        {playersWithStats.map((player, index) => (
          <div
            key={player.playerId}
            className="standings-card"
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/player/${player.playerId}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate(`/player/${player.playerId}`);
              }
            }}
            aria-label={player.name}
          >
            <span className="standings-card-rank">{index + 1}</span>
            <img
              src={resolveImageSrc(player.imageUrl, DEFAULT_WRESTLER_IMAGE)}
              onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
              alt={player.currentWrestler}
              className="standings-card-avatar"
            />
            <div className="standings-card-main">
              <span className="standings-card-name">
                {player.name}
                {player.alignment === 'face' && ' 😇'}
                {player.alignment === 'neutral' && ' ⚖️'}
                {player.alignment === 'heel' && ' 😈'}
              </span>
              <span className="standings-card-wrestler">{player.currentWrestler}</span>
              <div className="standings-card-stats">
                <span className="standings-card-record">
                  {player.wins}-{player.losses}-{player.draws}
                </span>
                <span className="standings-card-winpct">{player.winPercentage}%</span>
                {player.recentForm && player.recentForm.length > 0 && (
                  <span className="form-dots" aria-label={player.recentForm.join(', ')}>
                    {player.recentForm.map((r, i) => (
                      <span
                        key={i}
                        className={`form-dot ${r === 'W' ? 'win' : r === 'L' ? 'loss' : 'draw'}`}
                      />
                    ))}
                  </span>
                )}
                {player.currentStreak && player.currentStreak.count >= 3 && (
                  <span
                    className={`streak-badge ${player.currentStreak.type === 'W' ? 'hot' : player.currentStreak.type === 'L' ? 'cold' : 'neutral'}`}
                  >
                    {player.currentStreak.type === 'W' && '🔥 '}
                    {player.currentStreak.type === 'L' && '❄️ '}
                    {player.currentStreak.type === 'D' && '➖ '}
                    {player.currentStreak.count}
                    {player.currentStreak.type}
                  </span>
                )}
              </div>
            </div>
            {player.mainOverall !== undefined && (
              <span className="overall-badge-sm standings-card-ovr">{player.mainOverall}</span>
            )}
          </div>
        ))}
      </div>
      ) : (
      <div className="standings-table-wrapper">
        <table className="standings-table">
          <thead>
            <tr>
              <th>{t('standings.table.rank')}</th>
              <th className="image-header">{t('standings.table.image')}</th>
              <th>{t('standings.table.player')}</th>
              <th>{t('standings.table.wrestler')}</th>
              <th title={t('standings.table.overallTitle')}>{t('standings.table.overall')}</th>
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
                  {player.alignment && (
                    <span className={`alignment-badge alignment-${player.alignment}`} title={player.alignment.charAt(0).toUpperCase() + player.alignment.slice(1)}>
                      {player.alignment === 'face' && '😇'}
                      {player.alignment === 'neutral' && '⚖️'}
                      {player.alignment === 'heel' && '😈'}
                    </span>
                  )}
                </td>
                <td className="wrestler-name">
                  {player.currentWrestler}
                  {!player.currentWrestlerId && (
                    <span
                      className="needs-wrestler-pill"
                      title={t('auth.needsWrestlerBannerBody')}
                    >
                      {t('auth.needsWrestlerBadge')}
                    </span>
                  )}
                </td>
                <td className="overall-cell">
                  {player.mainOverall !== undefined ? (
                    <span className="overall-badge-sm">{player.mainOverall}</span>
                  ) : '-'}
                </td>
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
      )}
    </div>
  );
}
