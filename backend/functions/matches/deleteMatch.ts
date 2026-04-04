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

    // If match was completed, roll back all stat changes
    if (match.status === 'completed') {
      await rollbackCompletedMatch(match);

      // Roll back championship changes if this was a championship match
      if (match.isChampionship && match.championshipId) {
        await rollbackChampionshipResult(match);
      }

      // Roll back tournament progression if this was a tournament match
      if (match.tournamentId) {
        await rollbackTournamentResult(match);
      }
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

async function rollbackChampionshipResult(match: Record<string, unknown>): Promise<void> {
  const championshipId = match.championshipId as string;
  const matchId = match.matchId as string;

  // Find the championship history entry created by this match
  const historyResult = await dynamoDb.queryAll({
    TableName: TableNames.CHAMPIONSHIP_HISTORY,
    KeyConditionExpression: 'championshipId = :cid',
    FilterExpression: 'matchId = :matchId',
    ExpressionAttributeValues: {
      ':cid': championshipId,
      ':matchId': matchId,
    },
  });

  const reignCreatedByMatch = historyResult.find(
    (item) => item.matchId === matchId
  );

  if (reignCreatedByMatch) {
    // This match created a new reign — delete it and reopen the previous reign
    await dynamoDb.delete({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      Key: {
        championshipId,
        wonDate: reignCreatedByMatch.wonDate as string,
      },
    });

    // Find the previous reign (most recent one that has a lostDate)
    const allReigns = await dynamoDb.queryAll({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      KeyConditionExpression: 'championshipId = :cid',
      ExpressionAttributeValues: { ':cid': championshipId },
      ScanIndexForward: false,
    });

    // The previous reign should be the most recent one with a lostDate
    const previousReign = allReigns.find((r) => r.lostDate);

    if (previousReign) {
      // Reopen the previous reign (remove lostDate and daysHeld)
      await dynamoDb.update({
        TableName: TableNames.CHAMPIONSHIP_HISTORY,
        Key: {
          championshipId,
          wonDate: previousReign.wonDate as string,
        },
        UpdateExpression: 'REMOVE lostDate, daysHeld SET updatedAt = :now',
        ExpressionAttributeValues: {
          ':now': new Date().toISOString(),
        },
      });

      // Restore previous champion on the championship record
      await dynamoDb.update({
        TableName: TableNames.CHAMPIONSHIPS,
        Key: { championshipId },
        UpdateExpression: 'SET currentChampion = :champion, updatedAt = :now',
        ExpressionAttributeValues: {
          ':champion': previousReign.champion,
          ':now': new Date().toISOString(),
        },
      });
    } else {
      // No previous reign — title becomes vacant
      await dynamoDb.update({
        TableName: TableNames.CHAMPIONSHIPS,
        Key: { championshipId },
        UpdateExpression: 'REMOVE currentChampion SET updatedAt = :now',
        ExpressionAttributeValues: {
          ':now': new Date().toISOString(),
        },
      });
    }
  } else {
    // This match was a title defense — decrement defense count on current reign
    const currentReigns = await dynamoDb.queryAll({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      KeyConditionExpression: 'championshipId = :cid',
      FilterExpression: 'attribute_not_exists(lostDate)',
      ExpressionAttributeValues: { ':cid': championshipId },
    });

    const currentReign = currentReigns[0];
    if (currentReign && typeof currentReign.defenses === 'number' && currentReign.defenses > 0) {
      await dynamoDb.update({
        TableName: TableNames.CHAMPIONSHIP_HISTORY,
        Key: {
          championshipId,
          wonDate: currentReign.wonDate as string,
        },
        UpdateExpression: 'SET defenses = defenses - :one, updatedAt = :now',
        ExpressionAttributeValues: {
          ':one': 1,
          ':now': new Date().toISOString(),
        },
      });
    }
  }
}

async function rollbackTournamentResult(match: Record<string, unknown>): Promise<void> {
  const tournamentId = match.tournamentId as string;
  const winners = (match.winners as string[]) || [];
  const losers = (match.losers as string[]) || [];
  const isDraw = match.isDraw === true;

  const tournament = await dynamoDb.get({
    TableName: TableNames.TOURNAMENTS,
    Key: { tournamentId },
  });

  if (!tournament.Item) return;

  if (tournament.Item.type === 'round-robin') {
    const standings = (tournament.Item.standings as Record<string, { wins: number; losses: number; draws: number; points: number }>) || {};

    if (isDraw) {
      for (const playerId of winners) {
        if (standings[playerId]) {
          standings[playerId].draws = Math.max(0, standings[playerId].draws - 1);
          standings[playerId].points = Math.max(0, standings[playerId].points - 1);
        }
      }
    } else {
      for (const playerId of winners) {
        if (standings[playerId]) {
          standings[playerId].wins = Math.max(0, standings[playerId].wins - 1);
          standings[playerId].points = Math.max(0, standings[playerId].points - 2);
        }
      }
      for (const playerId of losers) {
        if (standings[playerId]) {
          standings[playerId].losses = Math.max(0, standings[playerId].losses - 1);
        }
      }
    }

    // If tournament was completed, revert to in-progress
    const newStatus = tournament.Item.status === 'completed' ? 'in-progress' : tournament.Item.status;

    await dynamoDb.update({
      TableName: TableNames.TOURNAMENTS,
      Key: { tournamentId },
      UpdateExpression: 'SET standings = :standings, #status = :status, updatedAt = :now REMOVE winner',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':standings': standings,
        ':status': newStatus,
        ':now': new Date().toISOString(),
      },
    });
  }

  if (tournament.Item.type === 'single-elimination' && tournament.Item.brackets) {
    const brackets = tournament.Item.brackets as {
      rounds: Array<{
        matches: Array<{
          participant1?: string;
          participant2?: string;
          winner?: string;
          matchId?: string;
        }>;
      }>;
    };
    const matchId = match.matchId as string;

    // Find the bracket match and clear the winner
    let foundRoundIndex = -1;
    let foundMatchIndex = -1;

    for (let roundIndex = 0; roundIndex < brackets.rounds.length; roundIndex++) {
      const round = brackets.rounds[roundIndex];
      if (!round?.matches) continue;
      for (let matchIndex = 0; matchIndex < round.matches.length; matchIndex++) {
        const bracketMatch = round.matches[matchIndex];
        if (bracketMatch?.matchId === matchId) {
          foundRoundIndex = roundIndex;
          foundMatchIndex = matchIndex;
          break;
        }
      }
      if (foundRoundIndex !== -1) break;
    }

    if (foundRoundIndex !== -1 && foundMatchIndex !== -1) {
      const foundMatch = brackets.rounds[foundRoundIndex].matches[foundMatchIndex];
      delete foundMatch.winner;
      delete foundMatch.matchId;

      // Clear the advancement in the next round
      const isLastRound = foundRoundIndex === brackets.rounds.length - 1;
      if (!isLastRound) {
        const nextRoundIndex = foundRoundIndex + 1;
        const nextMatchIndex = Math.floor(foundMatchIndex / 2);
        const isFirstOfPair = foundMatchIndex % 2 === 0;

        const nextMatch = brackets.rounds[nextRoundIndex]?.matches?.[nextMatchIndex];
        if (nextMatch) {
          if (isFirstOfPair) {
            delete nextMatch.participant1;
          } else {
            delete nextMatch.participant2;
          }
        }
      }

      const newStatus = tournament.Item.status === 'completed' ? 'in-progress' : tournament.Item.status;

      await dynamoDb.update({
        TableName: TableNames.TOURNAMENTS,
        Key: { tournamentId },
        UpdateExpression: 'SET brackets = :brackets, #status = :status, updatedAt = :now REMOVE winner',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':brackets': brackets,
          ':status': newStatus,
          ':now': new Date().toISOString(),
        },
      });
    }
  }
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
