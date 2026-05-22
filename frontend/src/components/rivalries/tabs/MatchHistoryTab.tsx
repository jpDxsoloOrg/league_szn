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
 * legacy matches that pre-date RIV-06. Either way the result is
 * additionally clipped to the rivalry's startedAt..endedAt window so
 * a multi-year H2H between two wrestlers doesn't bleed into a
 * single rivalry's history.
 */
export default function MatchHistoryTab({ hydrated, players }: TabProps) {
  const { t } = useTranslation();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const rivalryId = hydrated.rivalry.rivalryId;
  const startedAt = hydrated.rivalry.startedAt;
  const endedAt = hydrated.rivalry.endedAt;
  const participantSet = useMemo(
    () => new Set(hydrated.rivalry.participants.map((p) => p.playerId)),
    [hydrated.rivalry.participants],
  );
  const lookup = useMemo(() => new Map(players.map((p) => [p.playerId, p] as const)), [players]);

  const withinWindow = (date: string): boolean => {
    if (startedAt && date < startedAt) return false;
    if (endedAt && date > endedAt) return false;
    return true;
  };

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    setLoading(true);

    matchesApi
      .getAll({ rivalryId }, controller.signal)
      .then((tagged) => {
        if (tagged.length > 0) {
          if (mounted) setMatches(tagged.filter((m) => withinWindow(m.date)));
          return;
        }
        // Legacy fallback — show matches whose participants overlap AND
        // that fall within the rivalry's lifecycle window. A match
        // counts as a rivalry match if at least two of its participants
        // are in the rivalry; outsiders (e.g. a triple-threat involving
        // the rivals + a third party) are allowed.
        return matchesApi.getAll({ status: 'completed' }, controller.signal).then((all) => {
          const overlap = all.filter((m) => {
            if (!m.participants || m.participants.length < 2) return false;
            if (!withinWindow(m.date)) return false;
            let hits = 0;
            for (const pid of m.participants) {
              if (participantSet.has(pid)) hits++;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rivalryId, participantSet, startedAt, endedAt]);

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
