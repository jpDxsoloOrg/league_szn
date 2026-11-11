import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { HeadToHeadResponse, StatsPlayer } from '../../services/api';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import SectionTabs from '../ui/SectionTabs';
import Select from '../ui/Select';
import Skeleton from '../ui/Skeleton';
import { formatCalendarDate } from '../../utils/dateUtils';
import SeasonSelector from './SeasonSelector';
import { useHeadToHead } from './useHeadToHead';
import { usePlayerImages } from './usePlayerImages';
import './stats-common.css';
import './HeadToHeadComparison.css';

const COMPARE_PATH = '/stats/head-to-head';
const TAPE_PATH = '/stats/tale-of-tape';

type HeadToHeadView = 'compare' | 'tape';

interface StatRow {
  key: string;
  label: string;
  first: number;
  second: number;
  suffix?: string;
  lowerIsBetter?: boolean;
  /** Shown, but neither higher nor lower counts as an advantage. */
  neutral?: boolean;
  /** Part of the shorter Compare view as well as the full tape. */
  inCompare?: boolean;
}

function rowLeader(row: StatRow): 'first' | 'second' | null {
  if (row.neutral || row.first === row.second) return null;
  const firstIsHigher = row.first > row.second;
  return firstIsHigher !== Boolean(row.lowerIsBetter) ? 'first' : 'second';
}

function StatBars({ rows }: { rows: StatRow[] }) {
  return (
    <ul className="h2h-stat-list">
      {rows.map((row) => {
        const leader = rowLeader(row);
        const max = Math.max(row.first, row.second, 1);
        const display = (value: number) => (row.suffix === '%' ? `${value.toFixed(1)}%` : String(value));
        return (
          <li key={row.key} className="h2h-stat-row">
            <span className={`h2h-stat-val ${leader === 'first' ? 'h2h-better' : ''}`}>{display(row.first)}</span>
            <progress className="stats-bar h2h-bar h2h-bar--first" value={row.first} max={max} aria-hidden="true" />
            <span className="h2h-stat-label">{row.label}</span>
            <progress className="stats-bar h2h-bar" value={row.second} max={max} aria-hidden="true" />
            <span className={`h2h-stat-val h2h-stat-val--second ${leader === 'second' ? 'h2h-better' : ''}`}>{display(row.second)}</span>
          </li>
        );
      })}
    </ul>
  );
}

interface MatchupRecordProps {
  player1Id: string;
  data: HeadToHeadResponse | null;
}

/** The series score between the two corners. Wins follow the selected order. */
function MatchupRecord({ player1Id, data }: MatchupRecordProps) {
  const { t } = useTranslation();
  const record = data?.headToHead;

  if (!record) {
    return <p className="h2h-no-data">{t('statistics.headToHead.noHistory')}</p>;
  }

  const swapped = record.player1Id !== player1Id;
  return (
    <>
      <div className="h2h-record-score">
        <span className="h2h-record-wins">{swapped ? record.player2Wins : record.player1Wins}</span>
        <span className="h2h-record-draws">
          {t('statistics.labels.draws')}: {record.draws}
        </span>
        <span className="h2h-record-wins">{swapped ? record.player1Wins : record.player2Wins}</span>
      </div>
      <p className="h2h-record-meta">
        <span>{record.totalMatches} {t('statistics.labels.totalMatches')}</span>
        <span>{record.championshipMatches} {t('statistics.labels.championshipMatches')}</span>
      </p>
    </>
  );
}

interface RecentResultsProps {
  data: HeadToHeadResponse;
  players: StatsPlayer[];
  player1Id: string;
}

