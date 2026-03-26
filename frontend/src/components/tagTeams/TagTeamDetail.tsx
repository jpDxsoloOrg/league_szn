import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { tagTeamsApi } from '../../services/api';
import { logger } from '../../utils/logger';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import type { TagTeamDetailResponse } from '../../types/tagTeam';
import {
  DEFAULT_WRESTLER_IMAGE,
  applyImageFallback,
  resolveImageSrc,
} from '../../constants/imageFallbacks';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import './TagTeamDetail.css';

export default function TagTeamDetail() {
  const { t } = useTranslation();
  const { tagTeamId } = useParams<{ tagTeamId: string }>();
  const [tagTeam, setTagTeam] = useState<TagTeamDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle(tagTeam?.name || t('tagTeams.detail.title', 'Tag Team Details'));

  useEffect(() => {
    if (!tagTeamId) return;

    const abortController = new AbortController();

    const fetchDetail = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await tagTeamsApi.getById(tagTeamId, abortController.signal);
        if (!abortController.signal.aborted) {
          setTagTeam(data);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Failed to load tag team detail');
          setError(err.message || t('tagTeams.detail.error', 'Failed to load tag team details'));
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchDetail();
    return () => abortController.abort();
  }, [tagTeamId, t]);

  if (loading) {
    return <Skeleton variant="block" count={4} className="tag-team-detail-skeleton" />;
  }

  if (error) {
    return (
      <div className="error">
        <p>{t('common.error', 'Error')}: {error}</p>
        <Link to="/tag-teams" className="tag-team-detail__back-link">
          {t('tagTeams.detail.backToList', 'Back to Tag Teams')}
        </Link>
      </div>
    );
  }

  if (!tagTeam) {
    return (
      <EmptyState
        title={t('tagTeams.detail.notFound', 'Tag Team Not Found')}
        description={t('tagTeams.detail.notFoundDesc', 'The tag team you are looking for does not exist.')}
      />
    );
  }

  const totalMatches = tagTeam.wins + tagTeam.losses + tagTeam.draws;
  const winPercentage = tagTeam.standings.winPercentage.toFixed(1);
  const statusLabel = tagTeam.status === 'active'
    ? t('tagTeams.status.active', 'Active')
    : tagTeam.status === 'dissolved'
      ? t('tagTeams.status.dissolved', 'Dissolved')
      : tagTeam.status === 'pending_partner'
        ? t('tagTeams.status.pendingPartner', 'Pending Partner')
        : t('tagTeams.status.pendingAdmin', 'Pending Admin');

  return (
    <div className="tag-team-detail">
      <Link to="/tag-teams" className="tag-team-detail__back-link">
        &larr; {t('tagTeams.detail.backToList', 'Back to Tag Teams')}
      </Link>

      {/* Header Section */}
      <section className="tag-team-detail__header">
        {tagTeam.imageUrl && (
          <img
            src={resolveImageSrc(tagTeam.imageUrl, DEFAULT_WRESTLER_IMAGE)}
            onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
            alt={tagTeam.name}
            className="tag-team-detail__team-image"
          />
        )}
        <div className="tag-team-detail__header-info">
          <h1 className="tag-team-detail__team-name">{tagTeam.name}</h1>
          <span className={`tag-team-detail__status tag-team-detail__status--${tagTeam.status}`}>
            {statusLabel}
          </span>
          <div className="tag-team-detail__players-row">
            <div className="tag-team-detail__player-card">
              <img
                src={resolveImageSrc(tagTeam.player1.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
                alt={tagTeam.player1.playerName}
                className="tag-team-detail__player-image"
              />
              <div className="tag-team-detail__player-info">
                <span className="tag-team-detail__player-name">{tagTeam.player1.playerName}</span>
                <span className="tag-team-detail__wrestler-name">{tagTeam.player1.wrestlerName}</span>
              </div>
            </div>
            <span className="tag-team-detail__ampersand">&amp;</span>
            <div className="tag-team-detail__player-card">
              <img
                src={resolveImageSrc(tagTeam.player2.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
                alt={tagTeam.player2.playerName}
                className="tag-team-detail__player-image"
              />
              <div className="tag-team-detail__player-info">
                <span className="tag-team-detail__player-name">{tagTeam.player2.playerName}</span>
                <span className="tag-team-detail__wrestler-name">{tagTeam.player2.wrestlerName}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="tag-team-detail__section">
        <h2 className="tag-team-detail__section-title">
          {t('tagTeams.detail.stats', 'Statistics')}
        </h2>
        <div className="tag-team-detail__stats-grid">
          <div className="tag-team-detail__stat-box">
            <span className="tag-team-detail__stat-value tag-team-detail__stat-value--wins">
              {tagTeam.wins}
            </span>
            <span className="tag-team-detail__stat-label">
              {t('tagTeams.detail.wins', 'Wins')}
            </span>
          </div>
          <div className="tag-team-detail__stat-box">
            <span className="tag-team-detail__stat-value tag-team-detail__stat-value--losses">
              {tagTeam.losses}
            </span>
            <span className="tag-team-detail__stat-label">
              {t('tagTeams.detail.losses', 'Losses')}
            </span>
          </div>
          <div className="tag-team-detail__stat-box">
            <span className="tag-team-detail__stat-value tag-team-detail__stat-value--draws">
              {tagTeam.draws}
            </span>
            <span className="tag-team-detail__stat-label">
              {t('tagTeams.detail.draws', 'Draws')}
            </span>
          </div>
          <div className="tag-team-detail__stat-box">
            <span className="tag-team-detail__stat-value">{winPercentage}%</span>
            <span className="tag-team-detail__stat-label">
              {t('tagTeams.detail.winPercent', 'Win %')}
            </span>
          </div>
          <div className="tag-team-detail__stat-box">
            <span className="tag-team-detail__stat-value">{totalMatches}</span>
            <span className="tag-team-detail__stat-label">
              {t('tagTeams.detail.totalMatches', 'Total Matches')}
            </span>
          </div>
          <div className="tag-team-detail__stat-box">
            <span className="tag-team-detail__stat-value">
              {tagTeam.standings.currentStreak.count > 0
                ? `${tagTeam.standings.currentStreak.count}${tagTeam.standings.currentStreak.type}`
                : '-'}
            </span>
            <span className="tag-team-detail__stat-label">
              {t('tagTeams.detail.streak', 'Current Streak')}
            </span>
          </div>
        </div>

        {/* Recent Form */}
        {tagTeam.standings.recentForm.length > 0 && (
          <div className="tag-team-detail__form-row">
            <span className="tag-team-detail__form-label">
              {t('tagTeams.detail.recentForm', 'Recent Form')}:
            </span>
            <span className="form-dots" aria-label={tagTeam.standings.recentForm.join(', ')}>
              {tagTeam.standings.recentForm.map((result, i) => (
                <span
                  key={i}
                  className={`form-dot ${result === 'W' ? 'win' : result === 'L' ? 'loss' : 'draw'}`}
                  title={result === 'W' ? 'Win' : result === 'L' ? 'Loss' : 'Draw'}
                />
              ))}
            </span>
          </div>
        )}
      </section>

      {/* Match Type Breakdown */}
      {tagTeam.matchTypeRecords.length > 0 && (
        <section className="tag-team-detail__section">
          <h2 className="tag-team-detail__section-title">
            {t('tagTeams.detail.matchTypeBreakdown', 'Match Type Breakdown')}
          </h2>
          <div className="tag-team-detail__table-wrapper">
            <table className="tag-team-detail__table">
              <thead>
                <tr>
                  <th>{t('tagTeams.detail.matchFormat', 'Match Format')}</th>
                  <th>{t('tagTeams.detail.wins', 'W')}</th>
                  <th>{t('tagTeams.detail.losses', 'L')}</th>
                  <th>{t('tagTeams.detail.draws', 'D')}</th>
                </tr>
              </thead>
              <tbody>
                {tagTeam.matchTypeRecords.map((record) => (
                  <tr key={record.matchFormat}>
                    <td className="tag-team-detail__match-format">{record.matchFormat}</td>
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
      {tagTeam.headToHead.length > 0 && (
        <section className="tag-team-detail__section">
          <h2 className="tag-team-detail__section-title">
            {t('tagTeams.detail.headToHead', 'Head to Head')}
          </h2>
          <div className="tag-team-detail__table-wrapper">
            <table className="tag-team-detail__table">
              <thead>
                <tr>
                  <th>{t('tagTeams.detail.opponent', 'Opponent')}</th>
                  <th>{t('tagTeams.detail.wins', 'W')}</th>
                  <th>{t('tagTeams.detail.losses', 'L')}</th>
                  <th>{t('tagTeams.detail.draws', 'D')}</th>
                </tr>
              </thead>
              <tbody>
                {tagTeam.headToHead.map((h2h) => (
                  <tr key={h2h.opponentTagTeamId}>
                    <td className="tag-team-detail__opponent-name">
                      <Link to={`/tag-teams/${h2h.opponentTagTeamId}`}>
                        {h2h.opponentTagTeamName}
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
      {tagTeam.recentMatches.length > 0 && (
        <section className="tag-team-detail__section">
          <h2 className="tag-team-detail__section-title">
            {t('tagTeams.detail.recentMatches', 'Recent Matches')}
          </h2>
          <div className="tag-team-detail__matches-list">
            {tagTeam.recentMatches.map((match, index) => {
              const matchData = match as Record<string, unknown>;
              const matchId = (matchData['matchId'] as string) || String(index);
              const matchDate = matchData['date']
                ? new Date(matchData['date'] as string).toLocaleDateString()
                : '';
              const matchType = (matchData['matchType'] as string) || '';
              const result = (matchData['result'] as string) || '';

              return (
                <div key={matchId} className="tag-team-detail__match-item">
                  <div className="tag-team-detail__match-date">{matchDate}</div>
                  <div className="tag-team-detail__match-type">{matchType}</div>
                  <div className="tag-team-detail__match-opponent">
                    {t('tagTeams.detail.vs', 'vs')}{' '}
                    {(matchData['opponentName'] as string) || t('tagTeams.detail.unknownOpponent', 'Unknown')}
                  </div>
                  {result && (
                    <span
                      className={`tag-team-detail__match-result tag-team-detail__match-result--${result.toLowerCase()}`}
                    >
                      {result}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
