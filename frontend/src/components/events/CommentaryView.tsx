import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { eventsApi } from '../../services/api';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formatCalendarDate } from '../../utils/dateUtils';
import type { CommentaryParticipant, EventCommentary } from '../../types/event';
import { defaultMatchIndex, groupByTeam } from '../../utils/commentary';
import Badge from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import Button from '../ui/Button';
import Skeleton from '../ui/Skeleton';
import { DESIGNATION_LABEL_KEYS } from './eventDisplay';
import CommentaryWrestlerCard from './CommentaryWrestlerCard';
import HeadToHeadStrip from './HeadToHeadStrip';
import './CommentaryView.css';

/** "singles" → "Singles", "triple-threat" → "Triple Threat". */
function prettyFormat(format: string): string {
  return format
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function CommentaryView() {
  const { eventId } = useParams<{ eventId: string }>();
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const [data, setData] = useState<EventCommentary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    eventsApi
      .getCommentary(eventId, controller.signal)
      .then((result) => {
        setData(result);
        setIndex(defaultMatchIndex(result.matches));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // Translated at render time so this effect doesn't depend on `t`.
        setError(err instanceof Error && err.message ? err.message : 'events.commentary.loadError');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [eventId]);

  const matches = useMemo(() => data?.matches ?? [], [data]);
  const total = matches.length;
  const match = matches[index];
  const nextIndex = useMemo(() => defaultMatchIndex(matches), [matches]);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIndex((i) => Math.min(total - 1, i + 1)), [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Leave browser shortcuts (Alt+←) and form controls alone.
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext]);

  if (loading) {
    return (
      <div className="commentary-page">
        <Skeleton variant="cards" count={2} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="commentary-page">
        <Button className="commentary-back" variant="ghost" size="sm" to={`/events/${eventId}`}>{t('events.commentary.backToEvent')}</Button>
        <p className="commentary-error" role="alert">
          {error === 'events.commentary.loadError' || !error ? t('events.commentary.loadError') : error}
        </p>
      </div>
    );
  }

  const count = match?.participants.length ?? 0;
  const compact = count >= 5;
  const gridClass =
    count <= 1 ? 'one' : count === 2 ? 'two' : count === 3 ? 'three' : count === 4 ? 'four' : 'six';
  const teamGroups = match ? groupByTeam(match) : null;

  // There is no "in progress" signal on a match, so anything after the
  // default one is simply upcoming.
  const statusPill = ((): { key: string; tone: BadgeTone } | null => {
    if (!match) return null;
    if (match.status === 'completed') return { key: 'completed', tone: 'neutral' };
    if (match.status === 'cancelled') return { key: 'cancelled', tone: 'neutral' };
    if (index === nextIndex) return { key: 'upNext', tone: 'pink' };
    return { key: 'upcoming', tone: 'primary' };
  })();

  const renderCard = (p: CommentaryParticipant, teamIndex?: number, teamLabel?: string) => (
    <CommentaryWrestlerCard
      key={p.playerId}
      participant={p}
      compact={compact}
      teamIndex={teamIndex}
      teamLabel={teamLabel}
    />
  );

  return (
    <div className="commentary-page">
      <header className="commentary-topbar">
        <div className="commentary-topbar-left">
          <Button variant="ghost" size="sm" to={`/events/${data.eventId}`}>{t('events.commentary.backToEvent')}</Button>
          <h1 className="commentary-event-name">
            {data.name} <span className="commentary-event-date">— {formatCalendarDate(data.date)}</span>
          </h1>
          {match && (
            <p className="commentary-match-label">
              <span>{t('events.commentary.matchOf', { n: index + 1, total })}</span>
              <span className="commentary-sep">·</span>
              <span>{t(DESIGNATION_LABEL_KEYS[match.designation])}</span>
              <span className="commentary-sep">·</span>
              <span>{prettyFormat(match.matchFormat)}</span>
              {match.stipulationName && (
                <>
                  <span className="commentary-sep">·</span>
                  <span>{match.stipulationName}</span>
                </>
              )}
              {match.isChampionship && match.championshipName && (
                <>
                  <span className="commentary-sep">·</span>
                  <span className="commentary-title-match">
                    {t('events.commentary.championship', { name: match.championshipName })}
                  </span>
                </>
              )}
              {statusPill && (
                <Badge tone={statusPill.tone}>{t(`events.commentary.${statusPill.key}`)}</Badge>
              )}
            </p>
          )}
        </div>
        <nav className="commentary-nav" aria-label={t('events.commentary.title')}>
          <Button variant="secondary" size="sm" onClick={goPrev} disabled={index <= 0}>
            {t('events.commentary.prevMatch')}
          </Button>
          <Button variant="secondary" size="sm" onClick={goNext} disabled={index >= total - 1}>
            {t('events.commentary.nextMatch')}
          </Button>
        </nav>
      </header>

      {!match ? (
        <p className="commentary-empty">{t('events.commentary.noMatches')}</p>
      ) : (
        <>
          {isMobile && count > 1 && (
            <nav className="commentary-chips" aria-label={t('events.commentary.jumpTo')}>
              {match.participants.map((p) => (
                <a key={p.playerId} href={`#commentary-${p.playerId}`} className="commentary-chip">
                  {p.wrestlerName}
                </a>
              ))}
            </nav>
          )}

          {teamGroups ? (
            <div className={`commentary-teams commentary-teams--${teamGroups.length}`}>
              {teamGroups.map((group, gi) => (
                <div key={group.index} className="commentary-team-block">
                  {gi > 0 && <div className="commentary-vs" aria-hidden="true">{t('events.commentary.vs')}</div>}
                  <div className={`commentary-team commentary-team--${group.index % 4}`}>
                    {group.members.map((p) =>
                      renderCard(
                        p,
                        group.index,
                        group.unlabelled ? undefined : t('events.commentary.team', { n: group.index + 1 }),
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={`commentary-grid commentary-grid--${gridClass}`}>
              {match.participants.map((p) => renderCard(p))}
            </div>
          )}

          <HeadToHeadStrip
            participants={match.participants}
            headToHead={match.headToHead}
            asList={isMobile}
          />
        </>
      )}
    </div>
  );
}
