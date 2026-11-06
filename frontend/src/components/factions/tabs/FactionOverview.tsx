import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { factionsApi } from '../../../services/api';
import { logger } from '../../../utils/logger';
import type { FactionPromosResponse, FactionScheduleResponse } from '../../../types/faction';
import Avatar from '../../ui/Avatar';
import Badge from '../../ui/Badge';
import FormDots from '../../ui/FormDots';
import type { FormResult } from '../../ui/FormDots';
import Skeleton from '../../ui/Skeleton';
import { deriveFactionActivity } from '../factionActivity';
import { formatCountdown } from '../factionFormat';
import type { FactionDetailContext } from '../FactionDetail';
import '../groupUi.css';
import './FactionOverview.css';

const MEMBER_LIMIT = 8;
const RESULTS_LIMIT = 4;
const PROMOS_LIMIT = 3;
const SCHEDULE_LIMIT = 3;
const ACTIVITY_LIMIT = 5;
const FORM_LIMIT = 10;

const RESULT_TONES = { W: 'win', L: 'loss', D: 'draw' } as const;

function classifyResult(match: Record<string, unknown>, memberIds: Set<string>): FormResult | null {
  if (match['isDraw'] === true) return 'D';
  const winners = Array.isArray(match['winners']) ? (match['winners'] as string[]) : [];
  const losers = Array.isArray(match['losers']) ? (match['losers'] as string[]) : [];
  if (winners.some((id) => memberIds.has(id))) return 'W';
  if (losers.some((id) => memberIds.has(id))) return 'L';
  return null;
}

