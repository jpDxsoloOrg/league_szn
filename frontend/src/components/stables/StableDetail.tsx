import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { stablesApi } from '../../services/api';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { logger } from '../../utils/logger';
import type { StableDetailResponse, StablePlayerInfo, StableHeadToHead, StableMatchTypeRecord } from '../../types/stable';
import {
  DEFAULT_WRESTLER_IMAGE,
  resolveImageSrc,
  applyImageFallback,
} from '../../constants/imageFallbacks';
import Skeleton from '../ui/Skeleton';
import './StableDetail.css';

export default function StableDetail() {
  const { t } = useTranslation();
  const { stableId } = useParams<{ stableId: string }>();
  const [stable, setStable] = useState<StableDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle(stable?.name ?? t('stables.detail', 'Stable Detail'));

  useEffect(() => {
    if (!stableId) return;
    const abortController = new AbortController();

    const fetchStable = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await stablesApi.getById(stableId, abortController.signal);
        if (!abortController.signal.aborted) {
          setStable(data);
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

    fetchStable();
    return () => abortController.abort();
  }, [stableId]);

  if (loading) {
    return <Skeleton variant="block" count={4} className="stable-detail-skeleton" />;
  }

  if (error) {
    return (
      <div className="error">
        <p>{t('common.error', 'Error')}: {error}</p>
        <Link to="/stables" className="btn btn-secondary">
          {t('stables.backToList', 'Back to Stables')}
        </Link>
      </div>
    );
  }

  if (!stable) {
    return (
      <div className="error">
        <p>{t('stables.notFound', 'Stable not found.')}</p>
        <Link to="/stables" className="btn btn-secondary">
          {t('stables.backToList', 'Back to Stables')}
        </Link>
      </div>
    );
  }

  const totalMatches = stable.wins + stable.losses + stable.draws;

  return (
    <div className="stable-detail">
      {/* Header */}
      <div className="stable-detail__header">
        <div className="stable-detail__header-image-wrapper">
          <img
            src={resolveImageSrc(stable.imageUrl, DEFAULT_WRESTLER_IMAGE)}
            onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
            alt={stable.name}
            className="stable-detail__header-image"
          />
        </div>
        <div className="stable-detail__header-info">
          <h2 className="stable-detail__name">{stable.name}</h2>
          <span className={`stable-detail__status stable-detail__status--${stable.status}`}>
            {stable.status}
          </span>
          {stable.leaderName && (
            <p className="stable-detail__leader">
              {t('stables.leader', 'Leader')}: <strong>{stable.leaderName}</strong>
            </p>
          )}
          <p className="stable-detail__member-summary">
            {t('stables.memberCount', '{{count}} members', { count: stable.members.length })}
          </p>
        </div>
      </div>

      {/* Overall Stats */}
      <section className="stable-detail__section">
        <h3>{t('stables.overallStats', 'Overall Stats')}</h3>
        <div className="stable-detail__stats-grid">
          <div className="stable-detail__stat-card">
            <span className="stable-detail__stat-value stable-detail__stat-value--wins">{stable.wins}</span>
            <span className="stable-detail__stat-label">{t('standings.table.wins', 'Wins')}</span>
          </div>
          <div className="stable-detail__stat-card">
            <span className="stable-detail__stat-value stable-detail__stat-value--losses">{stable.losses}</span>
            <span className="stable-detail__stat-label">{t('standings.table.losses', 'Losses')}</span>
          </div>
          <div className="stable-detail__stat-card">
            <span className="stable-detail__stat-value stable-detail__stat-value--draws">{stable.draws}</span>
            <span className="stable-detail__stat-label">{t('standings.table.draws', 'Draws')}</span>
          </div>
          <div className="stable-detail__stat-card">
            <span className="stable-detail__stat-value">{stable.standings.winPercentage.toFixed(1)}%</span>
            <span className="stable-detail__stat-label">{t('standings.table.winPercent', 'Win%')}</span>
          </div>
          <div className="stable-detail__stat-card">
            <span className="stable-detail__stat-value">{totalMatches}</span>
            <span className="stable-detail__stat-label">{t('stables.totalMatches', 'Total Matches')}</span>
          </div>
        </div>

        {/* Form & Streak */}
        <div className="stable-detail__form-streak">
          <div className="stable-detail__form">
            <span className="stable-detail__form-label">{t('standings.table.form', 'Form')}:</span>
            {stable.standings.recentForm.length > 0 ? (
              <span className="form-dots" aria-label={stable.standings.recentForm.join(', ')}>
                {stable.standings.recentForm.map((result, i) => (
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
          <div className="stable-detail__streak">
            <span className="stable-detail__streak-label">{t('standings.table.streak', 'Streak')}:</span>
            {stable.standings.currentStreak.count >= 3 ? (
              <span
                className={`streak-badge ${stable.standings.currentStreak.type === 'W' ? 'hot' : stable.standings.currentStreak.type === 'L' ? 'cold' : 'neutral'}`}
              >
                {stable.standings.currentStreak.count}
                {stable.standings.currentStreak.type === 'W' ? 'W' : stable.standings.currentStreak.type === 'L' ? 'L' : 'D'}
              </span>
            ) : (
              <span className="streak-empty">-</span>
            )}
          </div>
        </div>
      </section>

      {/* Roster */}
      <section className="stable-detail__section">
        <h3>{t('stables.roster', 'Roster')}</h3>
        <div className="stable-detail__roster-grid">
          {stable.members.map((member: StablePlayerInfo) => (
            <Link
              key={member.playerId}
              to={`/stats/player/${member.playerId}`}
              className="stable-detail__member-card"
            >
              <img
                src={resolveImageSrc(member.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
                alt={member.wrestlerName}
                className="stable-detail__member-image"
              />
              <div className="stable-detail__member-info">
                <span className="stable-detail__member-wrestler">{member.wrestlerName}</span>
                <span className="stable-detail__member-player">
                  {member.playerName}
                  {member.playerId === stable.leaderId && (
                    <span className="stable-detail__leader-badge">
                      {t('stables.leaderBadge', 'Leader')}
                    </span>
                  )}
                </span>
                {member.psnId && (
                  <span className="stable-detail__member-psn">PSN: {member.psnId}</span>
                )}
                <span className="stable-detail__member-record">
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
      {stable.matchTypeRecords.length > 0 && (
        <section className="stable-detail__section">
          <h3>{t('stables.matchTypeBreakdown', 'Match Type Breakdown')}</h3>
          <div className="stable-detail__table-wrapper">
            <table className="stable-detail__table">
              <thead>
                <tr>
                  <th>{t('stables.format', 'Format')}</th>
                  <th>{t('standings.table.wins', 'W')}</th>
                  <th>{t('standings.table.losses', 'L')}</th>
                  <th>{t('standings.table.draws', 'D')}</th>
                </tr>
              </thead>
              <tbody>
                {stable.matchTypeRecords.map((record: StableMatchTypeRecord) => (
                  <tr key={record.matchFormat}>
                    <td className="stable-detail__format-name">{record.matchFormat}</td>
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
      {stable.headToHead.length > 0 && (
        <section className="stable-detail__section">
          <h3>{t('stables.headToHead', 'Head to Head')}</h3>
          <div className="stable-detail__table-wrapper">
            <table className="stable-detail__table">
              <thead>
                <tr>
                  <th>{t('stables.opponent', 'Opponent')}</th>
                  <th>{t('standings.table.wins', 'W')}</th>
                  <th>{t('standings.table.losses', 'L')}</th>
                  <th>{t('standings.table.draws', 'D')}</th>
                </tr>
              </thead>
              <tbody>
                {stable.headToHead.map((h2h: StableHeadToHead) => (
                  <tr key={h2h.opponentStableId}>
                    <td className="stable-detail__opponent-name">
                      <Link to={`/stables/${h2h.opponentStableId}`}>
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
      {stable.recentMatches.length > 0 && (
        <section className="stable-detail__section">
          <h3>{t('stables.recentMatches', 'Recent Matches')}</h3>
          <div className="stable-detail__recent-matches">
            {stable.recentMatches.slice(0, 10).map((match, index) => {
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
                <div key={index} className="stable-detail__match-item">
                  <span className="stable-detail__match-date">{matchDate}</span>
                  <span className="stable-detail__match-format">{matchFormat}</span>
                  <span className={`stable-detail__match-result ${isWin ? 'stable-detail__match-result--win' : 'stable-detail__match-result--loss'}`}>
                    {matchStatus === 'completed' ? (isWin ? t('stables.win', 'W') : t('stables.loss', 'L')) : matchStatus}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="stable-detail__back">
        <Link to="/stables" className="btn btn-secondary">
          {t('stables.backToList', 'Back to Stables')}
        </Link>
      </div>
    </div>
  );
}
