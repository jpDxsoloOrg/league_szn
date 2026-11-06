import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Trophy } from 'lucide-react';
import { tournamentsApi, playersApi } from '../services/api';
import type { PlayerDirectoryEntry } from '../services/api/players.api';
import type { Tournament } from '../types';
import Badge from './ui/Badge';
import type { BadgeTone } from './ui/Badge';
import Button from './ui/Button';
import Card from './ui/Card';
import DataTable from './ui/DataTable';
import EmptyState from './ui/EmptyState';
import Modal from './ui/Modal';
import PageHeader from './ui/PageHeader';
import Skeleton from './ui/Skeleton';
import './Tournaments.css';

const STATUS_TONES: Record<Tournament['status'], BadgeTone> = {
  upcoming: 'primary',
  'in-progress': 'live',
  completed: 'neutral',
};

interface StandingRow {
  playerId: string;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
}

export default function Tournaments() {
  const { t } = useTranslation();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<PlayerDirectoryEntry[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [tournamentData, playerData] = await Promise.all([
          tournamentsApi.getAll(abortController.signal),
          playersApi.getDirectory(abortController.signal),
        ]);
        if (!abortController.signal.aborted) {
          setTournaments(tournamentData);
          setPlayers(playerData);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message || 'Failed to load tournaments');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => abortController.abort();
  }, [reloadKey]);

  const playerNames = useMemo(
    () => new Map(players.map((player) => [player.playerId, player.name])),
    [players],
  );

  const getPlayerName = (playerId: string) => playerNames.get(playerId) ?? t('common.formerMember');

  const typeLabel = (tournament: Tournament) =>
    tournament.type === 'single-elimination' ? t('tournaments.singleElimination') : t('tournaments.roundRobin');

  const statusBadge = (status: Tournament['status']) => {
    const statusLabels: Record<Tournament['status'], string> = {
      upcoming: t('tournaments.statusUpcoming'),
      'in-progress': t('tournaments.statusInProgress'),
      completed: t('tournaments.statusCompleted'),
    };
    return <Badge tone={STATUS_TONES[status]}>{statusLabels[status]}</Badge>;
  };

  const renderRoundRobinStandings = (tournament: Tournament) => {
    if (!tournament.standings) return null;

    // Sort by points desc, then wins desc for a stable tiebreak display.
    const standingRows: StandingRow[] = Object.entries(tournament.standings)
      .map(([playerId, stats]) => ({ playerId, rank: 0, ...stats }))
      .sort((first, second) => (second.points - first.points) || (second.wins - first.wins))
      .map((row, index) => ({ ...row, rank: index + 1 }));

    const leader = standingRows[0];
    const runnerUp = standingRows[1];
    const pointsGap = leader && runnerUp ? leader.points - runnerUp.points : 0;

    return (
      <section className="tournament-detail__section">
        <h3>{t('tournaments.standings')}</h3>
        {leader && (
          <dl className="tournament-summary">
            <div>
              <dt>{t('tournaments.summaryLeader')}</dt>
              <dd>{getPlayerName(leader.playerId)}</dd>
            </div>
            <div>
              <dt>{t('tournaments.summaryPoints')}</dt>
              <dd>{leader.points}</dd>
            </div>
            <div>
              <dt>{t('tournaments.summaryGap')}</dt>
              <dd>{runnerUp ? t('tournaments.summaryGapValue', { count: pointsGap }) : t('common.unknown')}</dd>
            </div>
          </dl>
        )}
        <DataTable
          caption={t('tournaments.standings')}
          density="dense"
          rows={standingRows}
          rowKey={(row) => row.playerId}
          columns={[
            { key: 'rank', header: t('tournaments.table.rank'), render: (row) => row.rank },
            { key: 'player', header: t('tournaments.table.player'), render: (row) => getPlayerName(row.playerId) },
            { key: 'wins', header: t('tournaments.table.w'), align: 'center', render: (row) => row.wins },
            { key: 'losses', header: t('tournaments.table.l'), align: 'center', render: (row) => row.losses },
            { key: 'draws', header: t('tournaments.table.d'), align: 'center', render: (row) => row.draws },
            {
              key: 'points',
              header: t('tournaments.table.points'),
              align: 'center',
              render: (row) => <span className="points">{row.points}</span>,
            },
          ]}
        />
      </section>
    );
  };

  const renderBracketParticipant = (participant: string | undefined, winner: string | undefined) => (
    <div className={`bracket-participant${participant && winner === participant ? ' bracket-participant--winner' : ''}`}>
      <span>{participant ? getPlayerName(participant) : t('common.tbd')}</span>
      {participant && winner === participant && (
        <Check aria-label={t('tournaments.winner')} size={16} />
      )}
    </div>
  );

  const renderBracket = (tournament: Tournament) => {
    if (!tournament.brackets) return null;

    return (
      <section className="tournament-detail__section">
        <h3>{t('tournaments.bracket')}</h3>
        <div className="bracket-rounds">
          {tournament.brackets.rounds.map((round) => (
            <div key={round.roundNumber} className="bracket-round">
              <h4>{t('tournaments.round')} {round.roundNumber}</h4>
              {round.matches.map((match, index) => (
                <div key={`round-${round.roundNumber}-match-${index}`} className="bracket-match">
                  {renderBracketParticipant(match.participant1, match.winner)}
                  {renderBracketParticipant(match.participant2, match.winner)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    );
  };

  const header = <PageHeader title={t('tournaments.title')} />;

  if (loading) {
    return (
      <div className="tournaments-page">
        {header}
        <Skeleton variant="block" count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="tournaments-page">
        {header}
        <EmptyState
          title={t('common.error')}
          description={error}
          actionLabel={t('common.retry')}
          onAction={() => setReloadKey((key) => key + 1)}
        />
      </div>
    );
  }

  if (tournaments.length === 0) {
    return (
      <div className="tournaments-page">
        {header}
        <EmptyState title={t('tournaments.noTournaments')} icon={<Trophy aria-hidden="true" size={32} />} />
      </div>
    );
  }

  return (
    <div className="tournaments-page">
      {header}

      <div className="tournaments-grid">
        {tournaments.map((tournament) => (
          <Card key={tournament.tournamentId} className="tournament-card">
            <div className="tournament-card__header">
              <h2>{tournament.name}</h2>
              {statusBadge(tournament.status)}
            </div>
            <p className="tournament-card__meta">
              {typeLabel(tournament)} · {tournament.participants.length} {t('tournaments.participants')}
            </p>
            {tournament.winner && (
              <p className="tournament-card__winner">
                <Trophy aria-hidden="true" size={16} />
                <span className="sr-only">{t('tournaments.winner')}: </span>
                <span>{getPlayerName(tournament.winner)}</span>
              </p>
            )}
            <Button variant="secondary" size="sm" onClick={() => setSelectedTournament(tournament)}>
              {t('tournaments.viewDetails')}
            </Button>
          </Card>
        ))}
      </div>

      <Modal
        open={!!selectedTournament}
        onClose={() => setSelectedTournament(null)}
        title={selectedTournament?.name ?? t('tournaments.title')}
        size="lg"
      >
        {selectedTournament && (
          <div className="tournament-detail">
            <div className="tournament-detail__meta">
              {statusBadge(selectedTournament.status)}
              <span>{typeLabel(selectedTournament)}</span>
            </div>

            {selectedTournament.type === 'round-robin'
              ? renderRoundRobinStandings(selectedTournament)
              : renderBracket(selectedTournament)}

            <section className="tournament-detail__section">
              <h3>{t('tournaments.participants')}</h3>
              <ul className="tournament-participants">
                {selectedTournament.participants.map((playerId) => (
                  <li key={playerId}>{getPlayerName(playerId)}</li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </Modal>
    </div>
  );
}
