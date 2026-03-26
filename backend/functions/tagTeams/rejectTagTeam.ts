import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames, getOrNotFound } from '../../lib/dynamodb';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

interface TagTeamRecord {
  [key: string]: unknown;
  tagTeamId: string;
  status: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const roleError = requireRole(event, 'Moderator');
    if (roleError) return roleError;

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

    if (tagTeam.status !== 'pending_admin') {
      return badRequest('This tag team is not awaiting admin approval');
    }

    const now = new Date().toISOString();

    await dynamoDb.update({
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
    });

    return success({
      tagTeamId,
      status: 'dissolved',
      message: 'Tag team rejected',
    });
  } catch (err) {
    console.error('Error rejecting tag team:', err);
    return serverError('Failed to reject tag team');
  }
};