function RecentResults({ data, players, player1Id }: RecentResultsProps) {
  const { t } = useTranslation();
  const results = data.headToHead?.recentResults ?? [];
  if (results.length === 0) return null;

  return (
    <section className="stats-section">
      <h2 className="stats-section__title">{t('statistics.headToHead.recentResults')}</h2>
      <ul className="stats-rows">
        {results.map((result) => {
          const winner = players.find((player) => player.playerId === result.winnerId);
          return (
            <li key={result.matchId}>
              <div className="stats-row__main">
                <span className="stats-row__title">
                  {winner ? `${winner.name} (${winner.wrestlerName})` : t('statistics.labels.draws')}
                </span>
                <span className="stats-row__detail h2h-recent-date">{formatCalendarDate(result.date)}</span>
              </div>
              {winner && (
                <Badge tone={result.winnerId === player1Id ? 'primary' : 'pink'}>
                  {result.winnerId === player1Id ? t('statistics.headToHead.player1Win') : t('statistics.headToHead.player2Win')}
                </Badge>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface EdgeSummaryProps {
  rows: StatRow[];
  first?: StatsPlayer;
  second?: StatsPlayer;
}

function EdgeSummary({ rows, first, second }: EdgeSummaryProps) {
  const { t } = useTranslation();
  const leaders = rows.filter((row) => !row.neutral).map(rowLeader);
  const firstCount = leaders.filter((leader) => leader === 'first').length;
  const secondCount = leaders.filter((leader) => leader === 'second').length;
  const leader = firstCount > secondCount ? first : secondCount > firstCount ? second : undefined;

  return (
    <section className="stats-section">
      <h2 className="stats-section__title">{t('statistics.headToHead.statisticalEdge')}</h2>
      <div className="h2h-edge">
        <p className="h2h-edge-verdict">
          {leader
            ? `${leader.name} (${leader.wrestlerName}) ${t('statistics.taleOfTape.hasTheEdge')}`
            : t('statistics.taleOfTape.evenlyMatched')}
        </p>
        <p className="h2h-edge-count">
          <span>{first?.name}: {firstCount} {t('statistics.headToHead.advantages')}</span>
          <span>{second?.name}: {secondCount} {t('statistics.headToHead.advantages')}</span>
          <span>{leaders.length - firstCount - secondCount} {t('statistics.taleOfTape.tied')}</span>
        </p>
      </div>
    </section>
  );
}

interface HeadToHeadComparisonProps {
  view?: HeadToHeadView;
}

function HeadToHeadComparison({ view = 'compare' }: HeadToHeadComparisonProps) {
  const { t } = useTranslation();
  const { search } = useLocation();
  const { roster, players, seasons, player1Id, player2Id, seasonId, comparison, select } = useHeadToHead();
  const images = usePlayerImages();

  const title = view === 'tape' ? t('statistics.taleOfTape.title') : t('statistics.headToHead.title');
  const header = (
    <PageHeader
      eyebrow={t('nav.statistics')}
      title={title}
      actions={
        <SeasonSelector
          seasons={seasons}
          selectedSeasonId={seasonId}
          onSeasonChange={(season) => select({ season })}
        />
      }
    />
  );

  if (roster.loading) {
    return (
      <div className="stats-page">
        {header}
        <Skeleton variant="block" count={4} />
      </div>
    );
  }

  if (roster.failed) {
    return (
      <div className="stats-page">
        {header}
        <EmptyState
          title={t('statistics.loadFailed')}
          actionLabel={t('common.retry')}
          onAction={roster.reload}
        />
      </div>
    );
  }

  if (players.length < 2) {
    return (
      <div className="stats-page">
        {header}
        <EmptyState title={title} description={t('statistics.headToHead.needTwoPlayers')} />
      </div>
    );
  }

  const player1 = players.find((player) => player.playerId === player1Id);
  const player2 = players.find((player) => player.playerId === player2Id);
  const samePlayer = player1Id === player2Id;
  const data = comparison.loading ? null : comparison.data;
  const firstStats = data?.player1Stats;
  const secondStats = data?.player2Stats;
  const record = data?.headToHead;
  const swapped = record ? record.player1Id !== player1Id : false;

  const allRows: StatRow[] = firstStats && secondStats ? [
    { key: 'matches', label: t('statistics.labels.matchesPlayed'), first: firstStats.matchesPlayed, second: secondStats.matchesPlayed, neutral: true, inCompare: true },
    { key: 'wins', label: t('statistics.labels.wins'), first: firstStats.wins, second: secondStats.wins, inCompare: true },
    { key: 'losses', label: t('statistics.labels.losses'), first: firstStats.losses, second: secondStats.losses, lowerIsBetter: true, inCompare: true },
    { key: 'draws', label: t('statistics.labels.draws'), first: firstStats.draws, second: secondStats.draws, neutral: true },
    { key: 'winPercentage', label: t('statistics.labels.winPercentage'), first: firstStats.winPercentage, second: secondStats.winPercentage, suffix: '%', inCompare: true },
    { key: 'currentStreak', label: t('statistics.labels.currentStreak'), first: firstStats.currentWinStreak, second: secondStats.currentWinStreak, inCompare: true },
    { key: 'longestWinStreak', label: t('statistics.labels.longestWinStreak'), first: firstStats.longestWinStreak, second: secondStats.longestWinStreak, inCompare: true },
    { key: 'longestLossStreak', label: t('statistics.labels.longestLossStreak'), first: firstStats.longestLossStreak, second: secondStats.longestLossStreak, lowerIsBetter: true },
    { key: 'titleWins', label: t('statistics.labels.titleWins'), first: firstStats.championshipWins, second: secondStats.championshipWins, inCompare: true },
    { key: 'titleLosses', label: t('statistics.labels.titleLosses'), first: firstStats.championshipLosses, second: secondStats.championshipLosses, lowerIsBetter: true },
  ] : [];
  const seriesRow: StatRow | null = record ? {
    key: 'series',
    label: t('statistics.headToHead.headToHeadRecord'),
    first: swapped ? record.player2Wins : record.player1Wins,
    second: swapped ? record.player1Wins : record.player2Wins,
  } : null;
  const edgeRows = seriesRow ? [...allRows, seriesRow] : allRows;
  const shownRows = view === 'tape' ? allRows : allRows.filter((row) => row.inCompare);

  // Alphabetical, so the select's type-to-jump lands somewhere useful.
  const playerOptions = players
    .map((player) => ({
      value: player.playerId,
      label: player.name.trim() ? `${player.name} (${player.wrestlerName})` : player.wrestlerName,
    }))
    .sort((first, second) => first.label.localeCompare(second.label));

  return (
    <div className="stats-page">
      {header}

      <section className="h2h-matchup" aria-label={t('statistics.headToHead.headToHeadRecord')}>
        <div className="h2h-corner">
          <Avatar src={images.get(player1Id)} name={player1?.name ?? ''} size="lg" ring="pink" />
          <Select
            label={t('statistics.headToHead.player1')}
            value={player1Id}
            onValueChange={(player) => select({ player1: player })}
            options={playerOptions}
            className="h2h-corner__select"
          />
        </div>
        <div className="h2h-record">
          <p className="h2h-record-title">{t('statistics.headToHead.headToHeadRecord')}</p>
          {samePlayer ? (
            <p className="h2h-no-data">{t('common.vs')}</p>
          ) : comparison.loading ? (
            <p className="h2h-no-data">{t('common.loading')}</p>
          ) : (
            <MatchupRecord player1Id={player1Id} data={data ?? null} />
          )}
        </div>
        <div className="h2h-corner">
          <Avatar src={images.get(player2Id)} name={player2?.name ?? ''} size="lg" ring="cyan" />
          <Select
            label={t('statistics.headToHead.player2')}
            value={player2Id}
            onValueChange={(player) => select({ player2: player })}
            options={playerOptions}
            className="h2h-corner__select"
          />
        </div>
      </section>

      <SectionTabs
        variant="compact"
        label={t('statistics.headToHead.viewLabel')}
        activeTo={view === 'tape' ? `${TAPE_PATH}${search}` : `${COMPARE_PATH}${search}`}
        items={[
          { to: `${COMPARE_PATH}${search}`, label: t('statistics.headToHead.compareView') },
          { to: `${TAPE_PATH}${search}`, label: t('statistics.nav.taleOfTape') },
        ]}
      />

      {samePlayer ? (
        <EmptyState title={t('statistics.headToHead.selectDifferent')} />
      ) : comparison.failed ? (
        <EmptyState
          title={t('statistics.loadFailed')}
          actionLabel={t('common.retry')}
          onAction={comparison.reload}
        />
      ) : comparison.loading ? (
        <Skeleton variant="block" count={4} />
      ) : (
        <>
          {shownRows.length > 0 && (
            <section className="stats-section">
              <h2 className="stats-section__title">
                {view === 'tape' ? t('statistics.taleOfTape.title') : t('statistics.headToHead.statComparison')}
              </h2>
              <StatBars rows={shownRows} />
            </section>
          )}
          {view === 'compare' && data && <RecentResults data={data} players={players} player1Id={player1Id} />}
          {allRows.length > 0 && <EdgeSummary rows={edgeRows} first={player1} second={player2} />}
        </>
      )}
    </div>
  );
}

export default HeadToHeadComparison;
