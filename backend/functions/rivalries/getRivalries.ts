import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

interface MatchRecord {
  matchId: string;
  date: string;
  participants: string[];
  winners?: string[];
  losers?: string[];
  status: string;
  seasonId?: string;
  championshipId?: string;
  isChampionship?: boolean;
}

interface PlayerRecord {
  playerId: string;
  name: string;
  currentWrestler: string;
  imageUrl?: string;
}

type IntensityKey = 'heating-up' | 'intense' | 'historic';

const MIN_MATCHES_HEATING_UP = 3;
const MIN_MATCHES_INTENSE = 5;
const MIN_MATCHES_HISTORIC = 10;
const TOP_N = 20;
const RECENT_MATCHES_LIMIT = 5;

function normalizePair(id1: string, id2: string): [string, string] {
  return id1 < id2 ? [id1, id2] : [id2, id1];
}

function getIntensity(matchCount: number): IntensityKey {
  if (matchCount >= MIN_MATCHES_HISTORIC) return 'historic';
  if (matchCount >= MIN_MATCHES_INTENSE) return 'intense';
  if (matchCount >= MIN_MATCHES_HEATING_UP) return 'heating-up';
  return 'heating-up'; // fallback for 1-2 (we filter by MIN_MATCHES_HEATING_UP)
}

function intensityScore(
  matchCount: number,
  hasChampionship: boolean,
  recentMatchDaysAgo: number | null
): number {
  let score = matchCount * 10;
  if (hasChampionship) score += 20;
  if (recentMatchDaysAgo !== null && recentMatchDaysAgo < 90) score += 15;
  if (recentMatchDaysAgo !== null && recentMatchDaysAgo < 30) score += 10;
  return score;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const seasonId = event.queryStringParameters?.seasonId ?? undefined;

    const [matchesResult, playersResult] = await Promise.all([
      dynamoDb.scanAll({ TableName: TableNames.MATCHES }),
      dynamoDb.scanAll({ TableName: TableNames.PLAYERS }),
    ]);

    const allMatches = matchesResult as unknown as MatchRecord[];
    const completed = allMatches.filter((m) => m.status === 'completed');
    const matches = seasonId
      ? completed.filter((m) => m.seasonId === seasonId)
      : completed;

    const players = playersResult as unknown as PlayerRecord[];
    const playerMap = new Map(players.map((p) => [p.playerId, p]));

    // Build pair key -> { winsA, winsB, matches[], hasChampionship }
    type PairKey = string;
    const pairKey = (a: string, b: string) => `${a}|${b}`;

    interface PairAgg {
      idA: string;
      idB: string;
      winsA: number;
      winsB: number;
      matches: { matchId: string; date: string; championshipId?: string }[];
      hasChampionship: boolean;
    }
    const aggregates = new Map<PairKey, PairAgg>();

    for (const m of matches) {
      const w = m.winners ?? [];
      const l = m.losers ?? [];
      let idA: string;
      let idB: string;
      let winnerFirst: boolean;
      if (w.length === 1 && l.length === 1) {
        idA = w[0] as string;
        idB = l[0] as string;
        winnerFirst = true;
      } else if (m.participants?.length === 2) {
        idA = m.participants[0] as string;
        idB = m.participants[1] as string;
        winnerFirst = w.includes(idA);
      } else {
        continue;
      }
      const [pA, pB] = normalizePair(idA, idB);
      const key = pairKey(pA, pB);
      let agg = aggregates.get(key);
      if (!agg) {
        agg = { idA: pA, idB: pB, winsA: 0, winsB: 0, matches: [], hasChampionship: false };
        aggregates.set(key, agg);
      }
      if (m.isChampionship || m.championshipId) agg.hasChampionship = true;
      agg.matches.push({
        matchId: m.matchId,
        date: m.date,
        championshipId: m.championshipId,
      });
      const aWon = w.includes(pA);
      const bWon = w.includes(pB);
      if (aWon) agg.winsA += 1;
      else if (bWon) agg.winsB += 1;
    }

    const now = Date.now();
    const rivalries = Array.from(aggregates.entries())
      .filter(([, agg]) => agg.matches.length >= MIN_MATCHES_HEATING_UP)
      .map(([, agg]) => {
        const sortedMatches = [...agg.matches].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        const recentMatchDaysAgo =
          sortedMatches.length > 0
            ? Math.floor((now - new Date(sortedMatches[0].date).getTime()) / (24 * 60 * 60 * 1000))
            : null;
        const score = intensityScore(
          agg.matches.length,
          agg.hasChampionship,
          recentMatchDaysAgo
        );
        return {
          ...agg,
          recentMatches: sortedMatches.slice(0, RECENT_MATCHES_LIMIT),
          intensity: getIntensity(agg.matches.length),
          intensityScore: score,
        };
      })
      .sort((a, b) => b.intensityScore - a.intensityScore)
      .slice(0, TOP_N)
      .map((r) => {
        const playerA = playerMap.get(r.idA);
        const playerB = playerMap.get(r.idB);
        return {
          playerIds: [r.idA, r.idB] as [string, string],
          playerA: playerA
            ? {
                playerId: r.idA,
                name: playerA.name,
                wrestlerName: playerA.currentWrestler,
                imageUrl: playerA.imageUrl,
              }
            : { playerId: r.idA, name: '', wrestlerName: '', imageUrl: undefined },
          playerB: playerB
            ? {
                playerId: r.idB,
                name: playerB.name,
                wrestlerName: playerB.currentWrestler,
                imageUrl: playerB.imageUrl,
              }
            : { playerId: r.idB, name: '', wrestlerName: '', imageUrl: undefined },
          winsA: r.winsA,
          winsB: r.winsB,
          recentMatches: r.recentMatches,
          intensity: r.intensity,
          championshipAtStake: r.hasChampionship,
        };
      });

    return success({ rivalries });
  } catch (err) {
    console.error('Error computing rivalries:', err);
    return serverError('Failed to compute rivalries');
  }
};
