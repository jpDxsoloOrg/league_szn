import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { factionsApi } from '../../../services/api';
import { logger } from '../../../utils/logger';
import type { StableDetailResponse, StablePlayerInfo } from '../../../types/stable';
import type {
  FactionPromosResponse,
  FactionScheduleResponse,
} from '../../../types/faction';
import {
  DEFAULT_WRESTLER_IMAGE,
  resolveImageSrc,
  applyImageFallback,
} from '../../../constants/imageFallbacks';
import { deriveFactionActivity } from '../factionActivity';
import './FactionOverview.css';

interface FactionDetailContext {
  faction: StableDetailResponse;
  /** Recent form (last 5) reused from the shell so each tab doesn't refetch. */
}

const MEMBER_LIMIT = 8;
const RESULTS_LIMIT = 4;
const PROMOS_LIMIT = 3;
const SCHEDULE_LIMIT = 3;

type FormResult = 'W' | 'L' | 'D';

function classifyResult(match: Record<string, unknown>, memberIds: Set<string>): FormResult | null {
  const isDraw = match['isDraw'] === true;
  if (isDraw) return 'D';
  const winners = Array.isArray(match['winners']) ? (match['winners'] as string[]) : [];
  const losers = Array.isArray(match['losers']) ? (match['losers'] as string[]) : [];
  if (winners.some((id) => memberIds.has(id))) return 'W';
  if (losers.some((id) => memberIds.has(id))) return 'L';
  return null;
}

function memberPosition(
  member: StablePlayerInfo,
  leaderId: string,
  totalMatches: number,
): string {
  if (member.playerId === leaderId) return 'LEADER';
  if (totalMatches >= 10) return 'VETERAN';
  return 'ROOKIE';
}

