import { APIGatewayProxyHandler } from 'aws-lambda';
import { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { invokeAsync } from '../../lib/asyncLambda';
import { revertGroupStats } from './revertGroupStats';

interface TransactWriteItem {
  Update?: {
    TableName: string;
    Key: Record<string, unknown>;
    UpdateExpression: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
  };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Moderator');
  if (denied) return denied;

  try {
    const matchId = event.pathParameters?.matchId;
    if (!matchId) {
      return badRequest('matchId is required');
    }

    // Query the match (matchId is PK, need to find the sort key 'date')
    const matchResult = await dynamoDb.query({
      TableName: TableNames.MATCHES,
      KeyConditionExpression: 'matchId = :matchId',
      ExpressionAttributeValues: { ':matchId': matchId },
      Limit: 1,
    });

    const match = matchResult.Items?.[0];
    if (!match) {
      return notFound('Match not found');
    }

    // Block deletion of championship and tournament matches (Phase 1 scope)
    if (match.isChampionship && match.championshipId) {
      return badRequest('Cannot delete a championship match. Championship result rollback is not yet supported.');
    }
    if (match.tournamentId) {
      return badRequest('Cannot delete a tournament match. Tournament result rollback is not yet supported.');
    }

    // If match was completed, roll back all stat changes
    if (match.status === 'completed') {
      await rollbackCompletedMatch(match);
    }

    // Delete the match record
    await dynamoDb.delete({
      TableName: TableNames.MATCHES,
      Key: { matchId, date: match.date as string },
    });

    // If match was linked to an event, remove it from the event's matchCards
    const eventId = match.eventId as string | undefined;
    if (eventId) {
      try {
        await removeMatchFromEvent(eventId, matchId);
      } catch (err) {
        console.warn('Failed to remove match from event:', err);
      }
    }

    // Trigger async recalculations
    try {
      await invokeAsync('contenders', { source: 'deleteMatch' });
    } catch (err) {
      console.warn('Failed to invoke contenders recalc:', err);
    }
    try {
      await invokeAsync('fantasy', { source: 'deleteMatch' });
    } catch (err) {
      console.warn('Failed to invoke fantasy recalc:', err);
    }

    return success({ message: 'Match deleted', matchId });
  } catch (err) {
    console.error('Error deleting match:', err);
    return serverError('Failed to delete match');
  }
};

async function rollbackCompletedMatch(match: Record<string, unknown>): Promise<void> {
  const winners = (match.winners as string[]) || [];
  const losers = (match.losers as string[]) || [];
  const isDraw = match.isDraw === true;
  const seasonId = match.seasonId as string | undefined;
  const timestamp = new Date().toISOString();

  const transactItems: TransactWriteItem[] = [];

  // 1. Decrement winner stats (all-time)
  for (const playerId of winners) {
    transactItems.push({
      Update: {
        TableName: TableNames.PLAYERS,
        Key: { playerId },
        UpdateExpression: isDraw
          ? 'SET draws = if_not_exists(draws, :one) - :one, updatedAt = :timestamp'
          : 'SET wins = if_not_exists(wins, :one) - :one, updatedAt = :timestamp',
        ExpressionAttributeValues: {
          ':one': 1,
          ':timestamp': timestamp,
        },
      },
    });
  }

  // 2. Decrement loser stats (all-time) — skip for draws
  if (!isDraw) {
    for (const playerId of losers) {
      transactItems.push({
        Update: {
          TableName: TableNames.PLAYERS,
          Key: { playerId },
          UpdateExpression: 'SET losses = if_not_exists(losses, :one) - :one, updatedAt = :timestamp',
          ExpressionAttributeValues: {
            ':one': 1,
            ':timestamp': timestamp,
          },
        },
      });
    }
  }

  // 3. Decrement season standings if match had a seasonId
  if (seasonId) {
    for (const playerId of winners) {
      transactItems.push({
        Update: {
          TableName: TableNames.SEASON_STANDINGS,
          Key: { seasonId, playerId },
          UpdateExpression: isDraw
            ? 'SET draws = if_not_exists(draws, :one) - :one, updatedAt = :timestamp'
            : 'SET wins = if_not_exists(wins, :one) - :one, updatedAt = :timestamp',
          ExpressionAttributeValues: {
            ':one': 1,
            ':timestamp': timestamp,
          },
        },
      });
    }

    if (!isDraw) {
      for (const playerId of losers) {
        transactItems.push({
          Update: {
            TableName: TableNames.SEASON_STANDINGS,
            Key: { seasonId, playerId },
            UpdateExpression: 'SET losses = if_not_exists(losses, :one) - :one, updatedAt = :timestamp',
            ExpressionAttributeValues: {
              ':one': 1,
              ':timestamp': timestamp,
            },
          },
        });
      }
    }
  }

  // Execute rollback transaction
  if (transactItems.length > 0) {
    await dynamoDb.transactWrite({
      TransactItems: transactItems,
    } as TransactWriteCommandInput);
  }

  // 4. Revert stable and tag team group stats (non-critical)
  const allParticipants = isDraw ? [...winners] : [...winners, ...losers];
  try {
    await revertGroupStats({
      winners,
      losers,
      isDraw,
      participants: allParticipants,
      teams: match.teams as string[][] | undefined,
    });
  } catch (err) {
    console.warn('Group stats revert failed:', err);
  }

  // 5. Revert event auto-complete status if needed
  const eventId = match.eventId as string | undefined;
  if (eventId) {
    try {
      await revertEventStatus(eventId);
    } catch (err) {
      console.warn('Event status revert failed:', err);
    }
  }
}

async function revertEventStatus(eventId: string): Promise<void> {
  const eventResult = await dynamoDb.get({
    TableName: TableNames.EVENTS,
    Key: { eventId },
  });

  if (!eventResult.Item) return;

  // Only revert if the event was auto-completed
  if (eventResult.Item.status !== 'completed') return;

  // Check remaining matches to determine correct status
  const matchCards = (eventResult.Item.matchCards as Record<string, unknown>[] | undefined) || [];
  const matchIds = matchCards.map((c) => c.matchId as string).filter(Boolean);

  if (matchIds.length === 0) return;

  let hasCompleted = false;
  for (const mId of matchIds) {
    const matchQuery = await dynamoDb.query({
      TableName: TableNames.MATCHES,
      KeyConditionExpression: 'matchId = :matchId',
      ExpressionAttributeValues: { ':matchId': mId },
      Limit: 1,
    });
    const m = matchQuery.Items?.[0];
    if (m && m.status === 'completed') {
      hasCompleted = true;
    }
  }

  // If some matches are still completed, set to in-progress; otherwise upcoming
  const newStatus = hasCompleted ? 'in-progress' : 'upcoming';

  await dynamoDb.update({
    TableName: TableNames.EVENTS,
    Key: { eventId },
    UpdateExpression: 'SET #status = :status, updatedAt = :now',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':status': newStatus,
      ':now': new Date().toISOString(),
    },
  });
}

async function removeMatchFromEvent(eventId: string, matchId: string): Promise<void> {
  const eventResult = await dynamoDb.get({
    TableName: TableNames.EVENTS,
    Key: { eventId },
  });

  if (!eventResult.Item) return;

  const matchCards = (eventResult.Item.matchCards as Record<string, unknown>[] | undefined) || [];
  const updatedCards = matchCards.filter(
    (card) => (card as Record<string, unknown>).matchId !== matchId
  );

  await dynamoDb.update({
    TableName: TableNames.EVENTS,
    Key: { eventId },
    UpdateExpression: 'SET matchCards = :cards, updatedAt = :now',
    ExpressionAttributeValues: {
      ':cards': updatedCards,
      ':now': new Date().toISOString(),
    },
  });
}
