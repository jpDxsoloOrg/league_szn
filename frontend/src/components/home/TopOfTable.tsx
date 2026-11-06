import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { standingsApi } from '../../services/api';
import type { Player } from '../../types';
import Avatar from '../ui/Avatar';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import FormDots from '../ui/FormDots';
import Skeleton from '../ui/Skeleton';
import HomeSection from './HomeSection';

const PLAYERS_SHOWN = 5;

/** Players with no matches have no place in the table yet. */
function withMatches(players: Player[]): Player[] {
  return players.filter((player) => player.wins + player.losses + player.draws > 0);
}

export interface TopOfTableProps {
  /** Active season, matching what the standings page opens on. Omit for all time. */
  seasonId?: string;
  seasonName?: string;
}

export default function TopOfTable({ seasonId, seasonName }: TopOfTableProps) {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<Player[]>([]);
  const [scope, setScope] = useState<'season' | 'allTime'>('season');
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const loadStandings = async () => {
      setStatus('loading');
      try {
        const standings = await standingsApi.get(seasonId, controller.signal);
        if (controller.signal.aborted) return;
        const seasonLeaders = withMatches(standings.players);
        // A season nobody on the roster has wrestled in yet says nothing, so lead with all time.
        if (seasonId && seasonLeaders.length === 0) {
          const allTime = await standingsApi.get(undefined, controller.signal);
          if (controller.signal.aborted) return;
          setPlayers(withMatches(allTime.players));
          setScope('allTime');
        } else {
          setPlayers(seasonLeaders);
          setScope('season');
        }
        setStatus('ready');
      } catch {
        if (!controller.signal.aborted) setStatus('failed');
      }
    };
    void loadStandings();
    return () => controller.abort();
  }, [seasonId, attempt]);

  return (
    <HomeSection
      title={t('home.topOfTable')}
      linkTo="/standings"
      linkLabel={t('home.fullStandings')}
    >
      {status === 'loading' && <Skeleton variant="block" count={3} />}
      {status === 'failed' && (
        <EmptyState
          title={t('home.standingsError')}
          actionLabel={t('common.retry')}
          onAction={() => setAttempt((current) => current + 1)}
        />
      )}
      {status === 'ready' && players.length === 0 && <p className="home-empty">{t('home.noStandings')}</p>}
      {status === 'ready' && players.length > 0 && (
        <Card padding="none">
          {scope === 'allTime'
            ? <p className="home-table__season">{t('standings.allTime')}</p>
            : seasonName && <p className="home-table__season">{seasonName}</p>}
          <ol className="home-list">
            {players.slice(0, PLAYERS_SHOWN).map((player, index) => {
              const displayName = player.currentWrestler || player.name;
              return (
                <li key={player.playerId}>
                  <Link to={`/player/${player.playerId}`} className="home-table__row">
                    <span className="home-table__rank">{index + 1}</span>
                    <Avatar src={player.imageUrl} name={displayName} size="sm" />
                    <span className="home-table__names">
                      <span className="home-table__wrestler">{displayName}</span>
                      {player.currentWrestler && <span className="home-table__player">{player.name}</span>}
                    </span>
                    <span className="home-table__record">
                      <span className="home-table__wld">{player.wins}-{player.losses}-{player.draws}</span>
                      {/* The API sends newest first; FormDots reads oldest to newest. */}
                      {player.recentForm && player.recentForm.length > 0 && (
                        <FormDots results={[...player.recentForm].reverse()} />
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </HomeSection>
  );
}