function formatCountdown(scheduledFor: string, now: number): string {
  const ms = new Date(scheduledFor).getTime() - now;
  if (!Number.isFinite(ms)) return '';
  const minutes = Math.round(ms / 60_000);
  if (Math.abs(minutes) < 60) return minutes >= 0 ? `In ${minutes}m` : `${-minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return hours >= 0 ? `In ${hours}h` : `${-hours}h ago`;
  const days = Math.round(hours / 24);
  return days >= 0 ? `In ${days} days` : `${-days} days ago`;
}

export default function FactionOverview() {
  const { t } = useTranslation();
  const { faction } = useOutletContext<FactionDetailContext>();

  const [promos, setPromos] = useState<FactionPromosResponse | null>(null);
  const [schedule, setSchedule] = useState<FactionScheduleResponse | null>(null);
  const [promosError, setPromosError] = useState(false);
  const [scheduleError, setScheduleError] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    const load = async () => {
      try {
        const [promosRes, scheduleRes] = await Promise.all([
          factionsApi
            .getPromos(faction.stableId, { filter: 'all', limit: PROMOS_LIMIT }, ac.signal)
            .catch((e) => {
              if (e instanceof Error && e.name !== 'AbortError') {
                logger.error('Faction overview: getPromos failed');
                setPromosError(true);
              }
              return null;
            }),
          factionsApi
            .getSchedule(faction.stableId, { limit: SCHEDULE_LIMIT }, ac.signal)
            .catch((e) => {
              if (e instanceof Error && e.name !== 'AbortError') {
                logger.error('Faction overview: getSchedule failed');
                setScheduleError(true);
              }
              return null;
            }),
        ]);
        if (!ac.signal.aborted) {
          if (promosRes) setPromos(promosRes);
          if (scheduleRes) setSchedule(scheduleRes);
        }
      } catch {
        // Per-call catches above handle individual failures.
      }
    };
    load();
    return () => ac.abort();
  }, [faction.stableId]);

  const memberIdSet = useMemo(() => new Set(faction.memberIds), [faction.memberIds]);

  const recentResults = useMemo(() => {
    const raw = (faction.recentMatches || []) as Array<Record<string, unknown>>;
    return raw
      .filter((m) => typeof m['matchId'] === 'string' && (m['status'] === 'completed' || m['status'] === undefined))
      .slice(0, RESULTS_LIMIT)
      .map((m, i) => ({
        key: typeof m['matchId'] === 'string' ? (m['matchId'] as string) : `idx-${i}`,
        date: typeof m['date'] === 'string' ? (m['date'] as string) : '',
        format: typeof m['matchFormat'] === 'string'
          ? (m['matchFormat'] as string)
          : typeof m['matchType'] === 'string'
            ? (m['matchType'] as string)
            : 'unknown',
        outcome: classifyResult(m, memberIdSet),
      }));
  }, [faction.recentMatches, memberIdSet]);

  const activity = useMemo(
    () =>
      deriveFactionActivity(
        [
          {
            stableId: faction.stableId,
            name: faction.name,
            leaderId: faction.leaderId,
            memberIds: faction.memberIds,
            status: faction.status,
            wins: faction.wins,
            losses: faction.losses,
            draws: faction.draws,
            imageUrl: faction.imageUrl,
            createdAt: faction.createdAt,
            updatedAt: faction.updatedAt,
            disbandedAt: faction.disbandedAt,
          },
        ],
        new Map(),
        5,
      ),
    [faction],
  );

  const streak = faction.standings.currentStreak;
  const sparkline: FormResult[] = (faction.standings.recentForm || []).slice(0, 10) as FormResult[];

  const now = Date.now();

  return (
    <div className="faction-overview">
      <div className="faction-overview__main">
        {/* Member roster ─ at a glance */}
        <section className="faction-overview__section">
          <h2 className="faction-overview__section-title">
            {t('factions.overview.rosterHeading', 'Member Roster at a Glance')}
          </h2>
          <div className="faction-overview__roster-scroll">
            {faction.members.slice(0, MEMBER_LIMIT).map((member) => {
              const totalMatches = member.wins + member.losses + member.draws;
              const position = memberPosition(member, faction.leaderId, totalMatches);
              return (
                <Link
                  key={member.playerId}
                  to={`/player/${member.playerId}`}
                  className="faction-overview__member"
                >
                  <div className="faction-overview__member-image-wrap">
                    <img
                      src={resolveImageSrc(member.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                      onError={(e) => applyImageFallback(e, DEFAULT_WRESTLER_IMAGE)}
                      alt=""
                      className="faction-overview__member-image"
                    />
                  </div>
                  <span className="faction-overview__member-position">{position}</span>
                  <span className="faction-overview__member-name">{member.wrestlerName}</span>
                  <span className="faction-overview__member-record">
                    {member.wins}-{member.losses}-{member.draws}
                  </span>
                </Link>
              );
            })}
            {faction.members.length === 0 && (
              <p className="faction-overview__empty">
                {t('factions.overview.rosterEmpty', 'No members yet.')}
              </p>
            )}
          </div>
        </section>

        {/* Recent results */}
        <section className="faction-overview__section">
          <h2 className="faction-overview__section-title">
            {t('factions.overview.resultsHeading', 'Recent Faction Results')}
          </h2>
          {recentResults.length === 0 ? (
            <p className="faction-overview__empty">
              {t('factions.overview.resultsEmpty', 'No recent results.')}
            </p>
          ) : (
            <ul className="faction-overview__results">
              {recentResults.map((m) => (
                <li key={m.key} className="faction-overview__result">
                  <span className="faction-overview__result-date">
                    {m.date ? new Date(m.date).toLocaleDateString() : '—'}
                  </span>
                  <span className="faction-overview__result-format">{m.format}</span>
                  {m.outcome && (
                    <span
                      className={`faction-overview__result-pill faction-overview__result-pill--${m.outcome.toLowerCase()}`}
                    >
                      {m.outcome}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Promos mini-feed */}
        <section className="faction-overview__section">
          <h2 className="faction-overview__section-title">
            {t('factions.overview.promosHeading', 'Promos Involving This Faction')}
          </h2>
          {promosError ? (
            <p className="faction-overview__empty">
              {t('factions.overview.promosError', 'Could not load promos.')}
            </p>
          ) : !promos ? (
            <p className="faction-overview__empty">
              {t('common.loading', 'Loading…')}
            </p>
          ) : promos.items.length === 0 ? (
            <p className="faction-overview__empty">
              {t('factions.overview.promosEmpty', 'No promos involving this faction yet.')}
            </p>
          ) : (
            <ul className="faction-overview__promos">
              {promos.items.map((promo) => (
                <li key={promo.promoId} className="faction-overview__promo">
                  <div className="faction-overview__promo-headline">
                    {promo.headline ?? promo.excerpt}
                  </div>
                  <div className="faction-overview__promo-meta">
                    <span>{promo.authorWrestlerName}</span>
                    <time dateTime={promo.date}>
                      {new Date(promo.date).toLocaleDateString()}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Right rail */}
      <aside className="faction-overview__rail">
        <section className="faction-overview__card">
          <h3 className="faction-overview__card-title">
            {t('factions.overview.streakTitle', 'Streak')}
          </h3>
          <div className="faction-overview__streak">
            <span className="faction-overview__streak-value">
              {streak.count > 0 ? `${streak.count}${streak.type}` : '—'}
            </span>
          </div>
          {sparkline.length > 0 && (
            <div
              className="faction-overview__sparkline"
              aria-label={t('factions.overview.sparklineLabel', 'Last 10 results')}
            >
              {sparkline.map((r, i) => (
                <span
                  key={i}
                  className={`faction-overview__spark faction-overview__spark--${r.toLowerCase()}`}
                  aria-hidden="true"
                />
              ))}
            </div>
          )}
        </section>

        <section className="faction-overview__card">
          <h3 className="faction-overview__card-title">
            {t('factions.overview.upcomingTitle', 'Upcoming Matches ({{count}})', {
              count: schedule?.items.length ?? 0,
            })}
          </h3>
          {scheduleError ? (
            <p className="faction-overview__empty">
              {t('factions.overview.scheduleError', 'Could not load schedule.')}
            </p>
          ) : !schedule ? (
            <p className="faction-overview__empty">
              {t('common.loading', 'Loading…')}
            </p>
          ) : schedule.items.length === 0 ? (
            <p className="faction-overview__empty">
              {t('factions.overview.scheduleEmpty', 'No matches scheduled in the next 60 days.')}
            </p>
          ) : (
            <ul className="faction-overview__upcoming">
              {schedule.items.map((m) => {
                const memberCompeting = m.participants.find((p) => p.isFactionMember);
                return (
                  <li key={m.matchId} className="faction-overview__upcoming-row">
                    <span className="faction-overview__upcoming-countdown">
                      {formatCountdown(m.scheduledFor, now)}
                    </span>
                    <div className="faction-overview__upcoming-meta">
                      <span className="faction-overview__upcoming-format">{m.matchFormat}</span>
                      {memberCompeting && (
                        <span className="faction-overview__upcoming-member">
                          {memberCompeting.playerName}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="faction-overview__card">
          <h3 className="faction-overview__card-title">
            {t('factions.overview.activityTitle', 'Faction Activity')}
          </h3>
          {activity.length === 0 ? (
            <p className="faction-overview__empty">
              {t('factions.overview.activityEmpty', 'No recent activity.')}
            </p>
          ) : (
            <ul className="faction-overview__activity">
              {activity.map((entry) => (
                <li key={entry.id} className="faction-overview__activity-item">
                  <span className="faction-overview__activity-summary">{entry.summary}</span>
                  <time
                    className="faction-overview__activity-time"
                    dateTime={entry.timestamp}
                  >
                    {new Date(entry.timestamp).toLocaleDateString()}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