export default function FactionOverview() {
  const { t } = useTranslation();
  const { faction } = useOutletContext<FactionDetailContext>();

  const [promos, setPromos] = useState<FactionPromosResponse | null>(null);
  const [schedule, setSchedule] = useState<FactionScheduleResponse | null>(null);
  const [promosError, setPromosError] = useState(false);
  const [scheduleError, setScheduleError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const loadPromos = async () => {
      try {
        const response = await factionsApi.getPromos(
          faction.stableId,
          { filter: 'all', limit: PROMOS_LIMIT },
          controller.signal,
        );
        if (!controller.signal.aborted) setPromos(response);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Faction overview: getPromos failed');
          setPromosError(true);
        }
      }
    };

    const loadSchedule = async () => {
      try {
        const response = await factionsApi.getSchedule(
          faction.stableId,
          { limit: SCHEDULE_LIMIT },
          controller.signal,
        );
        if (!controller.signal.aborted) setSchedule(response);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Faction overview: getSchedule failed');
          setScheduleError(true);
        }
      }
    };

    loadPromos();
    loadSchedule();
    return () => controller.abort();
  }, [faction.stableId]);

  const memberIdSet = useMemo(() => new Set(faction.memberIds), [faction.memberIds]);

  const recentResults = useMemo(() => {
    const matches = (faction.recentMatches || []) as Array<Record<string, unknown>>;
    return matches
      .filter((match) => typeof match['matchId'] === 'string' && (match['status'] === 'completed' || match['status'] === undefined))
      .slice(0, RESULTS_LIMIT)
      .map((match) => ({
        key: match['matchId'] as string,
        date: typeof match['date'] === 'string' ? match['date'] : '',
        format: typeof match['matchFormat'] === 'string'
          ? match['matchFormat']
          : typeof match['matchType'] === 'string'
            ? match['matchType']
            : '—',
        outcome: classifyResult(match, memberIdSet),
      }));
  }, [faction.recentMatches, memberIdSet]);

  const activity = useMemo(() => deriveFactionActivity([faction], ACTIVITY_LIMIT), [faction]);

  const streak = faction.standings.currentStreak;
  const recentForm = (faction.standings.recentForm || []).slice(0, FORM_LIMIT);
  const now = Date.now();

  return (
    <div className="faction-overview">
      <div className="faction-overview__main">
        <section className="group-section">
          <h2 className="group-heading">{t('factions.overview.rosterHeading', 'Member Roster at a Glance')}</h2>
          {faction.members.length === 0 ? (
            <p className="group-empty">{t('factions.overview.rosterEmpty', 'No members yet.')}</p>
          ) : (
            <div className="faction-overview__roster">
              {faction.members.slice(0, MEMBER_LIMIT).map((member) => (
                <Link key={member.playerId} to={`/player/${member.playerId}`} className="faction-overview__member">
                  <Avatar
                    src={member.imageUrl}
                    name={member.wrestlerName}
                    size="lg"
                    ring={member.playerId === faction.leaderId ? 'pink' : 'none'}
                  />
                  <span className="group-muted">
                    {member.playerId === faction.leaderId
                      ? t('factions.members.roleLeader', 'LEADER')
                      : t('factions.members.roleMember', 'MEMBER')}
                  </span>
                  <span className="group-person__name">{member.wrestlerName}</span>
                  <span className="group-muted">{member.wins}-{member.losses}-{member.draws}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="group-section">
          <h2 className="group-heading">{t('factions.overview.resultsHeading', 'Recent Faction Results')}</h2>
          {recentResults.length === 0 ? (
            <p className="group-empty">{t('factions.overview.resultsEmpty', 'No recent results.')}</p>
          ) : (
            <ul className="group-list">
              {recentResults.map((result) => (
                <li key={result.key} className="faction-overview__row">
                  <span>{result.format}</span>
                  <span className="faction-overview__row-end">
                    <span className="group-muted">
                      {result.date ? new Date(result.date).toLocaleDateString() : '—'}
                    </span>
                    {result.outcome && <Badge tone={RESULT_TONES[result.outcome]}>{result.outcome}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="group-section">
          <h2 className="group-heading">{t('factions.overview.promosHeading', 'Promos Involving This Faction')}</h2>
          {promosError ? (
            <p className="group-empty">{t('factions.overview.promosError', 'Could not load promos.')}</p>
          ) : !promos ? (
            <Skeleton variant="block" count={2} />
          ) : promos.items.length === 0 ? (
            <p className="group-empty">{t('factions.overview.promosEmpty', 'No promos involving this faction yet.')}</p>
          ) : (
            <ul className="group-list">
              {promos.items.map((promo) => (
                <li key={promo.promoId}>
                  <Link to={`/promos/${promo.promoId}`} className="faction-overview__promo">
                    <span className="group-person__name">{promo.headline ?? promo.excerpt}</span>
                    <span className="group-muted">
                      {promo.authorWrestlerName}
                      {' · '}
                      <time dateTime={promo.date}>{new Date(promo.date).toLocaleDateString()}</time>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="faction-overview__rail">
        <section className="group-section">
          <h3 className="group-heading">{t('factions.overview.streakTitle', 'Streak')}</h3>
          <span className="faction-overview__streak">
            {streak.count > 0 ? `${streak.count}${streak.type}` : '—'}
          </span>
          {recentForm.length > 0 && (
            <div role="group" aria-label={t('factions.overview.sparklineLabel', 'Last 10 results')}>
              <FormDots results={recentForm} />
            </div>
          )}
        </section>

        <section className="group-section">
          <h3 className="group-heading">
            {t('factions.overview.upcomingTitle', 'Upcoming Matches ({{count}})', {
              count: schedule?.items.length ?? 0,
            })}
          </h3>
          {scheduleError ? (
            <p className="group-empty">{t('factions.overview.scheduleError', 'Could not load schedule.')}</p>
          ) : !schedule ? (
            <Skeleton variant="block" count={1} />
          ) : schedule.items.length === 0 ? (
            <p className="group-empty">{t('factions.overview.scheduleEmpty', 'No matches scheduled in the next 60 days.')}</p>
          ) : (
            <ul className="group-list">
              {schedule.items.map((match) => {
                const memberCompeting = match.participants.find((participant) => participant.isFactionMember);
                return (
                  <li key={match.matchId} className="group-person__text">
                    <span className="faction-overview__countdown">{formatCountdown(match.scheduledFor, now, t)}</span>
                    <span>{match.matchFormat}</span>
                    {memberCompeting && <span className="group-muted">{memberCompeting.playerName}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="group-section">
          <h3 className="group-heading">{t('factions.overview.activityTitle', 'Faction Activity')}</h3>
          {activity.length === 0 ? (
            <p className="group-empty">{t('factions.overview.activityEmpty', 'No recent activity.')}</p>
          ) : (
            <ul className="group-list">
              {activity.map((entry) => (
                <li key={entry.id} className="group-person__text">
                  <span>
                    {entry.kind === 'formed'
                      ? t('factions.redesign.activityFormed', '{{name}} was formed', { name: entry.factionName })
                      : t('factions.redesign.activityDisbanded', '{{name}} was disbanded', { name: entry.factionName })}
                  </span>
                  <time className="group-muted" dateTime={entry.timestamp}>
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
