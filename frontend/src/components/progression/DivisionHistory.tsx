import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { progressionApi } from '../../services/api';
import type { DivisionHistoryEntry, DivisionMoveKind } from '../../types/progression';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import './DivisionHistory.css';

/** One division on the path. The starting division has no move or date. */
export interface DivisionStop {
  key: string;
  divisionName: string | null;
  kind?: DivisionMoveKind;
  movedAt?: string;
}

/**
 * Turn the moves into the path the player walked: the first move's source,
 * then each target. A gap (a move that starts somewhere other than where the
 * last one ended, e.g. after an admin edit) adds that source as its own stop.
 */
export function toDivisionStops(entries: readonly DivisionHistoryEntry[]): DivisionStop[] {
  const stops: DivisionStop[] = [];
  let currentDivisionId: string | null = null;
  for (const entry of entries) {
    if (entry.fromDivisionId !== currentDivisionId) {
      stops.push({ key: `from-${entry.id}`, divisionName: entry.fromDivisionName });
    }
    stops.push({ key: entry.id, divisionName: entry.toDivisionName, kind: entry.kind, movedAt: entry.movedAt });
    currentDivisionId = entry.toDivisionId;
  }
  return stops;
}

/**
 * Profile section (DMV-09): the player's division path, e.g.
 * "Young Boys → NXT → Raw", with the date of each move. Renders nothing
 * until the player has moved at least once.
 */
export default function DivisionHistory({ playerId }: { playerId: string }) {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const [entries, setEntries] = useState<DivisionHistoryEntry[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const rows = await progressionApi.getDivisionHistory(playerId, controller.signal);
        if (!controller.signal.aborted) setEntries(rows);
      } catch {
        if (!controller.signal.aborted) setEntries([]);
      }
    };
    void load();
    return () => controller.abort();
  }, [playerId]);

  if (entries.length === 0) return null;

  const stops = toDivisionStops(entries);
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  return (
    <section className="profile-section division-history" aria-labelledby={headingId} data-testid="division-history">
      <h2 className="profile-section__title" id={headingId}>{t('progression.history.title')}</h2>
      <Card>
        <ol className="division-history__path">
          {stops.map((stop) => (
            <li key={stop.key} className="division-history__stop">
              <Badge tone={stop.kind ? 'primary' : 'neutral'}>
                {stop.divisionName ?? t('progression.history.unknownDivision')}
              </Badge>
              {stop.kind && stop.movedAt && (
                <span className="division-history__meta">
                  {t(`progression.history.kind.${stop.kind}`)}
                  {' · '}
                  <time dateTime={stop.movedAt}>{dateFormat.format(new Date(stop.movedAt))}</time>
                </span>
              )}
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}
