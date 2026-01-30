import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';

interface RecordResultBody {
  winners: string[];
  losers: string[];
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const matchId = event.pathParameters?.matchId;

    if (!matchId) {
      return badRequest('Match ID is required');
    }

    if (!event.body) {
      return badRequest('Request body is required');
    }

    const body: RecordResultBody = JSON.parse(event.body);

    if (!body.winners || !body.losers || body.winners.length === 0) {
      return badRequest('Winners and losers are required');
    }

    // Get the match
    const matchResult = await dynamoDb.scan({
      TableName: TableNames.MATCHES,
      FilterExpression: 'matchId = :matchId',
      ExpressionAttributeValues: { ':matchId': matchId },
    });

    const match = matchResult.Items?.[0];
    if (!match) {
      return notFound('Match not found');
    }

    if (match.status === 'completed') {
      return badRequest('Match has already been completed');
    }

    // Update match with results
    await dynamoDb.update({
      TableName: TableNames.MATCHES,
      Key: { matchId: match.matchId, date: match.date },
      UpdateExpression: 'SET winners = :winners, losers = :losers, #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':winners': body.winners,
        ':losers': body.losers,
        ':status': 'completed',
      },
    });

    // Update player standings
    const allParticipants = [...body.winners, ...body.losers];
    const isDraw = body.winners.length > 1 && body.losers.length > 1 &&
                   JSON.stringify(body.winners.sort()) === JSON.stringify(body.losers.sort());

    for (const playerId of body.winners) {
      await dynamoDb.update({
        TableName: TableNames.PLAYERS,
        Key: { playerId },
        UpdateExpression: isDraw
          ? 'SET draws = if_not_exists(draws, :zero) + :one, updatedAt = :timestamp'
          : 'SET wins = if_not_exists(wins, :zero) + :one, updatedAt = :timestamp',
        ExpressionAttributeValues: {
          ':one': 1,
          ':zero': 0,
          ':timestamp': new Date().toISOString(),
        },
      });
    }

    if (!isDraw) {
      for (const playerId of body.losers) {
        await dynamoDb.update({
          TableName: TableNames.PLAYERS,
          Key: { playerId },
          UpdateExpression: 'SET losses = if_not_exists(losses, :zero) + :one, updatedAt = :timestamp',
          ExpressionAttributeValues: {
            ':one': 1,
            ':zero': 0,
            ':timestamp': new Date().toISOString(),
          },
        });
      }
    }

    // Handle championship change
    if (match.isChampionship && match.championshipId) {
      const championship = await dynamoDb.get({
        TableName: TableNames.CHAMPIONSHIPS,
        Key: { championshipId: match.championshipId },
      });

      if (championship.Item) {
        const newChampion = body.winners.length === 1 ? body.winners[0] : body.winners;
        const oldChampion = championship.Item.currentChampion;

        // Update championship current champion
        await dynamoDb.update({
          TableName: TableNames.CHAMPIONSHIPS,
          Key: { championshipId: match.championshipId },
          UpdateExpression: 'SET currentChampion = :champion',
          ExpressionAttributeValues: { ':champion': newChampion },
        });

        // Close old reign if exists
        if (oldChampion) {
          const historyResult = await dynamoDb.scan({
            TableName: TableNames.CHAMPIONSHIP_HISTORY,
            FilterExpression: 'championshipId = :championshipId AND attribute_not_exists(lostDate)',
            ExpressionAttributeValues: { ':championshipId': match.championshipId },
          });

          if (historyResult.Items && historyResult.Items.length > 0) {
            const currentReign = historyResult.Items[0];
            const wonDate = new Date(currentReign.wonDate);
            const lostDate = new Date();
            const daysHeld = Math.floor((lostDate.getTime() - wonDate.getTime()) / (1000 * 60 * 60 * 24));

            await dynamoDb.update({
              TableName: TableNames.CHAMPIONSHIP_HISTORY,
              Key: {
                championshipId: currentReign.championshipId,
                wonDate: currentReign.wonDate,
              },
              UpdateExpression: 'SET lostDate = :lostDate, daysHeld = :daysHeld',
              ExpressionAttributeValues: {
                ':lostDate': lostDate.toISOString(),
                ':daysHeld': daysHeld,
              },
            });
          }
        }

        // Create new reign
        const wonDate = new Date().toISOString();
        await dynamoDb.put({
          TableName: TableNames.CHAMPIONSHIP_HISTORY,
          Item: {
            championshipId: match.championshipId,
            wonDate,
            champion: newChampion,
            matchId: match.matchId,
          },
        });
      }
    }

    // Handle tournament progression
    if (match.tournamentId) {
      const tournament = await dynamoDb.get({
        TableName: TableNames.TOURNAMENTS,
        Key: { tournamentId: match.tournamentId },
      });

      if (tournament.Item) {
        if (tournament.Item.type === 'round-robin') {
          // Update round-robin standings
          const standings = tournament.Item.standings || {};

          for (const playerId of allParticipants) {
            if (!standings[playerId]) {
              standings[playerId] = { wins: 0, losses: 0, draws: 0, points: 0 };
            }
          }

          if (isDraw) {
            for (const playerId of body.winners) {
              standings[playerId].draws += 1;
              standings[playerId].points += 1;
            }
          } else {
            for (const playerId of body.winners) {
              standings[playerId].wins += 1;
              standings[playerId].points += 2;
            }
            for (const playerId of body.losers) {
              standings[playerId].losses += 1;
            }
          }

          await dynamoDb.update({
            TableName: TableNames.TOURNAMENTS,
            Key: { tournamentId: match.tournamentId },
            UpdateExpression: 'SET standings = :standings',
            ExpressionAttributeValues: { ':standings': standings },
          });
        }
        // Single elimination bracket progression would be handled here
      }
    }

    return success({ message: 'Match result recorded successfully', match: { ...match, winners: body.winners, losers: body.losers, status: 'completed' } });
  } catch (err) {
    console.error('Error recording match result:', err);
    return serverError('Failed to record match result');
  }
};
