import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { eventsApi } from '../../services/api';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { formatDate } from '../../utils/dateUtils';
import type { CommentaryMatch, CommentaryParticipant, EventCommentary, MatchDesignation } from '../../types/event';
import { defaultMatchIndex } from '../../utils/commentary';
import CommentaryWrestlerCard from './CommentaryWrestlerCard';
import HeadToHeadStrip from './HeadToHeadStrip';
import './CommentaryView.css';

const designationLabels: Record<MatchDesignation, string> = {
  'pre-show': 'events.designations.preShow',
  opener: 'events.designations.opener',
  midcard: 'events.designations.midcard',
  'co-main': 'events.designations.coMain',
  'main-event': 'events.designations.mainEvent',
};

/** "singles" → "Singles", "triple-threat" → "Triple Threat". */
function prettyFormat(format: string): string {
  return format
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

interface TeamGroup {
  index: number;
  members: CommentaryParticipant[];
}

/** Group participants by `teams`; anyone not on a team gets their own group. */
function groupByTeam(match: CommentaryMatch): TeamGroup[] | null {
  if (!match.teams || match.teams.length < 2) return null;
  const byId = new Map(match.participants.map((p) => [p.playerId, p]));
  const placed = new Set<string>();
  const groups: TeamGroup[] = match.teams.map((team, index) => {
    const members = team
      .map((id) => byId.get(id))
      .filter((p): p is CommentaryParticipant => p !== undefined);
    members.forEach((p) => placed.add(p.playerId));
    return { index, members };
  });
  const leftovers = match.participants.filter((p) => !placed.has(p.playerId));
  if (leftovers.length > 0) groups.push({ index: groups.length, members: leftovers });
  return groups.filter((g) => g.members.length > 0);
}

export default function CommentaryView() {
  const { eventId } = useParams<{ eventId: string }>();
  const { t } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 768px)');

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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext]);

  if (loading) {
    return (
      <div className="commentary-page">
        <div className="loading-state">
          <div className="loading-spinner" role="status" aria-label={t('events.commentary.loading')} />
          <p className="loading-text">{t('events.commentary.loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="commentary-page">
        <Link to={`/events/${eventId}`} className="back-link">{t('events.commentary.backToEvent')}</Link>
        <div className="error-message" role="alert">
          {error === 'events.commentary.loadError' || !error ? t('events.commentary.loadError') : error}
        </div>
      </div>
    );
  }

  const count = match?.participants.length ?? 0;
  const compact = count >= 5;
  const gridClass =
    count <= 1 ? 'one' : count === 2 ? 'two' : count === 3 ? 'three' : count === 4 ? 'four' : 'six';
  const teamGroups = match ? groupByTeam(match) : null;

  const statusPill = (() => {
    if (!match) return null;
    if (match.status === 'completed') return { key: 'completed', cls: 'done' };
    if (match.status === 'cancelled') return { key: 'cancelled', cls: 'done' };
    if (index === nextIndex) return { key: 'upNext', cls: 'next' };
    return { key: 'live', cls: 'live' };
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
          <Link to={`/events/${data.eventId}`} className="back-link">{t('events.commentary.backToEvent')}</Link>
          <h1 className="commentary-event-name">
            {data.name} <span className="commentary-event-date">— {formatDate(data.date)}</span>
          </h1>
          {match && (
            <p className="commentary-match-label">
              <span>{t('events.commentary.matchOf', { n: index + 1, total })}</span>
              <span className="commentary-sep">·</span>
              <span>{t(designationLabels[match.designation])}</span>
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
                <span className={`commentary-pill commentary-pill--${statusPill.cls}`}>
                  {t(`events.commentary.${statusPill.key}`)}
                </span>
              )}
            </p>
          )}
        </div>
        <nav className="commentary-nav" aria-label={t('events.commentary.title')}>
          <button type="button" className="commentary-nav-btn" onClick={goPrev} disabled={index <= 0}>
            {t('events.commentary.prevMatch')}
          </button>
          <button type="button" className="commentary-nav-btn" onClick={goNext} disabled={index >= total - 1}>
            {t('events.commentary.nextMatch')}
          </button>
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
                      renderCard(p, group.index, t('events.commentary.team', { n: group.index + 1 })),
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
