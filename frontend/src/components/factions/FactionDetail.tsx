import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { factionsApi } from '../../services/api';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { logger } from '../../utils/logger';
import type { StableDetailResponse, StablePlayerInfo, StableHeadToHead, StableMatchTypeRecord } from '../../types/stable';
import {
  DEFAULT_WRESTLER_IMAGE,
  resolveImageSrc,
  applyImageFallback,
} from '../../constants/imageFallbacks';
import Skeleton from '../ui/Skeleton';
import './FactionDetail.css';

export default function FactionDetail() {
  const { t } = useTranslation();
  const { factionId } = useParams<{ factionId: string }>();
  const [faction, setFaction] = useState<StableDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle(faction?.name ?? t('stables.detail', 'Stable Detail'));

  useEffect(() => {
    if (!factionId) return;
    const abortController = new AbortController();

    const fetchFaction = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await factionsApi.getById(factionId, abortController.signal);
        if (!abortController.signal.aborted) {
          setFaction(data);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Failed to load stable detail');
          setError(err.message || 'Failed to load stable');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchFaction();
    return () => abortController.abort();
  }, [factionId]);

  if (loading) {
    return <Skeleton variant="block" count={4} className="faction-detail-skeleton" />;
  }

  if (error) {
    return (
      <div className="error">
        <p>{t('common.error', 'Error')}: {error}</p>
        <Link to="/factions" className="btn btn-secondary">
          {t('stables.backToList', 'Back to Stables')}
        </Link>
      </div>
    );
  }

  if (!faction) {
    return (
      <div className="error">
        <p>{t('stables.notFound', 'Stable not found.')}</p>
        <Link to="/factions" className="btn btn-secondary">
          {t('stables.backToList', 'Back to Stables')}
        </Link>
      </div>
    );
  }

  const totalMatches = faction.wins + faction.losses + faction.draws;

  return (
    <div className="faction-detail">
      {/* Header */}
      <div className="faction-detail__header">
        <div className="faction-detail__header-image-wrapper">
          <img
            src={resolveImageSrc(faction.imageUrl, DEFAULT_WRESTLER_IMAGE)}
            onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
            alt={faction.name}
            className="faction-detail__header-image"
          />
        </div>
        <div className="faction-detail__header-info">
          <h2 className="faction-detail__name">{faction.name}</h2>
          <span className={`faction-detail__status faction-detail__status--${faction.status}`}>
            {faction.status}
          </span>
          {faction.leaderName && (
            <p className="faction-detail__leader">
              {t('stables.leader', 'Leader')}: <strong>{faction.leaderName}</strong>
            </p>
          )}
          <p className="faction-detail__member-summary">
            {t('stables.memberCount', '{{count}} members', { count: faction.members.length })}
          </p>
        </div>
      </div>

      {/* Overall Stats */}
      <section className="faction-detail__section">
        <h3>{t('stables.overallStats', 'Overall Stats')}</h3>
        <div className="faction-detail__stats-grid">
          <div className="faction-detail__stat-card">
            <span className="faction-detail__stat-value faction-detail__stat-value--wins">{faction.wins}</span>
            <span className="faction-detail__stat-label">{t('standings.table.wins', 'Wins')}</span>
          </div>
          <div className="faction-detail__stat-card">
            <span className="faction-detail__stat-value faction-detail__stat-value--losses">{faction.losses}</span>
            <span className="faction-detail__stat-label">{t('standings.table.losses', 'Losses')}</span>
          </div>
          <div className="faction-detail__stat-card">
            <span className="faction-detail__stat-value faction-detail__stat-value--draws">{faction.draws}</span>
            <span className="faction-detail__stat-label">{t('standings.table.draws', 'Draws')}</span>
          </div>
          <div className="faction-detail__stat-card">
            <span className="faction-detail__stat-value">{faction.standings.winPercentage.toFixed(1)}%</span>
            <span className="faction-detail__stat-label">{t('standings.table.winPercent', 'Win%')}</span>
          </div>
          <div className="faction-detail__stat-card">
            <span className="faction-detail__stat-value">{totalMatches}</span>
            <span className="faction-detail__stat-label">{t('stables.totalMatches', 'Total Matches')}</span>
          </div>
        </div>

        {/* Form & Streak */}
        <div className="faction-detail__form-streak">
          <div className="faction-detail__form">
            <span className="faction-detail__form-label">{t('standings.table.form', 'Form')}:</span>
            {faction.standings.recentForm.length > 0 ? (
              <span className="form-dots" aria-label={faction.standings.recentForm.join(', ')}>
                {faction.standings.recentForm.map((result, i) => (
                  <span
                    key={i}
                    className={`form-dot ${result === 'W' ? 'win' : result === 'L' ? 'loss' : 'draw'}`}
                    title={result === 'W' ? 'Win' : result === 'L' ? 'Loss' : 'Draw'}
                  />
                ))}
              </span>
            ) : (
              <span className="form-empty">-</span>
            )}
          </div>
          <div className="faction-detail__streak">
            <span className="faction-detail__streak-label">{t('standings.table.streak', 'Streak')}:</span>
            {faction.standings.currentStreak.count >= 3 ? (
              <span
                className={`streak-badge ${faction.standings.currentStreak.type === 'W' ? 'hot' : faction.standings.currentStreak.type === 'L' ? 'cold' : 'neutral'}`}
              >
                {faction.standings.currentStreak.count}
                {faction.standings.currentStreak.type === 'W' ? 'W' : faction.standings.currentStreak.type === 'L' ? 'L' : 'D'}
              </span>
            ) : (
              <span className="streak-empty">-</span>
            )}
          </div>
        </div>
      </section>

      {/* Roster */}
      <section className="faction-detail__section">
        <h3>{t('stables.roster', 'Roster')}</h3>
        <div className="faction-detail__roster-grid">
          {faction.members.map((member: StablePlayerInfo) => (
            <Link
              key={member.playerId}
              to={`/stats/player/${member.playerId}`}
              className="faction-detail__member-card"
            >
              <img
                src={resolveImageSrc(member.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
                alt={member.wrestlerName}
                className="faction-detail__member-image"
              />
              <div className="faction-detail__member-info">
                <span className="faction-detail__member-wrestler">{member.wrestlerName}</span>
                <span className="faction-detail__member-player">
                  {member.playerName}
                  {member.playerId === faction.leaderId && (
                    <span className="faction-detail__leader-badge">
                      {t('stables.leaderBadge', 'Leader')}
                    </span>
                  )}
                </span>
                {member.psnId && (
                  <span className="faction-detail__member-psn">PSN: {member.psnId}</span>
                )}
                <span className="faction-detail__member-record">
                  <span className="wins">{member.wins}W</span>
                  {' '}
                  <span className="losses">{member.losses}L</span>
                  {' '}
                  <span className="draws">{member.draws}D</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Match Type Breakdown */}
      {faction.matchTypeRecords.length > 0 && (
        <section className="faction-detail__section">
          <h3>{t('stables.matchTypeBreakdown', 'Match Type Breakdown')}</h3>
          <div className="faction-detail__table-wrapper">
            <table className="faction-detail__table">
              <thead>
                <tr>
                  <th>{t('stables.format', 'Format')}</th>
                  <th>{t('standings.table.wins', 'W')}</th>
                  <th>{t('standings.table.losses', 'L')}</th>
                  <th>{t('standings.table.draws', 'D')}</th>
                </tr>
              </thead>
              <tbody>
                {faction.matchTypeRecords.map((record: StableMatchTypeRecord) => (
                  <tr key={record.matchFormat}>
                    <td className="faction-detail__format-name">{record.matchFormat}</td>
                    <td className="wins">{record.wins}</td>
                    <td className="losses">{record.losses}</td>
                    <td className="draws">{record.draws}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Head to Head */}
      {faction.headToHead.length > 0 && (
        <section className="faction-detail__section">
          <h3>{t('stables.headToHead', 'Head to Head')}</h3>
          <div className="faction-detail__table-wrapper">
            <table className="faction-detail__table">
              <thead>
                <tr>
                  <th>{t('stables.opponent', 'Opponent')}</th>
                  <th>{t('standings.table.wins', 'W')}</th>
                  <th>{t('standings.table.losses', 'L')}</th>
                  <th>{t('standings.table.draws', 'D')}</th>
                </tr>
              </thead>
              <tbody>
                {faction.headToHead.map((h2h: StableHeadToHead) => (
                  <tr key={h2h.opponentStableId}>
                    <td className="faction-detail__opponent-name">
                      <Link to={`/factions/${h2h.opponentStableId}`}>
                        {h2h.opponentStableName}
                      </Link>
                    </td>
                    <td className="wins">{h2h.wins}</td>
                    <td className="losses">{h2h.losses}</td>
                    <td className="draws">{h2h.draws}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent Matches */}
      {faction.recentMatches.length > 0 && (
        <section className="faction-detail__section">
          <h3>{t('stables.recentMatches', 'Recent Matches')}</h3>
          <div className="faction-detail__recent-matches">
            {faction.recentMatches.slice(0, 10).map((match, index) => {
              const matchObj = match as Record<string, unknown>;
              const matchDate = typeof matchObj['date'] === 'string'
                ? new Date(matchObj['date']).toLocaleDateString()
                : '';
              const matchFormat = typeof matchObj['matchType'] === 'string'
                ? matchObj['matchType']
                : '';
              const matchStatus = typeof matchObj['status'] === 'string'
                ? matchObj['status']
                : '';
              const isWin = matchStatus === 'completed' && Array.isArray(matchObj['winners']);

              return (
                <div key={index} className="faction-detail__match-item">
                  <span className="faction-detail__match-date">{matchDate}</span>
                  <span className="faction-detail__match-format">{matchFormat}</span>
                  <span className={`faction-detail__match-result ${isWin ? 'faction-detail__match-result--win' : 'faction-detail__match-result--loss'}`}>
                    {matchStatus === 'completed' ? (isWin ? t('stables.win', 'W') : t('stables.loss', 'L')) : matchStatus}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="faction-detail__back">
        <Link to="/factions" className="btn btn-secondary">
          {t('stables.backToList', 'Back to Stables')}
        </Link>
      </div>
    </div>
  );
}
