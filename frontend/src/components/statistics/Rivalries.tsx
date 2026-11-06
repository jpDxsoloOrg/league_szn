import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rivalriesApi, seasonsApi } from '../../services/api';
import type { MatchHistoryRivalry as Rivalry } from '../../services/api/rivalries.api';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import SeasonSelector from './SeasonSelector';
import { useStatsResource } from './useStatsResource';
import './stats-common.css';
import './Rivalries.css';

const loadSeasons = (signal: AbortSignal) => seasonsApi.getAll(signal);

/** The match-history page at /stats/rivalries, labelled Feud History. */
function Rivalries() {
  const { t } = useTranslation();
  const [selectedSeasonId, setSelectedSeasonId] = useState('');

  const { data: seasons } = useStatsResource(loadSeasons);
  const loadRivalries = useCallback(
    async (signal: AbortSignal) => (await rivalriesApi.getRivalries(selectedSeasonId || undefined, signal)).rivalries,
    [selectedSeasonId],
  );
  const { data, loading, failed, reload } = useStatsResource(loadRivalries);

  const title = t('nav.tabs.feudHistory');
  const rivalries = data ?? [];

  const seriesRecordText = (rivalry: Rivalry): string => {
    const firstWins = rivalry.player1Wins;
    const secondWins = rivalry.player2Wins;
    const first = rivalry.player1?.wrestlerName ?? rivalry.player1Id;
    const second = rivalry.player2?.wrestlerName ?? rivalry.player2Id;
    if (firstWins > secondWins) return t('rivalries.leads', { name: first, wins: firstWins, losses: secondWins });
    if (secondWins > firstWins) return t('rivalries.leads', { name: second, wins: secondWins, losses: firstWins });
    return t('rivalries.tied', { count: firstWins });
  };

  const renderBody = () => {
    if (loading) return <Skeleton variant="cards" count={4} />;
    if (failed) {
      return <EmptyState title={t('statistics.loadFailed')} actionLabel={t('common.retry')} onAction={reload} />;
    }
    if (rivalries.length === 0) {
      return <EmptyState title={title} description={t('rivalries.noRivalries')} />;
    }
    return (
      <div className="feud-grid">
        {rivalries.map((rivalry) => {
          const first = rivalry.player1?.wrestlerName ?? rivalry.player1Id;
          const second = rivalry.player2?.wrestlerName ?? rivalry.player2Id;
          return (
            <Card key={`${rivalry.player1Id}-${rivalry.player2Id}`} className="feud-card">
              <div className="feud-players">
                <div className="feud-player">
                  <Avatar src={rivalry.player1?.imageUrl} name={first} size="lg" ring="pink" />
                  <span className="feud-player-name">{first}</span>
                </div>
                <span className="feud-vs">{t('common.vs')}</span>
                <div className="feud-player">
                  <Avatar src={rivalry.player2?.imageUrl} name={second} size="lg" ring="cyan" />
                  <span className="feud-player-name">{second}</span>
                </div>
              </div>
              <p className="feud-series">{seriesRecordText(rivalry)}</p>
              <p className="feud-meta">
                {t('rivalries.recentMatches')}: {rivalry.matchCount}
                {rivalry.championshipMatches > 0 && ` · ${t('rivalries.championshipAtStake')}`}
              </p>
              <div className="feud-footer">
                <Badge tone="pink">{t(`rivalries.intensity.${rivalry.intensityBadge}`)}</Badge>
                <Button
                  variant="ghost"
                  to={`/stats/head-to-head?player1=${rivalry.player1Id}&player2=${rivalry.player2Id}`}
                >
                  {t('rivalries.viewHeadToHead')}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="stats-page">
      <PageHeader
        eyebrow={t('nav.statistics')}
        title={title}
        actions={
          <SeasonSelector
            seasons={seasons ?? []}
            selectedSeasonId={selectedSeasonId}
            onSeasonChange={setSelectedSeasonId}
          />
        }
      />
      {renderBody()}
    </div>
  );
}

export default Rivalries;
