import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import type { InvitationRecord } from '../../lib/repositories/MatchmakingRepository';

interface PlayerSummary {
  playerId: string;
  name: string;
  currentWrestler: string;
  imageUrl?: string;
}

interface HydratedInvitation extends InvitationRecord {
  from: PlayerSummary;
  to: PlayerSummary;
}

interface GetInvitationsResponse {
  incoming: HydratedInvitation[];
  outgoing: HydratedInvitation[];
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can view match invitations');
    }

    const { roster: { players }, leagueOps: { matchmaking } } = getRepositories();

    // Look up caller's player profile via UserIdIndex
    const callerPlayer = await players.findByUserId(auth.sub);
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    const callerPlayerId = callerPlayer.playerId;

    const [incomingItems, outgoingItems] = await Promise.all([
      matchmaking.listInvitationsByToPlayer(callerPlayerId),
      matchmaking.listInvitationsByFromPlayer(callerPlayerId),
    ]);

    const nowIso = new Date().toISOString();

    const incomingRows = incomingItems.filter(
      (row) => row.status === 'pending' && row.expiresAt > nowIso
    );
    const outgoingRows = outgoingItems.filter(
      (row) => row.status === 'pending' && row.expiresAt > nowIso
    );

    // Collect unique player IDs for hydration
    const playerIds = new Set<string>();
    for (const row of [...incomingRows, ...outgoingRows]) {
      if (row.fromPlayerId) playerIds.add(row.fromPlayerId);
      if (row.toPlayerId) playerIds.add(row.toPlayerId);
    }

    const playerIdList = Array.from(playerIds);
    const playerFetches = await Promise.all(
      playerIdList.map((pid) => players.findById(pid))
    );

    const playerMap = new Map<string, PlayerSummary>();
    playerFetches.forEach((player, idx) => {
      const pid = playerIdList[idx];
      if (player && player.playerId) {
        const summary: PlayerSummary = {
          playerId: player.playerId,
          name: player.name || '',
          currentWrestler: player.currentWrestler || '',
        };
        if (player.imageUrl) {
          summary.imageUrl = player.imageUrl;
        }
        playerMap.set(pid, summary);
      }
    });

    const hydrate = (row: InvitationRecord): HydratedInvitation | null => {
      const from = playerMap.get(row.fromPlayerId);
      const to = playerMap.get(row.toPlayerId);
      if (!from || !to) {
        return null;
      }
      return { ...row, from, to };
    };

    const incoming = incomingRows
      .map(hydrate)
      .filter((inv): inv is HydratedInvitation => inv !== null);
    const outgoing = outgoingRows
      .map(hydrate)
      .filter((inv): inv is HydratedInvitation => inv !== null);

    const response: GetInvitationsResponse = { incoming, outgoing };
    return success(response);
  } catch (err) {
    console.error('Error fetching match invitations:', err);
    return serverError('Failed to fetch match invitations');
  }
};
