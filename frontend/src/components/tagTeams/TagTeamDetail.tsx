import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { tagTeamsApi } from '../../services/api';
import { logger } from '../../utils/logger';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import type { TagTeamDetailResponse, TagTeamPlayerInfo, TagTeamStatus } from '../../types/tagTeam';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import FormDots from '../ui/FormDots';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import '../factions/groupUi.css';
import './TagTeamDetail.css';

const STATUS_TONES: Record<TagTeamStatus, BadgeTone> = {
  active: 'win',
  dissolved: 'draw',
  pending_partner: 'warning',
  pending_admin: 'warning',
};

const STATUS_FALLBACKS: Record<TagTeamStatus, string> = {
  active: 'Active',
  dissolved: 'Dissolved',
  pending_partner: 'Pending Partner',
  pending_admin: 'Pending Admin',
};

function resultTone(result: string): BadgeTone {
  const first = result.charAt(0).toUpperCase();
  if (first === 'W') return 'win';
  if (first === 'L') return 'loss';
  return 'draw';
}

function PlayerSummary({ player, fallbackName }: { player: TagTeamPlayerInfo | null; fallbackName: string }) {
  if (!player) {
    return (
      <div className="group-person tag-team-detail__player">
        <Avatar name={fallbackName} size="lg" />
        <span className="group-person__text">
          <span className="group-person__name">{fallbackName}</span>
        </span>
      </div>
    );
  }

  return (
    <Link to={`/player/${player.playerId}`} className="group-person tag-team-detail__player">
      <Avatar src={player.imageUrl} name={player.playerName} size="lg" />
      <span className="group-person__text">
        <span className="group-person__name">{player.wrestlerName}</span>
        <span className="group-muted">{player.playerName}</span>
        {player.psnId && <span className="group-muted">PSN: {player.psnId}</span>}
      </span>
    </Link>
  );
}

