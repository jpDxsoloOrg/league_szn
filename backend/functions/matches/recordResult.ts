import { APIGatewayProxyHandler } from 'aws-lambda';
import { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';

interface RecordResultBody {
  winners: string[];
  losers: string[];
}

interface TransactWriteItem {
  Update?: {
    TableName: string;
    Key: Record<string, unknown>;
    UpdateExpression: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
    ConditionExpression?: string;
  };
  Put?: {
    TableName: string;
    Item: Record<string, unknown>;
    ConditionExpression?: string;
  };
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

    // Get the match using query (matchId is the hash key)
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

    const timestamp = new Date().toISOString();
    const allParticipants = [...body.winners, ...body.losers];
    const isDraw = body.winners.length > 1 && body.losers.length > 1 &&
                   JSON.stringify(body.winners.sort()) === JSON.stringify(body.losers.sort());

    // Build transaction items for atomic updates
    const transactItems: TransactWriteItem[] = [];

    // 1. Update match with results and optimistic locking
    transactItems.push({
      Update: {
        TableName: TableNames.MATCHES,
        Key: { matchId: match.matchId, date: match.date },
        UpdateExpression: 'SET winners = :winners, losers = :losers, #status = :status, version = if_not_exists(version, :zero) + :one',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':winners': body.winners,
          ':losers': body.losers,
          ':status': 'completed',
          ':zero': 0,
          ':one': 1,
          ':pending': 'pending',
          ':scheduled': 'scheduled',
        },
        ConditionExpression: '#status = :pending OR #status = :scheduled',
      },
    });

    // 2. Update player standings (all-time) for winners
    for (const playerId of body.winners) {
      transactItems.push({
        Update: {
          TableName: TableNames.PLAYERS,
          Key: { playerId },
          UpdateExpression: isDraw
            ? 'SET draws = if_not_exists(draws, :zero) + :one, updatedAt = :timestamp'
            : 'SET wins = if_not_exists(wins, :zero) + :one, updatedAt = :timestamp',
          ExpressionAttributeValues: {
            ':one': 1,
            ':zero': 0,
            ':timestamp': timestamp,
          },
        },
      });
    }

    // 3. Update player standings (all-time) for losers (if not a draw)
    if (!isDraw) {
      for (const playerId of body.losers) {
        transactItems.push({
          Update: {
            TableName: TableNames.PLAYERS,
            Key: { playerId },
            UpdateExpression: 'SET losses = if_not_exists(losses, :zero) + :one, updatedAt = :timestamp',
            ExpressionAttributeValues: {
              ':one': 1,
              ':zero': 0,
              ':timestamp': timestamp,
            },
          },
        });
      }
    }

    // 4. Update season standings if match belongs to a season
    if (match.seasonId) {
      for (const playerId of body.winners) {
        transactItems.push({
          Update: {
            TableName: TableNames.SEASON_STANDINGS,
            Key: { seasonId: match.seasonId, playerId },
            UpdateExpression: isDraw
              ? 'SET draws = if_not_exists(draws, :zero) + :one, wins = if_not_exists(wins, :zero), losses = if_not_exists(losses, :zero), updatedAt = :timestamp'
              : 'SET wins = if_not_exists(wins, :zero) + :one, losses = if_not_exists(losses, :zero), draws = if_not_exists(draws, :zero), updatedAt = :timestamp',
            ExpressionAttributeValues: {
              ':one': 1,
              ':zero': 0,
              ':timestamp': timestamp,
            },
          },
        });
      }

      if (!isDraw) {
        for (const playerId of body.losers) {
          transactItems.push({
            Update: {
              TableName: TableNames.SEASON_STANDINGS,
              Key: { seasonId: match.seasonId, playerId },
              UpdateExpression: 'SET losses = if_not_exists(losses, :zero) + :one, wins = if_not_exists(wins, :zero), draws = if_not_exists(draws, :zero), updatedAt = :timestamp',
              ExpressionAttributeValues: {
                ':one': 1,
                ':zero': 0,
                ':timestamp': timestamp,
              },
            },
          });
        }
      }
    }

    // Execute the core transaction (match + player standings + season standings)
    // DynamoDB transactions are limited to 100 items, so we execute the core updates first
    try {
      await dynamoDb.transactWrite({
        TransactItems: transactItems,
      } as TransactWriteCommandInput);
    } catch (transactError: unknown) {
      const error = transactError as { name?: string };
      if (error.name === 'TransactionCanceledException') {
        // Transaction was cancelled - likely a concurrent modification
        return badRequest('Match result could not be recorded due to a concurrent update. Please try again.');
      }
      throw transactError;
    }

    // Handle championship change (separate transaction to avoid hitting item limits)
    if (match.isChampionship && match.championshipId) {
      const championship = await dynamoDb.get({
        TableName: TableNames.CHAMPIONSHIPS,
        Key: { championshipId: match.championshipId },
      });

      if (championship.Item) {
        const newChampion = body.winners.length === 1 ? body.winners[0] : body.winners;
        const oldChampion = championship.Item.currentChampion;

        const championshipTransactItems: TransactWriteItem[] = [];

        // Update championship current champion
        championshipTransactItems.push({
          Update: {
            TableName: TableNames.CHAMPIONSHIPS,
            Key: { championshipId: match.championshipId },
            UpdateExpression: 'SET currentChampion = :champion, version = if_not_exists(version, :zero) + :one',
            ExpressionAttributeValues: {
              ':champion': newChampion,
              ':zero': 0,
              ':one': 1,
            },
          },
        });

        // Close old reign if exists
        if (oldChampion) {
          // Query for active reign using the championship history table
          const historyResult = await dynamoDb.query({
            TableName: TableNames.CHAMPIONSHIP_HISTORY,
            KeyConditionExpression: 'championshipId = :championshipId',
            FilterExpression: 'attribute_not_exists(lostDate)',
            ExpressionAttributeValues: { ':championshipId': match.championshipId },
            ScanIndexForward: false, // Most recent first
            Limit: 1,
          });

          if (historyResult.Items && historyResult.Items.length > 0) {
            const currentReign = historyResult.Items[0];
            const wonDate = new Date(currentReign.wonDate);
            const lostDate = new Date();
            const daysHeld = Math.floor((lostDate.getTime() - wonDate.getTime()) / (1000 * 60 * 60 * 24));

            championshipTransactItems.push({
              Update: {
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
              },
            });
          }
        }

        // Create new reign
        const wonDate = new Date().toISOString();
        championshipTransactItems.push({
          Put: {
            TableName: TableNames.CHAMPIONSHIP_HISTORY,
            Item: {
              championshipId: match.championshipId,
              wonDate,
              champion: newChampion,
              matchId: match.matchId,
            },
          },
        });

        await dynamoDb.transactWrite({
          TransactItems: championshipTransactItems,
        } as TransactWriteCommandInput);
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
          const numParticipants = tournament.Item.participants.length;
          const expectedTotalMatches = (numParticipants * (numParticipants - 1)) / 2;

          let totalMatchesPlayed = 0;
          for (const playerId of Object.keys(standings)) {
            totalMatchesPlayed += standings[playerId].wins;
            totalMatchesPlayed += standings[playerId].draws;
          }
          totalMatchesPlayed = totalMatchesPlayed / 2;

          const isComplete = totalMatchesPlayed >= expectedTotalMatches;

          if (isComplete) {
            let winner = '';
            let maxPoints = -1;
            for (const [playerId, stats] of Object.entries(standings) as [string, { points: number }][]) {
              if (stats.points > maxPoints) {
                maxPoints = stats.points;
                winner = playerId;
              }
            }

            await dynamoDb.update({
              TableName: TableNames.TOURNAMENTS,
              Key: { tournamentId: match.tournamentId },
              UpdateExpression: 'SET standings = :standings, winner = :winner, #status = :status, version = if_not_exists(version, :zero) + :one',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':standings': standings,
                ':winner': winner,
                ':status': 'completed',
                ':zero': 0,
                ':one': 1,
              },
            });
          } else {
            const newStatus = tournament.Item.status === 'upcoming' ? 'in-progress' : tournament.Item.status;

            await dynamoDb.update({
              TableName: TableNames.TOURNAMENTS,
              Key: { tournamentId: match.tournamentId },
              UpdateExpression: 'SET standings = :standings, #status = :status, version = if_not_exists(version, :zero) + :one',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':standings': standings,
                ':status': newStatus,
                ':zero': 0,
                ':one': 1,
              },
            });
          }
        }

        // Single elimination bracket progression
        if (tournament.Item.type === 'single-elimination' && tournament.Item.brackets) {
          const brackets = tournament.Item.brackets;
          const winner = body.winners[0];
          const matchParticipants = match.participants;

          let foundRoundIndex = -1;
          let foundMatchIndex = -1;

          for (let roundIndex = 0; roundIndex < brackets.rounds.length; roundIndex++) {
            const round = brackets.rounds[roundIndex];
            for (let matchIndex = 0; matchIndex < round.matches.length; matchIndex++) {
              const bracketMatch = round.matches[matchIndex];
              if (
                bracketMatch.participant1 &&
                bracketMatch.participant2 &&
                matchParticipants.includes(bracketMatch.participant1) &&
                matchParticipants.includes(bracketMatch.participant2) &&
                !bracketMatch.winner
              ) {
                foundRoundIndex = roundIndex;
                foundMatchIndex = matchIndex;
                break;
              }
            }
            if (foundRoundIndex !== -1) break;
          }

          if (foundRoundIndex !== -1 && foundMatchIndex !== -1) {
            brackets.rounds[foundRoundIndex].matches[foundMatchIndex].winner = winner;
            brackets.rounds[foundRoundIndex].matches[foundMatchIndex].matchId = match.matchId;

            const isLastRound = foundRoundIndex === brackets.rounds.length - 1;

            if (isLastRound) {
              await dynamoDb.update({
                TableName: TableNames.TOURNAMENTS,
                Key: { tournamentId: match.tournamentId },
                UpdateExpression: 'SET brackets = :brackets, winner = :winner, #status = :status, version = if_not_exists(version, :zero) + :one',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                  ':brackets': brackets,
                  ':winner': winner,
                  ':status': 'completed',
                  ':zero': 0,
                  ':one': 1,
                },
              });
            } else {
              const nextRoundIndex = foundRoundIndex + 1;
              const nextMatchIndex = Math.floor(foundMatchIndex / 2);
              const isFirstOfPair = foundMatchIndex % 2 === 0;

              if (isFirstOfPair) {
                brackets.rounds[nextRoundIndex].matches[nextMatchIndex].participant1 = winner;
              } else {
                brackets.rounds[nextRoundIndex].matches[nextMatchIndex].participant2 = winner;
              }

              const newStatus = tournament.Item.status === 'upcoming' ? 'in-progress' : tournament.Item.status;

              await dynamoDb.update({
                TableName: TableNames.TOURNAMENTS,
                Key: { tournamentId: match.tournamentId },
                UpdateExpression: 'SET brackets = :brackets, #status = :status, version = if_not_exists(version, :zero) + :one',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                  ':brackets': brackets,
                  ':status': newStatus,
                  ':zero': 0,
                  ':one': 1,
                },
              });
            }
          }
        }
      }
    }

    return success({
      message: 'Match result recorded successfully',
      match: { ...match, winners: body.winners, losers: body.losers, status: 'completed' },
    });
  } catch (err) {
    console.error('Error recording match result:', err);
    return serverError('Failed to record match result');
  }
};
