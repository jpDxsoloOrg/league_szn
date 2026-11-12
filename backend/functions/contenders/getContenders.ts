import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { Championship, ContenderRanking, Player, TagTeam } from '../../lib/repositories/types';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { FORMER_MEMBER, isPlayerVisible } from '../../lib/needsWrestler';
import { buildTagTeamIndex, pairKey, resolveTeamForPair } from '../../lib/tagTeams/resolveTagTeams';

// ─── Response shapes ────────────────────────────────────────────────
//
// Singles rows and the singles champion block carry no `entityType` / `type`
// field, so singles responses stay exactly as they were. Tag rows carry
// `entityType: 'tagTeam'` and the tag champion block `type: 'tagTeam'`.

/** One member of a tag team, on a contender row or the champion block. */
export interface ContenderMember {
  playerId: string;
  playerName: string;
  wrestlerName: string;
  imageUrl: string | null;
}

interface ContenderRowStats {
  rank: number;
  rankingScore: number;
  winPercentage: number;
  currentStreak: number;
  matchesInPeriod: number;
  winsInPeriod: number;
  previousRank: number | null;
  movement: number;
  isNew: boolean;
  isOverridden: boolean;
  overrideType: string | null;
  organicRank: number | null;
}

/**
 * A tag-team contender row. `playerId` is the tagTeamId (the rankings table
 * key). `playerName` / `wrestlerName` / `imageUrl` are display fallbacks for
 * clients that don't know about tag rows yet: the team name, the members'
 * player names joined with " & ", and the team image.
 */
export interface TagTeamContenderRow extends ContenderRowStats {
  entityType: 'tagTeam';
  playerId: string;
  tagTeamId: string;
  tagTeamName: string;
  tagTeamImageUrl: string | null;
  /** The team's status today. A dissolved team can still have a stored row. */
  tagTeamStatus: TagTeam['status'];
  members: [ContenderMember, ContenderMember];
  playerName: string;
  wrestlerName: string;
  imageUrl: string | null;
}

/**
 * The champion block for a tag title, built from the full `currentChampion`
 * array. `tagTeamId` / `tagTeamName` are null when the holders are not a
 * known tag team. The display fallbacks follow the contender row rules.
 */
export interface TagTeamChampion {
  type: 'tagTeam';
  tagTeamId: string | null;
  tagTeamName: string | null;
  tagTeamImageUrl: string | null;
  members: ContenderMember[];
  playerName: string;
  wrestlerName: string;
  imageUrl: string | null;
}

type PlayerRecord = Pick<Player, 'playerId' | 'name' | 'currentWrestler' | 'imageUrl'>;

// ─── Helpers ────────────────────────────────────────────────────────

function toIdList(currentChampion: Championship['currentChampion']): string[] {
  if (!currentChampion) return [];
  return Array.isArray(currentChampion) ? currentChampion.filter(Boolean) : [currentChampion];
}

/** The registered tag team holding the title, if one is recorded. */
function readCurrentTagTeamId(championship: Championship): string | undefined {
  return championship.currentTagTeamId || undefined;
}

function rowStats(ranking: ContenderRanking, adjustedRank: number): ContenderRowStats {
  const previousRank = ranking.previousRank ?? null;
  const isNew = previousRank === null || previousRank === undefined;
  const movement = isNew ? 0 : (previousRank as number) - adjustedRank;
  return {
    rank: adjustedRank,
    rankingScore: ranking.rankingScore,
    winPercentage: ranking.winPercentage,
    currentStreak: ranking.currentStreak,
    matchesInPeriod: ranking.matchesInPeriod,
    winsInPeriod: ranking.winsInPeriod,
    previousRank,
    movement,
    isNew,
    isOverridden: ranking.isOverridden || false,
    overrideType: ranking.overrideType || null,
    organicRank: ranking.organicRank || null,
  };
}

function toMember(playerId: string, player: PlayerRecord | undefined, fallbackWrestler?: string): ContenderMember {
  if (!player) {
    return { playerId, playerName: FORMER_MEMBER, wrestlerName: fallbackWrestler || FORMER_MEMBER, imageUrl: null };
  }
  return {
    playerId: player.playerId,
    playerName: player.name,
    wrestlerName: player.currentWrestler,
    imageUrl: player.imageUrl || null,
  };
}

function teamMembers(team: TagTeam, membersById: ReadonlyMap<string, PlayerRecord>): [ContenderMember, ContenderMember] {
  return [
    toMember(team.player1Id, membersById.get(team.player1Id), team.player1WrestlerName),
    toMember(team.player2Id, membersById.get(team.player2Id), team.player2WrestlerName),
  ];
}

function joinNames(names: string[]): string {
  return names.join(' & ');
}

