import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';

interface InvitationRow {
  invitationId: string;
  fromPlayerId: string;
  toPlayerId: string;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt?: string;
  matchType?: string;
  stipulation?: string;
  championshipId?: string;
  message?: string;
}

interface PlayerRecord {
  playerId: string;
  name?: string;
  currentWrestler?: string;
  imageUrl?: string;
}

interface PlayerSummary {
  playerId: string;
  name: string;
  currentWrestler: string;
  imageUrl?: string;
}

interface HydratedInvitation extends InvitationRow {
  from: PlayerSummary;
  to: PlayerSummary;
}

interface GetInvitationsResponse {
  incoming: HydratedInvitation[];
  outgoing: HydratedInvitation[];
}

const toPlayerSummary = (player: PlayerRecord): PlayerSummary => {
  const summary: PlayerSummary = {
    playerId: player.playerId,
    name: player.name || '',
    currentWrestler: player.currentWrestler || '',
  };
  if (player.imageUrl) {
    summary.imageUrl = player.imageUrl;
  }
  return summary;
};

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can view match invitations');
    }

    // Look up caller's player profile via UserIdIndex
    const playerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });

    const callerPlayer = playerResult.Items?.[0];
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    const callerPlayerId = callerPlayer.playerId as string;

    const [incomingResult, outgoingResult] = await Promise.all([
      dynamoDb.query({
        TableName: TableNames.MATCH_INVITATIONS,
        IndexName: 'ToPlayerIndex',
        KeyConditionExpression: 'toPlayerId = :pid',
        ExpressionAttributeValues: { ':pid': callerPlayerId },
      }),
      dynamoDb.query({
        TableName: TableNames.MATCH_INVITATIONS,
        IndexName: 'FromPlayerIndex',
        KeyConditionExpression: 'fromPlayerId = :pid',
        ExpressionAttributeValues: { ':pid': callerPlayerId },
      }),
    ]);

    const nowIso = new Date().toISOString();

    const incomingRows = (incomingResult.Items || [])
      .map((item) => item as unknown as InvitationRow)
      .filter((row) => row.status === 'pending' && row.expiresAt > nowIso);

    const outgoingRows = (outgoingResult.Items || [])
      .map((item) => item as unknown as InvitationRow)
      .filter((row) => row.status === 'pending' && row.expiresAt > nowIso);

    // Collect unique player IDs for hydration
    const playerIds = new Set<string>();
    for (const row of [...incomingRows, ...outgoingRows]) {
      if (row.fromPlayerId) playerIds.add(row.fromPlayerId);
      if (row.toPlayerId) playerIds.add(row.toPlayerId);
    }

    const playerIdList = Array.from(playerIds);
    const playerFetches = await Promise.all(
      playerIdList.map((pid) =>
        dynamoDb.get({ TableName: TableNames.PLAYERS, Key: { playerId: pid } })
      )
    );

    const playerMap = new Map<string, PlayerSummary>();
    playerFetches.forEach((result, idx) => {
      const pid = playerIdList[idx];
      if (result.Item) {
        const player = result.Item as unknown as PlayerRecord;
        if (player.playerId) {
          playerMap.set(pid, toPlayerSummary(player));
        }
      }
    });

    const hydrate = (row: InvitationRow): HydratedInvitation | null => {
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
