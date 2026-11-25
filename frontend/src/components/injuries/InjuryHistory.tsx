import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import { injuriesApi } from '../../services/api/injuries.api';
import type { Match } from '../../types';
import type { PublicInjury } from '../../types/injury';
import Card from '../ui/Card';
import { activeInjury, formatInjuryDate } from './injuryDisplay';
import './InjuryHistory.css';

export interface InjuryHistoryProps {
  playerId: string;
  /** The player's matches, to name the match an injury came from. */
  matches?: readonly Match[];
}

/**
 * Public injury history on a profile (INJ-12): severity, weeks out, dates and
 * the match it came from. Renders nothing while the feature is off, while
 * loading, on an error, or when the player has never been injured.
 */
export default function InjuryHistory({ playerId, matches = [] }: InjuryHistoryProps) {
  const { t, i18n } = useTranslation();
  const { features } = useSiteConfig();
  const enabled = Boolean(features.injuries);
  const headingId = useId();
  const [history, setHistory] = useState<PublicInjury[]>([]);

  useEffect(() => {
    setHistory([]);
    if (!enabled) return undefined;
    const controller = new AbortController();
    const load = async () => {
      try {
        const rows = await injuriesApi.getPlayerHistory(playerId, controller.signal);
        if (!controller.signal.aborted) setHistory(rows);
      } catch {
        // History is extra information; the profile stays usable without it.
      }
    };
    void load();
    return () => controller.abort();
  }, [enabled, playerId]);

  if (!enabled || history.length === 0) return null;

  const date = (iso: string) => formatInjuryDate(iso, i18n.language);
  const matchDates = new Map(matches.map((match) => [match.matchId, match.date]));

  return (
    <section className="profile-section" aria-labelledby={headingId}>
      <h2 className="profile-section__title" id={headingId}>{t('injuries.history.title')}</h2>
      <Card>
        <ul className="injury-history">
          {history.map((injury) => {
            const ongoing = !injury.endedAt && activeInjury(injury) !== null;
            const matchDate = injury.matchId ? matchDates.get(injury.matchId) : undefined;
            return (
              <li key={injury.injuryId} className="injury-history__item">
                <span className="injury-history__summary">
                  {t('injuries.history.summary', {
                    severity: t(`injuries.severity.${injury.severity}`),
                    count: injury.weeks,
                  })}
                </span>
                <span className="injury-history__dates">
                  {ongoing
                    ? t('injuries.history.ongoing', { start: date(injury.startedAt), end: date(injury.returnsAt) })
                    : t('injuries.history.range', { start: date(injury.startedAt), end: date(injury.endedAt ?? injury.returnsAt) })}
                </span>
                {matchDate && (
                  <span className="injury-history__match">
                    {t('injuries.history.fromMatch', { date: date(matchDate) })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
