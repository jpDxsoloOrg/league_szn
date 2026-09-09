import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { Match, MatchSlot, Player, WrestlerMove } from '../../lib/repositories/types';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { computeHeadToHead, pairwise } from '../../lib/headToHead';

interface Record3 {
  wins: number;
  losses: number;
  draws: number;
}

export interface CommentaryParticipant {
  playerId: string;
  playerName: string;
  wrestlerName: string;
  imageUrl?: string;
  alignment?: 'face' | 'heel' | 'neutral';
  divisionName?: string;
  bio?: string;
  signatures: WrestlerMove[];
  finishers: WrestlerMove[];
  seasonRecord: Record3 | null;
  allTimeRecord: Record3;
  /** Record in completed matches with three or more participants. */
  multiManRecord: Record3;
}

export interface CommentaryHeadToHead {
  player1Id: string;
  player2Id: string;
  player1Wins: number;
  player2Wins: number;
  draws: number;
  lastMatchDate?: string;
  lastWinnerId?: string;
}

export interface CommentaryMatch {
  matchId: string;
  position: number;
  designation: string;
  matchFormat: string;
  stipulationName?: string;
  isChampionship: boolean;
  championshipName?: string;
  status: Match['status'];
  teams?: string[][];
  participants: CommentaryParticipant[];
  headToHead: CommentaryHeadToHead[];
}

const ZERO: Record3 = { wins: 0, losses: 0, draws: 0 };

/** Player ids on a match: explicit participants plus anyone holding a slot. */
function participantIdsOf(match: Match): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (id: string | undefined) => {
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  };
  for (const id of match.participants ?? []) push(id);
  for (const slot of (match.slots as MatchSlot[] | undefined) ?? []) push(slot.playerId);
  return ids;
}

function multiManRecord(playerId: string, completed: Match[]): Record3 {
  const rec: Record3 = { ...ZERO };
  for (const m of completed) {
    if ((m.participants?.length ?? 0) < 3 || !m.participants.includes(playerId)) continue;
    if (m.winners?.includes(playerId)) rec.wins++;
    else if (m.isDraw) rec.draws++;
    else rec.losses++;
  }
  return rec;
}

/**
 * GET /events/{eventId}/commentary — everything a commentator needs to
 * call the card, in one public read: matches in card order with each
 * participant's moveset, records, and the pairwise head-to-head between
 * everyone in the match. Works for 2–6 participants.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const eventId = event.pathParameters?.eventId;
    if (!eventId) return badRequest('Event ID is required');

    const {
      leagueOps: { events, divisions },
      roster: { players },
      competition: { matches, championships, stipulations },
      season: { seasons, standings },
    } = getRepositories();

    const eventItem = await events.findById(eventId);
    if (!eventItem) return notFound('Event not found');

    // Card order: pre-show first, then by position (mirrors EventDetail).
    const cards = [...(eventItem.matchCards ?? [])]
      .filter((c) => typeof c.matchId === 'string' && c.matchId.length > 0)
      .sort((a, b) => {
        const aPre = a.designation === 'pre-show' ? 0 : 1;
        const bPre = b.designation === 'pre-show' ? 0 : 1;
        return aPre - bPre || a.position - b.position;
      });

    const loadedMatches = await Promise.all(cards.map((c) => matches.findById(c.matchId)));

    // Season for the season record: the event's, else the active one.
    const season = eventItem.seasonId
      ? await seasons.findById(eventItem.seasonId)
      : await seasons.findActive();

    const [completed, seasonStandings, divisionList] = await Promise.all([
      matches.listByStatus('completed'),
      season ? standings.listBySeason(season.seasonId) : Promise.resolve([]),
      divisions.list(),
    ]);
    const standingByPlayer = new Map(seasonStandings.map((s) => [s.playerId, s]));
    const divisionNameById = new Map(divisionList.map((d) => [d.divisionId, d.name]));

    // Load every distinct participant on the card once.
    const allIds = new Set<string>();
    for (const m of loadedMatches) if (m) for (const id of participantIdsOf(m)) allIds.add(id);
    const playerById = new Map<string, Player>();
    await Promise.all(
      [...allIds].map(async (id) => {
        const p = await players.findById(id);
        if (p) playerById.set(id, p);
      }),
    );

    const toParticipant = (playerId: string, match: Match): CommentaryParticipant | null => {
      const p = playerById.get(playerId);
      if (!p) return null;
      const slot = (match.slots as MatchSlot[] | undefined)?.find((s) => s.playerId === playerId);
      const standing = standingByPlayer.get(playerId);
      return {
        playerId,
        playerName: p.name,
        wrestlerName: slot?.wrestlerNameSnapshot ?? p.currentWrestler,
        imageUrl: p.imageUrl,
        alignment: p.alignment,
        divisionName: p.divisionId ? divisionNameById.get(p.divisionId) : undefined,
        bio: p.bio,
        signatures: p.signatures ?? [],
        finishers: p.finishers ?? [],
        seasonRecord: season
          ? { wins: standing?.wins ?? 0, losses: standing?.losses ?? 0, draws: standing?.draws ?? 0 }
          : null,
        allTimeRecord: { wins: p.wins ?? 0, losses: p.losses ?? 0, draws: p.draws ?? 0 },
        multiManRecord: multiManRecord(playerId, completed),
      };
    };

    const commentaryMatches: CommentaryMatch[] = [];
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const match = loadedMatches[i];
      if (!match) continue;

      const participants = participantIdsOf(match)
        .map((id) => toParticipant(id, match))
        .filter((p): p is CommentaryParticipant => p !== null);

      const headToHead: CommentaryHeadToHead[] = pairwise(participants.map((p) => p.playerId)).map(
        ([a, b]) => {
          const h = computeHeadToHead(completed, a, b);
          return {
            player1Id: a,
            player2Id: b,
            player1Wins: h.player1Wins,
            player2Wins: h.player2Wins,
            draws: h.draws,
            lastMatchDate: h.lastMatchDate,
            lastWinnerId: h.lastWinnerId,
          };
        },
      );

      const [championship, stipulation] = await Promise.all([
        match.isChampionship && match.championshipId
          ? championships.findById(match.championshipId)
          : Promise.resolve(null),
        match.stipulationId ? stipulations.findById(match.stipulationId) : Promise.resolve(null),
      ]);

      commentaryMatches.push({
        matchId: match.matchId,
        position: card.position,
        designation: card.designation,
        matchFormat: match.matchFormat ?? 'singles',
        stipulationName: stipulation?.name,
        isChampionship: match.isChampionship || false,
        championshipName: championship?.name,
        status: match.status,
        teams: match.teams,
        participants,
        headToHead,
      });
    }

    return success({
      eventId: eventItem.eventId,
      name: eventItem.name,
      date: eventItem.date,
      seasonName: season?.name,
      matches: commentaryMatches,
    });
  } catch (err) {
    console.error('Error building event commentary:', err);
    return serverError('Failed to build event commentary');
  }
};
