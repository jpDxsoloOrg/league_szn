import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { matchesApi } from '../../../services/api';
import type { Match, Player } from '../../../types';
import type { HydratedRivalry } from '../../../types/rivalry';
import { formatMatchDate } from '../../../utils/dateUtils';
import { describeSides, groupMatchSides } from '../../../utils/matchDisplay';
import Badge from '../../ui/Badge';
import EmptyState from '../../ui/EmptyState';
import Skeleton from '../../ui/Skeleton';
import { resolvePlayerFullLabel } from '../rivalryUtils';

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
  const startedAt = hydrated.rivalry.startedAt;
  const endedAt = hydrated.rivalry.endedAt;
  const participantSet = useMemo(
    () => new Set(hydrated.rivalry.participants.map((p) => p.playerId)),
    [hydrated.rivalry.participants],
  );
  const lookup = useMemo(() => new Map(players.map((p) => [p.playerId, p] as const)), [players]);
  const labelOf = (id: string) => resolvePlayerFullLabel(lookup.get(id), t('common.unknown'));

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
      .then((all) => {
        const upcoming = all.filter((m) =>
          (m.status === 'scheduled' || m.status === 'open-signups') && withinWindow(m.date),
        );
        if (upcoming.length > 0) {
          if (mounted) setMatches(upcoming);
          return;
        }
        // Legacy fallback. Fetch all matches (single call), filter to
        // upcoming states + lifecycle window + at-least-two rivalry
        // participants. Outsiders in the match (e.g. a triple-threat
        // involving the two rivals + a third party) are allowed.
        return matchesApi.getAll({}, controller.signal).then((everything) => {
          const overlap = everything.filter((m) => {
            if (m.status !== 'scheduled' && m.status !== 'open-signups') return false;
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

  if (loading) return <Skeleton variant="block" count={3} />;
  if (matches.length === 0) return <EmptyState title={t('rivalries.detail.noNextEvent')} />;

  return (
    <ul className="rivalry-detail-matches">
      {matches.map((m) => (
        <li key={m.matchId}>
          <Link to={`/matches?matchId=${m.matchId}`} className="rivalry-detail-matches__row">
            <span className="rivalry-detail-matches__text">
              <span className="rivalry-detail-matches__teams">
                {describeSides(
                  groupMatchSides(m.participants, (id) => id, m.teams, m.matchFormat).map((side) => side.map(labelOf)),
                  t('common.vs'),
                )}
              </span>
              <span className="rivalry-detail-matches__date">{formatMatchDate(m.date)}</span>
            </span>
            {m.isChampionship && <Badge tone="warning">{t('challenges.board.titleMatch')}</Badge>}
            <ChevronRight aria-hidden="true" size={20} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
