import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { matchesApi } from '../../../services/api';
import type { Match, Player } from '../../../types';
import type { HydratedRivalry } from '../../../types/rivalry';

interface TabProps {
  hydrated: HydratedRivalry;
  players: Player[];
}

/**
 * Scheduled + open-signup matches scoped to this rivalry. Mirrors the
 * match-history tab's filter strategy: try rivalryId first, fall back
 * to participant overlap for matches that pre-date RIV-06.
 */
export default function FutureMatchesTab({ hydrated, players }: TabProps) {
  const { t } = useTranslation();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const rivalryId = hydrated.rivalry.rivalryId;
  const participantSet = useMemo(
    () => new Set(hydrated.rivalry.participants.map((p) => p.playerId)),
    [hydrated.rivalry.participants],
  );
  const lookup = useMemo(() => new Map(players.map((p) => [p.playerId, p] as const)), [players]);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    setLoading(true);

    matchesApi
      .getAll({ rivalryId }, controller.signal)
      .then((all) => {
        const upcoming = all.filter((m) => m.status === 'scheduled' || m.status === 'open-signups');
        if (upcoming.length > 0) {
          if (mounted) setMatches(upcoming);
          return;
        }
        return matchesApi.getAll({ status: 'scheduled' }, controller.signal).then((scheduled) => {
          const overlap = scheduled.filter((m) => {
            if (!m.participants || m.participants.length < 2) return false;
            let hits = 0;
            for (const pid of m.participants) {
              if (participantSet.has(pid)) hits++;
              else return false;
            }
            return hits >= 2;
          });
          if (mounted) setMatches(overlap);
        });
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [rivalryId, participantSet]);

  if (loading) return <div className="rivalry-tab__empty">…</div>;
  if (matches.length === 0)
    return <div className="rivalry-tab__empty">{t('rivalries.detail.noNextEvent')}</div>;

  return (
    <div className="rivalry-tab">
      <ul className="rivalry-detail-matches">
        {matches.map((m) => (
          <li key={m.matchId} className="rivalry-tab__card">
            <span className="rivalry-detail-matches__date">
              {new Date(m.date).toLocaleString()}
            </span>
            <span className="rivalry-detail-matches__teams">
              {m.participants.map((id) => lookup.get(id)?.currentWrestler ?? id).join(' vs ')}
            </span>
            {m.isChampionship && (
              <span className="rivalry-detail-matches__champ">★</span>
            )}
            <Link to={`/matches/${m.matchId}`} className="rivalry-detail-link">
              →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
