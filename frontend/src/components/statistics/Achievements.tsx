import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { statisticsApi } from '../../services/api';
import type { StatsPlayer } from '../../services/api';
import type { Achievement } from '../../types/statistics';
import Skeleton from '../ui/Skeleton';
import './Achievements.css';

type FilterType = 'all' | 'milestone' | 'record' | 'special';

function Achievements() {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<StatsPlayer[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [allAchievementDefs, setAllAchievementDefs] = useState<Omit<Achievement, 'playerId' | 'earnedAt'>[]>([]);
  const [playerAchievements, setPlayerAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);

  // Load player list and achievement definitions on mount
  useEffect(() => {
    const abortController = new AbortController();
    const fetchInitial = async () => {
      try {
        const result = await statisticsApi.getAchievements(undefined, abortController.signal);
        setPlayers(result.players);
        setAllAchievementDefs(result.allAchievements);
        if (result.players.length > 0 && result.players[0]) {
          setSelectedPlayerId(result.players[0].playerId);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Failed to load achievements', err);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchInitial();
    return () => abortController.abort();
  }, []);

  // Load achievements for selected player
  useEffect(() => {
    if (!selectedPlayerId) return;
    const abortController = new AbortController();
    const fetchPlayerAchievements = async () => {
      try {
        const result = await statisticsApi.getAchievements(selectedPlayerId, abortController.signal);
        setPlayerAchievements(result.achievements || []);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Failed to load player achievements', err);
        }
      }
    };
    fetchPlayerAchievements();
    return () => abortController.abort();
  }, [selectedPlayerId]);

  const earnedIds = useMemo(
    () => new Set(playerAchievements.map((a) => a.achievementId)),
    [playerAchievements]
  );

  const filteredAchievements = useMemo(() => {
    return allAchievementDefs.filter(
      (a) => activeFilter === 'all' || a.achievementType === activeFilter
    );
  }, [allAchievementDefs, activeFilter]);

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: t('statistics.achievements.filters.all') },
    { key: 'milestone', label: t('statistics.achievements.filters.milestones') },
    { key: 'record', label: t('statistics.achievements.filters.records') },
    { key: 'special', label: t('statistics.achievements.filters.special') },
  ];

  const player = players.find((p) => p.playerId === selectedPlayerId);

  const earnedCount = filteredAchievements.filter((a) => earnedIds.has(a.achievementId)).length;
  const totalCount = filteredAchievements.length;

  if (loading) {
    return (
      <div className="achievements-page">
        <h2>{t('statistics.achievements.title')}</h2>
        <Skeleton variant="block" count={4} />
      </div>
    );
  }

  return (
    <div className="achievements-page">
      <div className="ach-header">
        <h2>{t('statistics.achievements.title')}</h2>
        <div className="ach-nav-links">
          <Link to="/stats">{t('statistics.nav.playerStats')}</Link>
          <Link to="/stats/records">{t('statistics.nav.records')}</Link>
          <Link to="/stats/leaderboards">{t('statistics.nav.leaderboards')}</Link>
        </div>
      </div>

      {/* Player Selector */}
      <div className="ach-player-selector">
        <label htmlFor="ach-player-select">{t('statistics.playerStats.selectPlayer')}</label>
        <select
          id="ach-player-select"
          value={selectedPlayerId}
          onChange={(e) => setSelectedPlayerId(e.target.value)}
        >
          {players.map((p) => (
            <option key={p.playerId} value={p.playerId}>
              {p.name} ({p.wrestlerName})
            </option>
          ))}
        </select>
      </div>

      {/* Player Summary */}
      <div className="ach-summary">
        <span className="ach-summary-name">
          {player?.name} ({player?.wrestlerName})
        </span>
        <span className="ach-summary-count">
          {earnedCount}/{totalCount} {t('statistics.achievements.earned')}
        </span>
        <div className="ach-progress-bar">
          <div
            className="ach-progress-fill"
            style={{ width: `${totalCount > 0 ? (earnedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="ach-filters">
        {filters.map((f) => (
          <button
            key={f.key}
            className={`ach-filter-btn ${activeFilter === f.key ? 'ach-filter-active' : ''}`}
            onClick={() => setActiveFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Achievement Grid */}
      <div className="ach-grid">
        {filteredAchievements.map((achievement) => {
          const earned = earnedIds.has(achievement.achievementId);
          const earnedAch = earned
            ? playerAchievements.find((a) => a.achievementId === achievement.achievementId)
            : null;

          return (
            <div
              key={achievement.achievementId}
              className={`ach-card ${earned ? 'ach-card-earned' : 'ach-card-locked'}`}
            >
              <div className={`ach-icon ${earned ? '' : 'ach-icon-locked'}`}>
                {achievement.icon}
              </div>
              <div className="ach-info">
                <span className="ach-name">{achievement.achievementName}</span>
                <span className="ach-desc">{achievement.description}</span>
                <span className="ach-type-badge" data-type={achievement.achievementType}>
                  {achievement.achievementType}
                </span>
              </div>
              {earned && earnedAch && (
                <div className="ach-earned-date">
                  {t('statistics.achievements.earnedOn')} {earnedAch.earnedAt}
                </div>
              )}
              {!earned && (
                <div className="ach-locked-label">{t('statistics.achievements.locked')}</div>
              )}
            </div>
          );
        })}
      </div>

      {filteredAchievements.length === 0 && (
        <div className="ach-empty">
          {t('statistics.achievements.noAchievements')}
        </div>
      )}
    </div>
  );
}

export default Achievements;
