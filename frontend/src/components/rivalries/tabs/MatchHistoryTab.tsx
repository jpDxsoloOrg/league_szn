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
 * Match history scoped to this rivalry. Filters server-side by
 * rivalryId when present; falls back to participant-set overlap for
 * legacy matches that pre-date RIV-06.
 */
export default function MatchHistoryTab({ hydrated, players }: TabProps) {
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
      .then((tagged) => {
        if (tagged.length > 0) {
          if (mounted) setMatches(tagged);
          return;
        }
        // Legacy fallback — show matches whose participants overlap.
        return matchesApi.getAll({ status: 'completed' }, controller.signal).then((all) => {
          const overlap = all.filter((m) => {
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
    return <div className="rivalry-tab__empty">{t('rivalries.detail.noMatches')}</div>;

  return (
    <div className="rivalry-tab">
      <ul className="rivalry-detail-matches">
        {matches
          .filter((m) => m.status === 'completed')
          .map((m) => (
            <li key={m.matchId} className="rivalry-tab__card">
              <span className="rivalry-detail-matches__date">
                {new Date(m.date).toLocaleDateString()}
              </span>
              <span className="rivalry-detail-matches__teams">
                {m.participants.map((id) => lookup.get(id)?.currentWrestler ?? id).join(' vs ')}
              </span>
              {m.winners && m.winners.length > 0 && (
                <span className="rivalry-detail-matches__winner">
                  W: {m.winners.map((id) => lookup.get(id)?.currentWrestler ?? id).join(', ')}
                </span>
              )}
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
