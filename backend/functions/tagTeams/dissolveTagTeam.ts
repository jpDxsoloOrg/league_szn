import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames, getOrNotFound } from '../../lib/dynamodb';
import { success, badRequest, serverError, forbidden } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

interface TagTeamRecord {
  [key: string]: unknown;
  tagTeamId: string;
  player1Id: string;
  player2Id: string;
  status: string;
}

interface PlayerRecord {
  playerId: string;
  userId?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers or admins can dissolve tag teams');
    }

    const tagTeamId = event.pathParameters?.tagTeamId;
    if (!tagTeamId) {
      return badRequest('tagTeamId is required');
    }

    // Get tag team
    const result = await getOrNotFound<TagTeamRecord>(
      TableNames.TAG_TEAMS,
      { tagTeamId },
      'Tag team not found'
    );

    if ('notFoundResponse' in result) {
      return result.notFoundResponse;
    }

    const tagTeam = result.item;

    if (tagTeam.status === 'dissolved') {
      return badRequest('This tag team is already dissolved');
    }

    // Unless Admin, verify caller is a member of the tag team
    if (!hasRole(auth, 'Admin')) {
      const callerResult = await dynamoDb.query({
        TableName: TableNames.PLAYERS,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': auth.sub },
      });

      const callerPlayer = callerResult.Items?.[0] as PlayerRecord | undefined;
      if (!callerPlayer) {
        return badRequest('No player profile linked to your account');
      }

      if (
        callerPlayer.playerId !== tagTeam.player1Id &&
        callerPlayer.playerId !== tagTeam.player2Id
      ) {
        return forbidden('Only tag team members or admins can dissolve this tag team');
      }
    }

    const now = new Date().toISOString();

    // Build transaction: update tag team status + clear tagTeamId from both players
    const transactItems: Parameters<typeof dynamoDb.transactWrite>[0]['TransactItems'] = [
      {
        Update: {
          TableName: TableNames.TAG_TEAMS,
          Key: { tagTeamId },
          UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt, #dissolvedAt = :dissolvedAt',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#updatedAt': 'updatedAt',
            '#dissolvedAt': 'dissolvedAt',
          },
          ExpressionAttributeValues: {
            ':status': 'dissolved',
            ':updatedAt': now,
            ':dissolvedAt': now,
          },
        },
      },
    ];

    // Only clear tagTeamId from players if the tag team was active
    if (tagTeam.status === 'active') {
      transactItems.push(
        {
          Update: {
            TableName: TableNames.PLAYERS,
            Key: { playerId: tagTeam.player1Id },
            UpdateExpression: 'REMOVE #tagTeamId SET #updatedAt = :updatedAt',
            ExpressionAttributeNames: {
              '#tagTeamId': 'tagTeamId',
              '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
              ':updatedAt': now,
            },
          },
        },
        {
          Update: {
            TableName: TableNames.PLAYERS,
            Key: { playerId: tagTeam.player2Id },
            UpdateExpression: 'REMOVE #tagTeamId SET #updatedAt = :updatedAt',
            ExpressionAttributeNames: {
              '#tagTeamId': 'tagTeamId',
              '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
              ':updatedAt': now,
            },
          },
        }
      );
    }

    await dynamoDb.transactWrite({ TransactItems: transactItems });

    return success({
      tagTeamId,
      status: 'dissolved',
      message: 'Tag team dissolved. Historical stats preserved.',
    });
  } catch (err) {
    console.error('Error dissolving tag team:', err);
    return serverError('Failed to dissolve tag team');
  }
};