export default function TagTeamDetail() {
  const { t } = useTranslation();
  const { tagTeamId } = useParams<{ tagTeamId: string }>();
  const [tagTeam, setTagTeam] = useState<TagTeamDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useDocumentTitle(tagTeam?.name || t('tagTeams.detail', 'Tag Team Details'));

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
          setError(err.message || t('tagTeams.detailPage.error', 'Failed to load tag team details'));
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchDetail();
    return () => abortController.abort();
  }, [tagTeamId, t, reloadKey]);

  const backLink = (
    <Link to="/tag-teams" className="tag-team-detail__back-link">
      <ArrowLeft aria-hidden="true" size={16} />
      {t('tagTeams.detailPage.backToList', 'Back to Tag Teams')}
    </Link>
  );

  if (loading) return <Skeleton variant="block" count={4} />;

  if (error) {
    return (
      <div className="group-page">
        {backLink}
        <EmptyState
          title={t('common.error', 'Error')}
          description={error}
          actionLabel={t('common.retry', 'Retry')}
          onAction={() => setReloadKey((key) => key + 1)}
        />
      </div>
    );
  }

  if (!tagTeam) {
    return (
      <div className="group-page">
        {backLink}
        <EmptyState
          title={t('tagTeams.detailPage.notFound', 'Tag Team Not Found')}
          description={t('tagTeams.detailPage.notFoundDesc', 'The tag team you are looking for does not exist.')}
        />
      </div>
    );
  }

  const { standings } = tagTeam;
  const totalMatches = tagTeam.wins + tagTeam.losses + tagTeam.draws;
  const recordColumns = {
    wins: t('tagTeams.wins', 'W'),
    losses: t('tagTeams.losses', 'L'),
    draws: t('tagTeams.draws', 'D'),
  };
  const hasHistory = tagTeam.matchTypeRecords.length > 0
    || tagTeam.headToHead.length > 0
    || tagTeam.recentMatches.length > 0;

  return (
    <div className="group-page">
      {backLink}

      <PageHeader
        title={tagTeam.name}
        actions={(
          <Badge tone={STATUS_TONES[tagTeam.status]}>
            {t(`tagTeams.statusLabel.${tagTeam.status}`, STATUS_FALLBACKS[tagTeam.status])}
          </Badge>
        )}
      />

      {tagTeam.imageUrl && (
        <img src={tagTeam.imageUrl} alt={tagTeam.name} className="tag-team-detail__banner" />
      )}

      <div className="tag-team-detail__players">
        <PlayerSummary
          player={tagTeam.player1}
          fallbackName={tagTeam.player1WrestlerName || t('common.unknown')}
        />
        <span className="tag-team-detail__ampersand" aria-hidden="true">&amp;</span>
        <PlayerSummary
          player={tagTeam.player2}
          fallbackName={tagTeam.player2WrestlerName || t('common.unknown')}
        />
      </div>

      <section className="group-section">
        <h2 className="group-heading">{t('tagTeams.stats', 'Stats')}</h2>
        <dl className="group-stats">
          <div>
            <dt>{t('tagTeams.detailPage.record', 'Record')}</dt>
            <dd>{tagTeam.wins}-{tagTeam.losses}-{tagTeam.draws}</dd>
          </div>
          <div>
            <dt>{t('tagTeams.winPct', 'Win%')}</dt>
            <dd>{standings.winPercentage.toFixed(1)}%</dd>
          </div>
          <div>
            <dt>{t('tagTeams.detailPage.totalMatches', 'Total Matches')}</dt>
            <dd>{totalMatches}</dd>
          </div>
          <div>
            <dt>{t('tagTeams.streak', 'Streak')}</dt>
            <dd>{standings.currentStreak.count > 0 ? `${standings.currentStreak.count}${standings.currentStreak.type}` : '-'}</dd>
          </div>
        </dl>
        {standings.recentForm.length > 0 && <FormDots results={standings.recentForm} />}
      </section>

      {!hasHistory && (
        <EmptyState
          title={t('tagTeams.recentMatches', 'Recent Matches')}
          description={t('tagTeams.detailPage.noHistory', 'This team has not wrestled yet.')}
        />
      )}

      {tagTeam.recentMatches.length > 0 && (
        <section className="group-section">
          <h2 className="group-heading">{t('tagTeams.recentMatches', 'Recent Matches')}</h2>
          <ul className="group-list">
            {tagTeam.recentMatches.map((match, index) => {
              const matchData = match as Record<string, unknown>;
              const matchId = (matchData['matchId'] as string) || String(index);
              const matchDate = matchData['date'] ? new Date(matchData['date'] as string).toLocaleDateString() : '';
              const matchType = (matchData['matchType'] as string) || '';
              const result = (matchData['result'] as string) || '';
              const opponent = (matchData['opponentName'] as string)
                || t('tagTeams.detailPage.unknownOpponent', 'Unknown');

              return (
                <li key={matchId} className="tag-team-detail__match">
                  <span className="group-person__text">
                    <span>{t('tagTeams.detailPage.vs', 'vs')} {opponent}</span>
                    <span className="group-muted">{[matchDate, matchType].filter(Boolean).join(' · ')}</span>
                  </span>
                  {result && <Badge tone={resultTone(result)}>{result}</Badge>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {tagTeam.matchTypeRecords.length > 0 && (
        <section className="group-section">
          <h2 className="group-heading">{t('tagTeams.matchTypes', 'Match Type Breakdown')}</h2>
          <DataTable
            caption={t('tagTeams.matchTypes', 'Match Type Breakdown')}
            rows={tagTeam.matchTypeRecords}
            rowKey={(record) => record.matchFormat}
            columns={[
              { key: 'format', header: t('tagTeams.detailPage.matchFormat', 'Match Format'), render: (record) => record.matchFormat },
              { key: 'wins', header: recordColumns.wins, render: (record) => record.wins, align: 'end' },
              { key: 'losses', header: recordColumns.losses, render: (record) => record.losses, align: 'end' },
              { key: 'draws', header: recordColumns.draws, render: (record) => record.draws, align: 'end' },
            ]}
          />
        </section>
      )}

      {tagTeam.headToHead.length > 0 && (
        <section className="group-section">
          <h2 className="group-heading">{t('tagTeams.headToHead', 'Head to Head')}</h2>
          <DataTable
            caption={t('tagTeams.headToHead', 'Head to Head')}
            rows={tagTeam.headToHead}
            rowKey={(record) => record.opponentTagTeamId}
            columns={[
              {
                key: 'opponent',
                header: t('tagTeams.detailPage.opponent', 'Opponent'),
                render: (record) => (
                  <Link to={`/tag-teams/${record.opponentTagTeamId}`} className="group-table-name">
                    {record.opponentTagTeamName}
                  </Link>
                ),
              },
              { key: 'wins', header: recordColumns.wins, render: (record) => record.wins, align: 'end' },
              { key: 'losses', header: recordColumns.losses, render: (record) => record.losses, align: 'end' },
              { key: 'draws', header: recordColumns.draws, render: (record) => record.draws, align: 'end' },
            ]}
          />
        </section>
      )}
    </div>
  );
}
