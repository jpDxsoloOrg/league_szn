import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

const MIN_MATCHES_FOR_RIVALRY = 3;
const MAX_RIVALRIES_RETURNED = 20;

interface MatchRecord {
  matchId: string;
  date: string;
  participants: string[];
  winners?: string[];
  losers?: string[];
  isChampionship?: boolean;
  status: string;
  seasonId?: string;
}

interface PlayerRecord {
  playerId: string;
  name: string;
  currentWrestler: string;
  imageUrl?: string;
}

interface RivalryAgg {
  player1Id: string;
  player2Id: string;
  player1Wins: number;
  player2Wins: number;
  draws: number;
  matchCount: number;
  lastMatchDate: string;
  championshipMatches: number;
  recentMatchIds: string[];
}

function pairKey(id1: string, id2: string): string {
  return [id1, id2].sort().join('|');
}

function intensityBadge(matchCount: number): 'heatingUp' | 'intense' | 'historic' {
  if (matchCount >= 8) return 'historic';
  if (matchCount >= 5) return 'intense';
  return 'heatingUp';
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const seasonId = event.queryStringParameters?.seasonId;

    const [playersResult, matchesResult] = await Promise.all([
      dynamoDb.scanAll({ TableName: TableNames.PLAYERS }),
      dynamoDb.scanAll({ TableName: TableNames.MATCHES }),
    ]);

    const players = playersResult as unknown as PlayerRecord[];
    const allMatches = matchesResult as unknown as MatchRecord[];
    let completed = allMatches.filter((m) => m.status === 'completed');
    if (seasonId) {
      completed = completed.filter((m) => m.seasonId === seasonId);
    }

    const playerMap = new Map(players.map((p) => [p.playerId, p]));

    const aggMap = new Map<string, RivalryAgg>();

    for (const match of completed) {
      const participants = match.participants || [];
      if (participants.length !== 2) continue;
      const [a, b] = participants;
      const key = pairKey(a, b);
      const existing = aggMap.get(key);
      const p1Won = match.winners?.includes(a);
      const p2Won = match.winners?.includes(b);
      const isDraw = !p1Won && !p2Won;

      if (!existing) {
        aggMap.set(key, {
          player1Id: a,
          player2Id: b,
          player1Wins: p1Won ? 1 : 0,
          player2Wins: p2Won ? 1 : 0,
          draws: isDraw ? 1 : 0,
          matchCount: 1,
          lastMatchDate: match.date,
          championshipMatches: match.isChampionship ? 1 : 0,
          recentMatchIds: [match.matchId],
        });
      } else {
        existing.player1Wins += p1Won ? 1 : 0;
        existing.player2Wins += p2Won ? 1 : 0;
        existing.draws += isDraw ? 1 : 0;
        existing.matchCount += 1;
        if (new Date(match.date) > new Date(existing.lastMatchDate)) {
          existing.lastMatchDate = match.date;
        }
        if (match.isChampionship) existing.championshipMatches += 1;
        existing.recentMatchIds.push(match.matchId);
      }
    }

    const rivalries = Array.from(aggMap.values())
      .filter((r) => r.matchCount >= MIN_MATCHES_FOR_RIVALRY)
      .map((r) => {
        const sorted = [...r.recentMatchIds].sort(
          (id1, id2) => {
            const m1 = completed.find((m) => m.matchId === id1);
            const m2 = completed.find((m) => m.matchId === id2);
            const d1 = m1 ? new Date(m1.date).getTime() : 0;
            const d2 = m2 ? new Date(m2.date).getTime() : 0;
            return d2 - d1;
          }
        );
        return {
          ...r,
          recentMatchIds: sorted.slice(0, 5),
        };
      })
      .sort((a, b) => {
        const scoreA = a.matchCount * 2 + (a.championshipMatches > 0 ? 3 : 0) + new Date(a.lastMatchDate).getTime() / 1e12;
        const scoreB = b.matchCount * 2 + (b.championshipMatches > 0 ? 3 : 0) + new Date(b.lastMatchDate).getTime() / 1e12;
        return scoreB - scoreA;
      })
      .slice(0, MAX_RIVALRIES_RETURNED)
      .map((r) => {
        const p1 = playerMap.get(r.player1Id);
        const p2 = playerMap.get(r.player2Id);
        return {
          player1Id: r.player1Id,
          player2Id: r.player2Id,
          player1: p1 ? { playerId: p1.playerId, name: p1.name, wrestlerName: p1.currentWrestler, imageUrl: p1.imageUrl } : undefined,
          player2: p2 ? { playerId: p2.playerId, name: p2.name, wrestlerName: p2.currentWrestler, imageUrl: p2.imageUrl } : undefined,
          player1Wins: r.player1Wins,
          player2Wins: r.player2Wins,
          draws: r.draws,
          matchCount: r.matchCount,
          lastMatchDate: r.lastMatchDate,
          championshipMatches: r.championshipMatches,
          recentMatchIds: r.recentMatchIds,
          intensityBadge: intensityBadge(r.matchCount),
        };
      });

    return success({ rivalries });
  } catch (err) {
    console.error('Error computing rivalries:', err);
    return serverError('Failed to load rivalries');
  }
};
