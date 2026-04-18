import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError, forbidden } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

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

    const { tagTeams: tagTeamsRepo, players: playersRepo } = getRepositories();

    // Get tag team
    const tagTeam = await tagTeamsRepo.findById(tagTeamId);
    if (!tagTeam) {
      return notFound('Tag team not found');
    }

    if (tagTeam.status === 'dissolved') {
      return badRequest('This tag team is already dissolved');
    }

    // Unless Admin, verify caller is a member of the tag team
    if (!hasRole(auth, 'Admin')) {
      const callerPlayer = await playersRepo.findByUserId(auth.sub);
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

    // Build transaction: update tag team status + clear tagTeamId from both players (Wave 7)
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
