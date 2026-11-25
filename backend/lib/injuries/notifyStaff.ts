/**
 * Staff notice when a player gets hurt (INJ-07).
 *
 * Sent to every Admin and Moderator on a new injury (a recorded result,
 * INJ-04, or a storyline injury, INJ-08) and when a GM extends one (INJ-08):
 * "{player} is injured until {date}. Affected: {n} scheduled matches[, holds
 * {title}]". Nothing is cancelled; the notice only points GMs at what to
 * rebook. Best effort: it never throws, so it cannot fail its caller.
 */
import { isNeedsWrestler } from '../needsWrestler';
import { createNotification } from '../notifications';
import { getRepositories } from '../repositories';
import type { Championship, Match, Player } from '../repositories/types';
import { listStaffUserIds } from '../staffUsers';

export interface StaffInjuryNotice {
  player: Pick<Player, 'playerId' | 'name' | 'currentWrestler'>;
  returnsAt: string;
}

export interface InjuryImpact {
  /** Scheduled matches the player is booked in before they return. */
  scheduledMatchIds: string[];
  /** Names of the active titles the player holds. */
  titles: string[];
}

type ImpactMatch = Pick<Match, 'matchId' | 'status' | 'date' | 'participants'>;
type ImpactChampionship = Pick<Championship, 'name' | 'currentChampion' | 'isActive'>;

const holdsTitle = (championship: ImpactChampionship, playerId: string): boolean => {
  const champion = championship.currentChampion;
  return Array.isArray(champion) ? champion.includes(playerId) : champion === playerId;
};

/** Pure: the scheduled matches and titles an injury until `returnsAt` affects. */
export function injuryImpact(
  playerId: string,
  returnsAt: string,
  matches: readonly ImpactMatch[],
  championships: readonly ImpactChampionship[],
): InjuryImpact {
  const returnsAtMs = Date.parse(returnsAt);
  return {
    scheduledMatchIds: matches
      .filter((match) => match.status === 'scheduled'
        && (match.participants ?? []).includes(playerId)
        && Date.parse(match.date) < returnsAtMs)
      .map((match) => match.matchId),
    titles: championships
      .filter((championship) => championship.isActive !== false && holdsTitle(championship, playerId))
      .map((championship) => championship.name),
  };
}

const displayName = (player: StaffInjuryNotice['player']): string =>
  isNeedsWrestler(player.currentWrestler) ? player.name : player.currentWrestler;

function formatLeagueDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' })
    .format(new Date(iso));
}

const joinNames = (names: readonly string[]): string =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** The staff notice text. */
export function staffInjuryMessage(name: string, returnsAt: string, impact: InjuryImpact, timeZone: string): string {
  const count = impact.scheduledMatchIds.length;
  const matches = `${count} scheduled ${count === 1 ? 'match' : 'matches'}`;
  const titles = impact.titles.length > 0 ? `, holds ${joinNames(impact.titles)}` : '';
  return `${name} is injured until ${formatLeagueDay(returnsAt, timeZone)}. Affected: ${matches}${titles}`;
}

async function leagueTimeZone(): Promise<string> {
  const tunables = await getRepositories().user.siteConfig.getInjuryTunables();
  return tunables.timezone;
}

export interface NotifyStaffOptions {
  /** League time zone for the date; read from the injury tunables when left out. */
  timeZone?: string;
}

/**
 * One notice per injury to every Admin and Moderator. Loads the scheduled
 * matches and titles once for all notices. Never throws.
 */
export async function notifyStaffOfInjuries(
  notices: readonly StaffInjuryNotice[],
  options: NotifyStaffOptions = {},
): Promise<void> {
  if (notices.length === 0) return;
  try {
    const repos = getRepositories();
    const [staffIds, scheduled, championships, timeZone] = await Promise.all([
      listStaffUserIds(),
      repos.competition.matches.listByStatus('scheduled'),
      repos.competition.championships.list(),
      options.timeZone ?? leagueTimeZone(),
    ]);
    if (staffIds.length === 0) return;

    const sends = notices.flatMap(({ player, returnsAt }) => {
      const impact = injuryImpact(player.playerId, returnsAt, scheduled, championships);
      const message = staffInjuryMessage(displayName(player), returnsAt, impact, timeZone);
      return staffIds.map((userId) => createNotification({
        userId,
        type: 'injury_staff_notice',
        message,
        sourceId: player.playerId,
        sourceType: 'injury',
      }));
    });
    await Promise.allSettled(sends);
  } catch (err) {
    console.warn('Staff injury notice failed:', err);
  }
}
