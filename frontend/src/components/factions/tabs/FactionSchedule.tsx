import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useOutletContext } from 'react-router-dom';
import { factionsApi } from '../../../services/api';
import { logger } from '../../../utils/logger';
import type { FactionScheduleResponse, FactionScheduledMatch } from '../../../types/faction';
import type { FactionDetailContext } from '../FactionDetail';
import EmptyState from '../../ui/EmptyState';
import Skeleton from '../../ui/Skeleton';
import { formatCountdown } from '../factionFormat';
import '../groupUi.css';
import './FactionSchedule.css';

const WINDOW_DAYS = 60;
const CALENDAR_DAYS = 30;
const PAGE_LIMIT = 50;

function dateKey(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : '';
}

function buildCalendarDays(startMs: number, count: number): string[] {
  const days: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(startMs + i * 24 * 60 * 60 * 1000);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export default function FactionSchedule() {
  const { t } = useTranslation();
  const { faction } = useOutletContext<FactionDetailContext>();

  const [schedule, setSchedule] = useState<FactionScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(
    () => new Set(faction.memberIds),
  );

  const matchRefs = useRef<Map<string, HTMLLIElement | null>>(new Map());

  useEffect(() => {
    const ac = new AbortController();
    const now = new Date();
    const to = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const loadSchedule = async () => {
      setLoading(true);
      try {
        const response = await factionsApi.getSchedule(
          faction.stableId,
          { from: now.toISOString(), to: to.toISOString(), limit: PAGE_LIMIT },
          ac.signal,
        );
        if (!ac.signal.aborted) {
          setSchedule(response);
          setError(null);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Schedule tab: getSchedule failed');
          setError(err.message);
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };

    loadSchedule();
    return () => ac.abort();
  }, [faction.stableId]);

  const visibleMatches = useMemo(() => {
    const items = schedule?.items ?? [];
    if (selectedMemberIds.size === faction.memberIds.length) return items;
    return items.filter((m) =>
      m.participants.some((p) => p.isFactionMember && selectedMemberIds.has(p.playerId)),
    );
  }, [schedule, selectedMemberIds, faction.memberIds.length]);

  const matchesByDate = useMemo(() => {
    const map = new Map<string, FactionScheduledMatch[]>();
    for (const m of visibleMatches) {
      const key = dateKey(m.scheduledFor);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return map;
  }, [visibleMatches]);

  const calendarDays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return buildCalendarDays(today.getTime(), CALENDAR_DAYS);
  }, []);

  const handleToggleMember = (playerId: string) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const handleSelectDay = (day: string) => {
    const first = matchesByDate.get(day)?.[0];
    if (!first) return;
    const node = matchRefs.current.get(first.matchId);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (loading) return <Skeleton variant="block" count={3} />;

  if (error) {
    return (
      <p className="group-error" role="alert">
        {t('factions.schedule.error', 'Could not load schedule.')}: {error}
      </p>
    );
  }

  const now = Date.now();

  return (
    <div className="group-page">
      <section className="group-section">
        <h3 className="group-subheading">{t('factions.schedule.filterTitle', 'Filter by Member')}</h3>
        <div className="faction-schedule__chips">
          {faction.members.map((member) => {
            const isOn = selectedMemberIds.has(member.playerId);
            return (
              <button
                key={member.playerId}
                type="button"
                aria-pressed={isOn}
                className={`faction-schedule__chip ${isOn ? 'faction-schedule__chip--on' : ''}`}
                onClick={() => handleToggleMember(member.playerId)}
              >
                {member.wrestlerName}
              </button>
            );
          })}
        </div>
      </section>

      <div className="faction-schedule__main">
        <section className="group-section" aria-labelledby="faction-schedule-heading">
          <h2 id="faction-schedule-heading" className="group-heading">
            {t('factions.schedule.upcomingTitle', 'Upcoming Matches ({{count}})', { count: visibleMatches.length })}
          </h2>

          {visibleMatches.length === 0 ? (
            <EmptyState
              title={t('factions.redesign.noMatchesTitle', 'Nothing on the card')}
              description={t('factions.schedule.empty', 'No upcoming matches for the selected members in the next 60 days.')}
            />
          ) : (
            <ul className="group-list">
              {visibleMatches.map((match) => {
                const memberCompeting = match.participants.find((participant) => participant.isFactionMember);
                const opponents = match.participants.filter((participant) => !participant.isFactionMember);
                const date = new Date(match.scheduledFor);
                const validDate = Number.isFinite(date.getTime());

                return (
                  <li
                    key={match.matchId}
                    ref={(node) => {
                      if (node) matchRefs.current.set(match.matchId, node);
                      else matchRefs.current.delete(match.matchId);
                    }}
                  >
                    <Link to={`/matches/${match.matchId}`} className="faction-schedule__row">
                      <span className="faction-schedule__date">
                        <span className="faction-schedule__day-label">
                          {validDate ? date.toLocaleDateString(undefined, { day: '2-digit' }) : '—'}
                        </span>
                        <span className="group-muted">
                          {validDate ? date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase() : ''}
                        </span>
                      </span>

                      <span className="group-person__text">
                        <span className="group-person__name">{match.matchFormat.toUpperCase()}</span>
                        {memberCompeting && (
                          <span>
                            {memberCompeting.playerName}
                            {opponents.length > 0 && (
                              <>
                                {' '}{t('factions.schedule.vs', 'vs')}{' '}
                                {opponents.map((participant) => participant.playerName).join(', ')}
                              </>
                            )}
                          </span>
                        )}
                        {(match.eventName || match.location) && (
                          <span className="group-muted">
                            {[match.eventName, match.location].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>

                      <span className="faction-schedule__countdown">{formatCountdown(match.scheduledFor, now, t)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="group-section">
          <h3 className="group-heading">{t('factions.schedule.calendarTitle', 'Faction Calendar')}</h3>
          <ul className="faction-schedule__calendar">
            {calendarDays.map((day) => {
              const dayMatches = matchesByDate.get(day) ?? [];
              return (
                <li key={day}>
                  <button
                    type="button"
                    aria-label={t('factions.schedule.calendarCell', '{{count}} matches on {{date}}', {
                      count: dayMatches.length,
                      date: day,
                    })}
                    className={`faction-schedule__day ${dayMatches.length > 0 ? 'faction-schedule__day--has-matches' : ''}`}
                    onClick={() => handleSelectDay(day)}
                    disabled={dayMatches.length === 0}
                  >
                    {Number(day.slice(8))}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
