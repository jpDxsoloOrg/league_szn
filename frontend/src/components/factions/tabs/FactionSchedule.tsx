import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useOutletContext } from 'react-router-dom';
import { factionsApi } from '../../../services/api';
import { logger } from '../../../utils/logger';
import type { FactionScheduleResponse, FactionScheduledMatch } from '../../../types/faction';
import type { FactionDetailContext } from '../FactionDetail';
import './FactionSchedule.css';

const WINDOW_DAYS = 60;
const TIMELINE_DAYS = 30;
const CALENDAR_DAYS = 30;
const PAGE_LIMIT = 50;

function formatCountdown(scheduledFor: string, now: number, t: (key: string, fallback: string, opts?: Record<string, unknown>) => string): string {
  const target = new Date(scheduledFor).getTime();
  if (!Number.isFinite(target)) return '';
  const ms = target - now;
  const minutes = Math.round(ms / 60_000);
  if (Math.abs(minutes) < 60) {
    return minutes >= 0
      ? t('factions.schedule.inMinutes', 'In {{count}}m', { count: minutes })
      : t('factions.schedule.minutesAgo', '{{count}}m ago', { count: -minutes });
  }
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return hours >= 0
      ? t('factions.schedule.inHours', 'In {{count}}h', { count: hours })
      : t('factions.schedule.hoursAgo', '{{count}}h ago', { count: -hours });
  }
  const days = Math.round(hours / 24);
  return days >= 0
    ? t('factions.schedule.inDays', 'In {{count}} days', { count: days })
    : t('factions.schedule.daysAgo', '{{count}} days ago', { count: -days });
}

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

    setLoading(true);
    factionsApi
      .getSchedule(
        faction.stableId,
        { from: now.toISOString(), to: to.toISOString(), limit: PAGE_LIMIT },
        ac.signal,
      )
      .then((response) => {
        if (!ac.signal.aborted) {
          setSchedule(response);
          setError(null);
        }
      })
      .catch((err) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Schedule tab: getSchedule failed');
          setError(err.message);
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

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

  const timelineRange = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = today.getTime();
    const end = start + TIMELINE_DAYS * 24 * 60 * 60 * 1000;
    return { start, end };
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

  if (loading) {
    return <p className="faction-schedule__loading">{t('common.loading', 'Loading…')}</p>;
  }

  if (error) {
    return (
      <p className="faction-schedule__error" role="alert">
        {t('factions.schedule.error', 'Could not load schedule.')}: {error}
      </p>
    );
  }

  const now = Date.now();

  return (
    <div className="faction-schedule">
      <div className="faction-schedule__main">
        <section
          className="faction-schedule__list-section"
          aria-labelledby="faction-schedule-heading"
        >
          <h2 id="faction-schedule-heading" className="faction-schedule__heading">
            {t('factions.schedule.upcomingTitle', 'Upcoming Matches ({{count}})', {
              count: visibleMatches.length,
            })}
          </h2>

          {visibleMatches.length === 0 ? (
            <p className="faction-schedule__empty">
              {t(
                'factions.schedule.empty',
                'No upcoming matches for the selected members in the next 60 days.',
              )}
            </p>
          ) : (
            <ul className="faction-schedule__list">
              {visibleMatches.map((m) => {
                const memberCompeting = m.participants.find((p) => p.isFactionMember);
                const opponents = m.participants.filter((p) => !p.isFactionMember);
                const d = new Date(m.scheduledFor);
                const dayLabel = Number.isFinite(d.getTime())
                  ? d.toLocaleDateString(undefined, { day: '2-digit' })
                  : '—';
                const monthLabel = Number.isFinite(d.getTime())
                  ? d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()
                  : '';

                return (
                  <li
                    key={m.matchId}
                    ref={(node) => {
                      if (node) matchRefs.current.set(m.matchId, node);
                      else matchRefs.current.delete(m.matchId);
                    }}
                    className="faction-schedule__row"
                  >
                    <Link to={`/matches/${m.matchId}`} className="faction-schedule__row-link">
                      <div className="faction-schedule__date">
                        <span className="faction-schedule__date-day">{dayLabel}</span>
                        <span className="faction-schedule__date-month">{monthLabel}</span>
                      </div>

                      <div className="faction-schedule__row-body">
                        <span className="faction-schedule__format">
                          {m.matchFormat.toUpperCase()}
                        </span>
                        {memberCompeting && (
                          <span className="faction-schedule__member">
                            {memberCompeting.playerName}
                          </span>
                        )}
                        {opponents.length > 0 && (
                          <span className="faction-schedule__opponents">
                            {t('factions.schedule.vs', 'vs')}{' '}
                            {opponents.map((p) => p.playerName).join(', ')}
                          </span>
                        )}
                        {(m.eventName || m.location) && (
                          <span className="faction-schedule__event">
                            {m.eventName ?? ''}
                            {m.eventName && m.location ? ' · ' : ''}
                            {m.location ?? ''}
                          </span>
                        )}
                      </div>

                      <div className="faction-schedule__row-meta">
                        <span className="faction-schedule__countdown">
                          {formatCountdown(m.scheduledFor, now, t)}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="faction-schedule__rail">
          <section className="faction-schedule__rail-card">
            <h3 className="faction-schedule__rail-title">
              {t('factions.schedule.filterTitle', 'Filter by Member')}
            </h3>
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

          <section className="faction-schedule__rail-card">
            <h3 className="faction-schedule__rail-title">
              {t('factions.schedule.calendarTitle', 'Faction Calendar')}
            </h3>
            <div className="faction-schedule__calendar" role="list">
              {calendarDays.map((day) => {
                const dayMatches = matchesByDate.get(day) ?? [];
                const dn = new Date(day).getDate();
                const label = t('factions.schedule.calendarCell', '{{count}} matches on {{date}}', {
                  count: dayMatches.length,
                  date: day,
                });
                return (
                  <button
                    type="button"
                    key={day}
                    role="listitem"
                    aria-label={label}
                    className={`faction-schedule__day ${
                      dayMatches.length > 0 ? 'faction-schedule__day--has-matches' : ''
                    }`}
                    onClick={() => handleSelectDay(day)}
                    disabled={dayMatches.length === 0}
                  >
                    <span className="faction-schedule__day-num">{dn}</span>
                    {dayMatches.length > 0 && (
                      <span className="faction-schedule__day-dot" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="faction-schedule__rail-card">
            <h3 className="faction-schedule__rail-title">
              {t('factions.schedule.timelineTitle', 'Timeline')}
            </h3>
            <div
              className="faction-schedule__timeline"
              role="img"
              aria-label={t('factions.schedule.timelineAria', 'Next 30 days of scheduled matches')}
            >
              <div className="faction-schedule__timeline-track" />
              {visibleMatches.map((m) => {
                const t0 = new Date(m.scheduledFor).getTime();
                if (!Number.isFinite(t0) || t0 < timelineRange.start || t0 > timelineRange.end) return null;
                const pct =
                  ((t0 - timelineRange.start) / (timelineRange.end - timelineRange.start)) * 100;
                return (
                  <span
                    key={m.matchId}
                    className="faction-schedule__timeline-pill"
                    style={{ left: `${pct}%` }}
                    title={`${m.matchFormat} · ${new Date(m.scheduledFor).toLocaleDateString()}`}
                  />
                );
              })}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
