import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getOrNotFound } from '../../lib/dynamodbUtils';
import { noContent, badRequest, serverError, conflict } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;

    if (!playerId) {
      return badRequest('Player ID is required');
    }

    const playerResult = await getOrNotFound(TableNames.PLAYERS, { playerId }, 'Player not found');
    if ('notFoundResponse' in playerResult) {
      return playerResult.notFoundResponse;
    }

    const player = playerResult.item as Record<string, unknown>;

    // --- Stable cleanup ---
    if (player.stableId) {
      try {
        const stableId = player.stableId as string;
        const stableResult = await dynamoDb.get({
          TableName: TableNames.STABLES,
          Key: { stableId },
        });
        const stable = stableResult.Item as Record<string, unknown> | undefined;

        if (stable && (stable.status === 'active' || stable.status === 'approved')) {
          const memberIds = (stable.memberIds as string[]) || [];
          const remainingMembers = memberIds.filter(id => id !== playerId);
          const now = new Date().toISOString();

          if (remainingMembers.length === 0) {
            // No members remain — disband
            await dynamoDb.update({
              TableName: TableNames.STABLES,
              Key: { stableId },
              UpdateExpression: 'SET memberIds = :empty, #status = :disbanded, disbandedAt = :now, updatedAt = :now',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':empty': [],
                ':disbanded': 'disbanded',
                ':now': now,
              },
            });
          } else if (remainingMembers.length === 1) {
            // Only one member left (leader alone) — auto-disband
            await dynamoDb.update({
              TableName: TableNames.STABLES,
              Key: { stableId },
              UpdateExpression: 'SET memberIds = :members, #status = :disbanded, disbandedAt = :now, updatedAt = :now',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':members': remainingMembers,
                ':disbanded': 'disbanded',
                ':now': now,
              },
            });
            // Clear stableId from the remaining member
            await dynamoDb.update({
              TableName: TableNames.PLAYERS,
              Key: { playerId: remainingMembers[0] },
              UpdateExpression: 'REMOVE stableId SET updatedAt = :now',
              ExpressionAttributeValues: { ':now': now },
            });
          } else {
            // Multiple members remain — remove player, promote leader if needed
            const isLeader = stable.leaderId === playerId;
            const updateParts = ['SET memberIds = :members, updatedAt = :now'];
            const exprValues: Record<string, unknown> = {
              ':members': remainingMembers,
              ':now': now,
            };

            if (isLeader) {
              updateParts[0] += ', leaderId = :newLeader';
              exprValues[':newLeader'] = remainingMembers[0];
            }

            await dynamoDb.update({
              TableName: TableNames.STABLES,
              Key: { stableId },
              UpdateExpression: updateParts[0],
              ExpressionAttributeValues: exprValues,
            });
          }
        }
      } catch (stableErr) {
        console.warn('Warning: Failed to clean up stable membership for player', playerId, stableErr);
      }
    }

    // --- Tag team cleanup ---
    if (player.tagTeamId) {
      try {
        const tagTeamId = player.tagTeamId as string;
        const tagTeamResult = await dynamoDb.get({
          TableName: TableNames.TAG_TEAMS,
          Key: { tagTeamId },
        });
        const tagTeam = tagTeamResult.Item as Record<string, unknown> | undefined;

        if (tagTeam) {
          const now = new Date().toISOString();

          // Dissolve the tag team
          await dynamoDb.update({
            TableName: TableNames.TAG_TEAMS,
            Key: { tagTeamId },
            UpdateExpression: 'SET #status = :dissolved, dissolvedAt = :now, updatedAt = :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':dissolved': 'dissolved',
              ':now': now,
            },
          });

          // Clear tagTeamId from the partner if tag team was active
          if (tagTeam.status === 'active') {
            const partnerId = tagTeam.player1Id === playerId
              ? tagTeam.player2Id as string
              : tagTeam.player1Id as string;

            await dynamoDb.update({
              TableName: TableNames.PLAYERS,
              Key: { playerId: partnerId },
              UpdateExpression: 'REMOVE tagTeamId SET updatedAt = :now',
              ExpressionAttributeValues: { ':now': now },
            });
          }
        }
      } catch (tagTeamErr) {
        console.warn('Warning: Failed to clean up tag team membership for player', playerId, tagTeamErr);
      }
    }

    // Check if player is a current champion
    const championshipsResult = await dynamoDb.scan({
      TableName: TableNames.CHAMPIONSHIPS,
      FilterExpression: 'contains(#currentChampion, :playerId)',
      ExpressionAttributeNames: {
        '#currentChampion': 'currentChampion',
      },
      ExpressionAttributeValues: {
        ':playerId': playerId,
      },
    });

    if (championshipsResult.Items && championshipsResult.Items.length > 0) {
      const championshipNames = championshipsResult.Items.map((c: Record<string, unknown>) => c.name).join(', ');
      return conflict(
        `Cannot delete player. They are currently champion of: ${championshipNames}. Remove their championship first.`
      );
    }

    // Delete the player
    await dynamoDb.delete({
      TableName: TableNames.PLAYERS,
      Key: { playerId },
    });

    // Also delete from season standings
    const standingsResult = await dynamoDb.query({
      TableName: TableNames.SEASON_STANDINGS,
      IndexName: 'PlayerIndex',
      KeyConditionExpression: '#playerId = :playerId',
      ExpressionAttributeNames: {
        '#playerId': 'playerId',
      },
      ExpressionAttributeValues: {
        ':playerId': playerId,
      },
    });

    if (standingsResult.Items && standingsResult.Items.length > 0) {
      for (const standing of standingsResult.Items) {
        await dynamoDb.delete({
          TableName: TableNames.SEASON_STANDINGS,
          Key: {
            seasonId: (standing as Record<string, unknown>).seasonId as string,
            playerId: playerId,
          },
        });
      }
    }

    return noContent();
  } catch (err) {
    console.error('Error deleting player:', err);
    return serverError('Failed to delete player');
  }
};
