import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { tagTeamsApi } from '../../services/api';
import { logger } from '../../utils/logger';
import type { TagTeamStanding } from '../../types/tagTeam';
import Avatar from '../ui/Avatar';
import DataTable from '../ui/DataTable';
import type { DataTableColumn } from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import Podium from '../ui/Podium';
import Skeleton from '../ui/Skeleton';
import GroupFormCell from '../factions/GroupFormCell';
import { formatRecord } from '../factions/factionFormat';
import '../factions/groupUi.css';

const PODIUM_SIZE = 3;

interface RankedTeam extends TagTeamStanding {
  rank: number;
}

export default function TagTeamStandings() {
  const { t } = useTranslation();
  const [standings, setStandings] = useState<TagTeamStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchStandings = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await tagTeamsApi.getStandings(abortController.signal);
        if (!abortController.signal.aborted) setStandings(data);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Failed to load tag team standings');
          setError(err.message || t('tagTeams.standingsTable.error', 'Failed to load standings'));
        }
      } finally {
        if (!abortController.signal.aborted) setLoading(false);
      }
    };

    fetchStandings();
    return () => abortController.abort();
  }, [t, reloadKey]);

  if (loading) return <Skeleton variant="table" />;

  if (error) {
    return (
      <EmptyState
        title={t('common.error', 'Error')}
        description={error}
        actionLabel={t('common.retry', 'Retry')}
        onAction={() => setReloadKey((key) => key + 1)}
      />
    );
  }

  if (standings.length === 0) {
    return (
      <EmptyState
        title={t('tagTeams.standings', 'Tag Team Standings')}
        description={t('tagTeams.standingsTable.empty', 'No tag team standings available yet.')}
      />
    );
  }

  const ranked: RankedTeam[] = standings.map((team, index) => ({ ...team, rank: index + 1 }));
  const showPodium = ranked.length >= PODIUM_SIZE;
  const tableRows = showPodium ? ranked.slice(PODIUM_SIZE) : ranked;

  const columns: DataTableColumn<RankedTeam>[] = [
    { key: 'rank', header: t('tagTeams.rank', 'Rank'), render: (team) => team.rank, sortValue: (team) => team.rank },
    {
      key: 'name',
      header: t('tagTeams.standingsTable.name', 'Name'),
      render: (team) => (
        <Link to={`/tag-teams/${team.tagTeamId}`} className="group-table-name">
          <Avatar src={team.imageUrl} name={team.name} size="sm" />
          {team.name}
        </Link>
      ),
      sortValue: (team) => team.name,
    },
    {
      key: 'players',
      header: t('tagTeams.standingsTable.players', 'Players'),
      render: (team) => `${team.player1Name} & ${team.player2Name}`,
      hideOnMobile: true,
    },
    {
      key: 'record',
      header: t('tagTeams.standingsTable.record', 'W-L-D'),
      render: (team) => formatRecord(team.wins, team.losses, team.draws),
      sortValue: (team) => team.wins,
      align: 'end',
    },
    {
      key: 'winRate',
      header: t('tagTeams.winPct', 'Win%'),
      render: (team) => `${team.winPercentage.toFixed(1)}%`,
      sortValue: (team) => team.winPercentage,
      align: 'end',
    },
    {
      key: 'form',
      header: t('tagTeams.form', 'Form'),
      render: (team) => <GroupFormCell recentForm={team.recentForm} currentStreak={team.currentStreak} />,
    },
  ];

  return (
    <div className="group-page">
      {showPodium && (
        <Podium
          label={t('tagTeams.standings', 'Tag Team Standings')}
          entries={ranked.slice(0, PODIUM_SIZE).map((team) => ({
            id: team.tagTeamId,
            name: team.name,
            imageUrl: team.imageUrl,
            subtitle: `${team.player1Name} & ${team.player2Name}`,
            record: formatRecord(team.wins, team.losses, team.draws),
            to: `/tag-teams/${team.tagTeamId}`,
            stats: [{ label: t('tagTeams.winPct', 'Win%'), value: `${team.winPercentage.toFixed(1)}%` }],
          }))}
        />
      )}
      {tableRows.length > 0 && (
        <DataTable
          caption={t('tagTeams.standings', 'Tag Team Standings')}
          columns={columns}
          rows={tableRows}
          rowKey={(team) => team.tagTeamId}
        />
      )}
    </div>
  );
}
