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

    // Update player standings (all-time)
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

    // Update season standings if match belongs to a season
    if (match.seasonId) {
      for (const playerId of body.winners) {
        await dynamoDb.update({
          TableName: TableNames.SEASON_STANDINGS,
          Key: { seasonId: match.seasonId, playerId },
          UpdateExpression: isDraw
            ? 'SET draws = if_not_exists(draws, :zero) + :one, wins = if_not_exists(wins, :zero), losses = if_not_exists(losses, :zero), updatedAt = :timestamp'
            : 'SET wins = if_not_exists(wins, :zero) + :one, losses = if_not_exists(losses, :zero), draws = if_not_exists(draws, :zero), updatedAt = :timestamp',
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
            TableName: TableNames.SEASON_STANDINGS,
            Key: { seasonId: match.seasonId, playerId },
            UpdateExpression: 'SET losses = if_not_exists(losses, :zero) + :one, wins = if_not_exists(wins, :zero), draws = if_not_exists(draws, :zero), updatedAt = :timestamp',
            ExpressionAttributeValues: {
              ':one': 1,
              ':zero': 0,
              ':timestamp': new Date().toISOString(),
            },
          });
        }
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

          // Check if round-robin tournament is complete
          // Total matches in round-robin = n*(n-1)/2 where n = number of participants
          const numParticipants = tournament.Item.participants.length;
          const expectedTotalMatches = (numParticipants * (numParticipants - 1)) / 2;

          // Count total matches played (sum of all wins + half of all draws since draws are counted for both)
          let totalMatchesPlayed = 0;
          for (const playerId of Object.keys(standings)) {
            totalMatchesPlayed += standings[playerId].wins;
            totalMatchesPlayed += standings[playerId].draws;
          }
          // Each match adds 2 to wins count (1 win, 1 loss) OR 2 to draws (both get draw)
          // So total matches = (sum of wins + sum of draws) / 2
          totalMatchesPlayed = totalMatchesPlayed / 2;

          const isComplete = totalMatchesPlayed >= expectedTotalMatches;

          if (isComplete) {
            // Find winner (player with most points, or first if tied)
            let winner = '';
            let maxPoints = -1;
            for (const [playerId, stats] of Object.entries(standings) as [string, any][]) {
              if (stats.points > maxPoints) {
                maxPoints = stats.points;
                winner = playerId;
              }
            }

            await dynamoDb.update({
              TableName: TableNames.TOURNAMENTS,
              Key: { tournamentId: match.tournamentId },
              UpdateExpression: 'SET standings = :standings, winner = :winner, #status = :status',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':standings': standings,
                ':winner': winner,
                ':status': 'completed',
              },
            });
          } else {
            // Update tournament status to in-progress if it was upcoming
            const newStatus = tournament.Item.status === 'upcoming' ? 'in-progress' : tournament.Item.status;

            await dynamoDb.update({
              TableName: TableNames.TOURNAMENTS,
              Key: { tournamentId: match.tournamentId },
              UpdateExpression: 'SET standings = :standings, #status = :status',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':standings': standings,
                ':status': newStatus,
              },
            });
          }
        }
        // Single elimination bracket progression
        if (tournament.Item.type === 'single-elimination' && tournament.Item.brackets) {
          const brackets = tournament.Item.brackets;
          const winner = body.winners[0]; // Single elimination typically has one winner
          const matchParticipants = match.participants;

          // Find the bracket match by participants
          let foundRoundIndex = -1;
          let foundMatchIndex = -1;

          for (let roundIndex = 0; roundIndex < brackets.rounds.length; roundIndex++) {
            const round = brackets.rounds[roundIndex];
            for (let matchIndex = 0; matchIndex < round.matches.length; matchIndex++) {
              const bracketMatch = round.matches[matchIndex];
              // Check if this bracket match has the same participants as the recorded match
              if (
                bracketMatch.participant1 &&
                bracketMatch.participant2 &&
                matchParticipants.includes(bracketMatch.participant1) &&
                matchParticipants.includes(bracketMatch.participant2) &&
                !bracketMatch.winner // Only update if winner not already set
              ) {
                foundRoundIndex = roundIndex;
                foundMatchIndex = matchIndex;
                break;
              }
            }
            if (foundRoundIndex !== -1) break;
          }

          if (foundRoundIndex !== -1 && foundMatchIndex !== -1) {
            // Set the winner in the current bracket match
            brackets.rounds[foundRoundIndex].matches[foundMatchIndex].winner = winner;
            brackets.rounds[foundRoundIndex].matches[foundMatchIndex].matchId = match.matchId;

            const isLastRound = foundRoundIndex === brackets.rounds.length - 1;

            if (isLastRound) {
              // This was the finals - set tournament winner and complete
              await dynamoDb.update({
                TableName: TableNames.TOURNAMENTS,
                Key: { tournamentId: match.tournamentId },
                UpdateExpression: 'SET brackets = :brackets, winner = :winner, #status = :status',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                  ':brackets': brackets,
                  ':winner': winner,
                  ':status': 'completed',
                },
              });
            } else {
              // Advance winner to next round
              const nextRoundIndex = foundRoundIndex + 1;
              const nextMatchIndex = Math.floor(foundMatchIndex / 2);
              const isFirstOfPair = foundMatchIndex % 2 === 0;

              // Place winner in the appropriate slot of the next round match
              if (isFirstOfPair) {
                brackets.rounds[nextRoundIndex].matches[nextMatchIndex].participant1 = winner;
              } else {
                brackets.rounds[nextRoundIndex].matches[nextMatchIndex].participant2 = winner;
              }

              // Update tournament status to in-progress if it was upcoming
              const newStatus = tournament.Item.status === 'upcoming' ? 'in-progress' : tournament.Item.status;

              await dynamoDb.update({
                TableName: TableNames.TOURNAMENTS,
                Key: { tournamentId: match.tournamentId },
                UpdateExpression: 'SET brackets = :brackets, #status = :status',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                  ':brackets': brackets,
                  ':status': newStatus,
                },
              });
            }
          }
        }
      }
    }

    return success({ message: 'Match result recorded successfully', match: { ...match, winners: body.winners, losers: body.losers, status: 'completed' } });
  } catch (err) {
    console.error('Error recording match result:', err);
    return serverError('Failed to record match result');
  }
};