/**
 * Which team holds the tag title: `currentTagTeamId` when recorded, otherwise
 * the team the two champions form today.
 */
function resolveChampionTeam(
  championship: Championship,
  championIds: string[],
  teams: readonly TagTeam[],
): TagTeam | null {
  const recordedId = readCurrentTagTeamId(championship);
  if (recordedId) {
    const recorded = teams.find((t) => t.tagTeamId === recordedId);
    if (recorded) return recorded;
  }
  if (championIds.length !== 2) return null;
  return resolveTeamForPair(buildTagTeamIndex(teams), championIds[0], championIds[1], new Date().toISOString());
}

// ─── Handler ────────────────────────────────────────────────────────

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const championshipId = event.pathParameters?.championshipId;

    if (!championshipId) {
      return badRequest('Championship ID is required');
    }

    const { competition: { championships, contenders }, roster: { players, tagTeams } } = getRepositories();

    // ------------------------------------------------------------------
    // 1. Validate the championship exists
    // ------------------------------------------------------------------
    const championship = await championships.findById(championshipId);

    if (!championship) {
      return notFound('Championship not found');
    }

    const isTagTitle = championship.type === 'tag';

    // ------------------------------------------------------------------
    // 2. Query contender rankings using ranked order. A tag title also
    //    loads every tag team once (dissolved ones included, so older
    //    rows still resolve).
    // ------------------------------------------------------------------
    const [rankings, allTeams] = await Promise.all([
      contenders.listByChampionshipRanked(championshipId),
      isTagTitle ? tagTeams.listAll() : Promise.resolve<TagTeam[]>([]),
    ]);

    const isTagRow = (ranking: ContenderRanking): boolean => (ranking.entityType ?? 'player') === 'tagTeam';
    const teamsById = new Map(allTeams.map((t) => [t.tagTeamId, t]));
    const currentChampion = championship.currentChampion;
    const championIdList = toIdList(currentChampion);
    const championTeam = isTagTitle ? resolveChampionTeam(championship, championIdList, allTeams) : null;

    // ------------------------------------------------------------------
    // 3. Collect all player IDs to fetch (player contenders + the singles
    //    champion). Tag members are loaded separately in step 4b.
    // ------------------------------------------------------------------
    const playerIds = new Set<string>();
    for (const ranking of rankings) {
      if (!isTagRow(ranking)) playerIds.add(ranking.playerId);
    }

    if (currentChampion && !isTagTitle) {
      if (Array.isArray(currentChampion)) {
        currentChampion.forEach((id) => playerIds.add(id));
      } else {
        playerIds.add(currentChampion);
      }
    }

    // ------------------------------------------------------------------
    // 4. Fetch all required player records
    // ------------------------------------------------------------------
    const playersMap = new Map<string, PlayerRecord>();

    for (const playerId of playerIds) {
      const player = await players.findById(playerId);
      if (player) {
        playersMap.set(playerId, player);
      }
    }

    // ------------------------------------------------------------------
    // 4b. Tag titles: the members of every ranked team and the champions,
    //     fetched in one parallel pass. Soft-deleted players still resolve
    //     so older teams keep their member names.
    // ------------------------------------------------------------------
    const membersById = new Map<string, PlayerRecord>();
    if (isTagTitle) {
      const memberIds = new Set<string>(championIdList);
      if (championIdList.length === 0 && championTeam) {
        memberIds.add(championTeam.player1Id);
        memberIds.add(championTeam.player2Id);
      }
      for (const ranking of rankings) {
        if (!isTagRow(ranking)) continue;
        const team = teamsById.get(ranking.tagTeamId ?? ranking.playerId);
        if (team) {
          memberIds.add(team.player1Id);
          memberIds.add(team.player2Id);
        }
      }
      const loaded = await Promise.all([...memberIds].map((id) => players.findByIdWithDeleted(id)));
      for (const member of loaded) {
        if (member) membersById.set(member.playerId, member);
      }
    }

    // ------------------------------------------------------------------
    // 5. Build the current champion object
    // ------------------------------------------------------------------
    let currentChampionData: Record<string, unknown> | TagTeamChampion | null = null;

    if (isTagTitle) {
      const holderIds = championIdList.length > 0
        ? championIdList
        : championTeam ? [championTeam.player1Id, championTeam.player2Id] : [];
      if (holderIds.length > 0) {
        const members = holderIds.map((id) => {
          const fallback = championTeam?.player1Id === id
            ? championTeam.player1WrestlerName
            : championTeam?.player2Id === id ? championTeam.player2WrestlerName : undefined;
          return toMember(id, membersById.get(id), fallback);
        });
        const tagTeamImageUrl = championTeam?.imageUrl || null;
        currentChampionData = {
          type: 'tagTeam',
          tagTeamId: championTeam?.tagTeamId ?? null,
          tagTeamName: championTeam?.name ?? null,
          tagTeamImageUrl,
          members,
          playerName: joinNames(members.map((m) => m.playerName)),
          wrestlerName: championTeam?.name ?? joinNames(members.map((m) => m.wrestlerName)),
          imageUrl: tagTeamImageUrl,
        };
      }
    } else if (currentChampion) {
      const championId = Array.isArray(currentChampion) ? currentChampion[0] : currentChampion;
      const championPlayer = playersMap.get(championId);

      if (championPlayer) {
        currentChampionData = {
          playerId: championPlayer.playerId,
          playerName: championPlayer.name,
          wrestlerName: championPlayer.currentWrestler,
          imageUrl: championPlayer.imageUrl || null,
        };
      }
    }

    // ------------------------------------------------------------------
    // 6. Build enriched contender list, excluding the current champion and
    //    hidden or deleted players
    // ------------------------------------------------------------------
    const championIds = new Set<string>(championIdList);
    const championPair = championIdList.length === 2 ? pairKey(championIdList[0], championIdList[1]) : null;

    const isChampionTeam = (team: TagTeam): boolean =>
      (championTeam !== null && team.tagTeamId === championTeam.tagTeamId) ||
      (championPair !== null && pairKey(team.player1Id, team.player2Id) === championPair);

    // Ranks are renumbered below, so dropping rows leaves no gaps. A stored
    // ranking can outlive its player or team, so a missing one is dropped too.
    // A dissolved team still has its record, so its row keeps its name.
    type Entry =
      | { kind: 'player'; ranking: ContenderRanking; player: PlayerRecord }
      | { kind: 'tagTeam'; ranking: ContenderRanking; team: TagTeam };

    const filteredRankings = rankings.flatMap((ranking): Entry[] => {
      if (isTagRow(ranking)) {
        const team = teamsById.get(ranking.tagTeamId ?? ranking.playerId);
        if (!team || isChampionTeam(team)) return [];
        return [{ kind: 'tagTeam', ranking, team }];
      }
      if (championIds.has(ranking.playerId)) return [];
      const player = playersMap.get(ranking.playerId);
      return player && isPlayerVisible(player) ? [{ kind: 'player', ranking, player }] : [];
    });

    const contendersList = filteredRankings.map((entry, index) => {
      const adjustedRank = index + 1;

      if (entry.kind === 'tagTeam') {
        const { ranking, team } = entry;
        const { rank, ...stats } = rowStats(ranking, adjustedRank);
        const members = teamMembers(team, membersById);
        const tagTeamImageUrl = team.imageUrl || null;
        const tagRow: TagTeamContenderRow = {
          rank,
          entityType: 'tagTeam',
          playerId: ranking.playerId,
          tagTeamId: team.tagTeamId,
          tagTeamName: team.name,
          tagTeamImageUrl,
          tagTeamStatus: team.status,
          members,
          playerName: joinNames(members.map((m) => m.playerName)),
          wrestlerName: team.name,
          imageUrl: tagTeamImageUrl,
          ...stats,
        };
        return tagRow;
      }

      const { ranking, player } = entry;
      const previousRank = ranking.previousRank ?? null;
      const isNew = previousRank === null || previousRank === undefined;
      const movement = isNew ? 0 : (previousRank as number) - adjustedRank;

      return {
        rank: adjustedRank,
        playerId: ranking.playerId,
        playerName: player.name,
        wrestlerName: player.currentWrestler,
        imageUrl: player.imageUrl || null,
        rankingScore: ranking.rankingScore,
        winPercentage: ranking.winPercentage,
        currentStreak: ranking.currentStreak,
        matchesInPeriod: ranking.matchesInPeriod,
        winsInPeriod: ranking.winsInPeriod,
        previousRank: previousRank,
        movement,
        isNew,
        isOverridden: ranking.isOverridden || false,
        overrideType: ranking.overrideType || null,
        organicRank: ranking.organicRank || null,
      };
    });

    // ------------------------------------------------------------------
    // 7. Determine the most recent calculatedAt timestamp
    // ------------------------------------------------------------------
    const calculatedAt =
      rankings.length > 0
        ? rankings.reduce<string>(
            (latest, r) => (r.calculatedAt > latest ? r.calculatedAt : latest),
            rankings[0].calculatedAt
          )
        : null;

    return success({
      championshipId,
      championshipName: championship.name || championshipId,
      divisionId: (championship as unknown as Record<string, unknown>).divisionId || null,
      currentChampion: currentChampionData,
      contenders: contendersList,
      calculatedAt,
    });
  } catch (err) {
    console.error('Error fetching contenders:', err);
    return serverError('Failed to fetch contenders');
  }
};
