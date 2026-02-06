import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  mockPlayers,
  mockAchievements,
  allAchievements,
  getPlayerAchievements,
} from '../../mocks/statisticsMockData';
import './Achievements.css';

type FilterType = 'all' | 'milestone' | 'record' | 'special';

function Achievements() {
  const { t } = useTranslation();
  const [selectedPlayerId, setSelectedPlayerId] = useState('p1');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  const playerAchievements = useMemo(
    () => getPlayerAchievements(selectedPlayerId),
    [selectedPlayerId]
  );

  const earnedIds = useMemo(
    () => new Set(playerAchievements.map((a) => a.achievementId)),
    [playerAchievements]
  );

  const filteredAchievements = useMemo(() => {
    const all = allAchievements.filter(
      (a) => activeFilter === 'all' || a.achievementType === activeFilter
    );
    return all;
  }, [activeFilter]);

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: t('statistics.achievements.filters.all') },
    { key: 'milestone', label: t('statistics.achievements.filters.milestones') },
    { key: 'record', label: t('statistics.achievements.filters.records') },
    { key: 'special', label: t('statistics.achievements.filters.special') },
  ];

  const player = mockPlayers.find((p) => p.playerId === selectedPlayerId);

  const earnedCount = filteredAchievements.filter((a) => earnedIds.has(a.achievementId)).length;
  const totalCount = filteredAchievements.length;

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
          {mockPlayers.map((p) => (
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
