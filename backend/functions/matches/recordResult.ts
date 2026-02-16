import { APIGatewayProxyHandler } from 'aws-lambda';
import { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { invokeAsync } from '../../lib/asyncLambda';
import { calculateFantasyPoints } from '../fantasy/calculateFantasyPoints';

interface RecordResultBody {
  winners: string[];
  losers: string[];
  starRating?: number;
  matchOfTheNight?: boolean;
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

async function autoCompleteEvent(matchId: string): Promise<void> {
  // Scan events that are upcoming or in-progress to find one containing this match
  const eventsResult = await dynamoDb.scan({
    TableName: TableNames.EVENTS,
    FilterExpression: '#status IN (:upcoming, :inProgress)',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':upcoming': 'upcoming',
      ':inProgress': 'in-progress',
    },
    ConsistentRead: true,
  });

  for (const eventItem of eventsResult.Items || []) {
    const matchCards = (eventItem as Record<string, any>).matchCards || [];
    const matchIds = matchCards.map((c: Record<string, any>) => c.matchId).filter(Boolean);

    if (!matchIds.includes(matchId)) continue;

    // This event contains the match — check if ALL matches are completed
    if (matchIds.length === 0) continue;

    let allCompleted = true;
    for (const mId of matchIds) {
      const matchQuery = await dynamoDb.query({
        TableName: TableNames.MATCHES,
        KeyConditionExpression: 'matchId = :matchId',
        ExpressionAttributeValues: { ':matchId': mId },
        ConsistentRead: true,
        Limit: 1,
      });
      const m = matchQuery.Items?.[0];
      if (!m || m.status !== 'completed') {
        allCompleted = false;
        break;
      }
    }

    if (allCompleted) {
      await dynamoDb.update({
        TableName: TableNames.EVENTS,
        Key: { eventId: eventItem.eventId },
        UpdateExpression: 'SET #status = :completed, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':completed': 'completed',
          ':now': new Date().toISOString(),
        },
      });
      console.log(`Event ${eventItem.eventId} auto-completed: all ${matchIds.length} matches finished`);

      // Calculate fantasy points for all users who made picks for this event
      // Must await here — if fire-and-forget, Lambda may freeze before scoring completes
      try {
        await calculateFantasyPoints(eventItem.eventId as string);
      } catch (err) {
        console.warn('Fantasy points calculation failed:', err);
      }
    } else {
      // If at least one match is done but not all, mark as in-progress
      if (eventItem.status === 'upcoming') {
        await dynamoDb.update({
          TableName: TableNames.EVENTS,
          Key: { eventId: eventItem.eventId },
          UpdateExpression: 'SET #status = :inProgress, updatedAt = :now',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':inProgress': 'in-progress',
            ':now': new Date().toISOString(),
          },
        });
        console.log(`Event ${eventItem.eventId} marked as in-progress`);
      }
    }

    break; // A match should only belong to one event
  }
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

    let body: RecordResultBody;
    try {
      body = JSON.parse(event.body);
    } catch {
      return badRequest('Invalid JSON in request body');
    }

    if (!body.winners || !body.losers || body.winners.length === 0) {
      return badRequest('Winners and losers are required');
    }

    const overlap = body.winners.filter((w: string) => body.losers.includes(w));
    if (overlap.length > 0) {
      return badRequest('A player cannot be both a winner and loser in the same match');
    }

    if (body.starRating != null) {
      const r = body.starRating;
      if (typeof r !== 'number' || r < 0.5 || r > 5 || (r * 2) % 1 !== 0) {
        return badRequest('starRating must be a number between 0.5 and 5 in half-star steps');
      }
    }

    // Get the match using query (matchId is the partition key)
    const matchResult = await dynamoDb.query({
      TableName: TableNames.MATCHES,
      KeyConditionExpression: 'matchId = :matchId',
      ExpressionAttributeValues: { ':matchId': matchId },
      ConsistentRead: true,
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

    // 1. Update match with results and optimistic locking (+ optional starRating, matchOfTheNight)
    const matchUpdateValues: Record<string, unknown> = {
      ':winners': body.winners,
      ':losers': body.losers,
      ':status': 'completed',
      ':zero': 0,
      ':one': 1,
      ':pending': 'pending',
      ':scheduled': 'scheduled',
      ':now': timestamp,
    };
    let matchSetExpr = 'SET winners = :winners, losers = :losers, #status = :status, version = if_not_exists(version, :zero) + :one, updatedAt = :now';
    if (body.starRating != null) {
      matchSetExpr += ', starRating = :starRating';
      matchUpdateValues[':starRating'] = body.starRating;
    }
    if (body.matchOfTheNight != null) {
      matchSetExpr += ', matchOfTheNight = :matchOfTheNight';
      matchUpdateValues[':matchOfTheNight'] = body.matchOfTheNight;
    }
    transactItems.push({
      Update: {
        TableName: TableNames.MATCHES,
        Key: { matchId: match.matchId, date: match.date },
        UpdateExpression: matchSetExpr,
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: matchUpdateValues,
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
    if (transactItems.length > 100) {
      return serverError(`Transaction too large: ${transactItems.length} items exceeds DynamoDB limit of 100`);
    }

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

    // Handle championship result (separate transaction to avoid hitting item limits)
    if (match.isChampionship && match.championshipId) {
      const championship = await dynamoDb.get({
        TableName: TableNames.CHAMPIONSHIPS,
        Key: { championshipId: match.championshipId },
        ConsistentRead: true,
      });

      if (championship.Item) {
        const newChampion = body.winners.length === 1 ? body.winners[0] : body.winners;
        const oldChampion = championship.Item.currentChampion;

        // Determine if this is a title defense (champion retained) vs a title change
        const isTitleDefense = oldChampion != null && (
          // Singles: both are strings, compare directly
          (typeof oldChampion === 'string' && typeof newChampion === 'string' && oldChampion === newChampion) ||
          // Tag: both are arrays, compare sorted
          (Array.isArray(oldChampion) && Array.isArray(newChampion) &&
            oldChampion.length === newChampion.length &&
            JSON.stringify([...oldChampion].sort()) === JSON.stringify([...newChampion].sort()))
        );

        // Store isTitleDefense flag on the match record for downstream consumers (e.g. fantasy scoring)
        await dynamoDb.update({
          TableName: TableNames.MATCHES,
          Key: { matchId: match.matchId, date: match.date },
          UpdateExpression: 'SET isTitleDefense = :itd',
          ExpressionAttributeValues: { ':itd': isTitleDefense },
        });

        const championshipTransactItems: TransactWriteItem[] = [];

        if (isTitleDefense) {
          // Title defense: champion retained — increment defenses on the current reign
          const historyResult = await dynamoDb.query({
            TableName: TableNames.CHAMPIONSHIP_HISTORY,
            KeyConditionExpression: 'championshipId = :championshipId',
            FilterExpression: 'attribute_not_exists(lostDate)',
            ExpressionAttributeValues: { ':championshipId': match.championshipId },
            ScanIndexForward: false,
            Limit: 1,
          });

          if (historyResult.Items && historyResult.Items.length > 0) {
            const currentReign = historyResult.Items[0];
            championshipTransactItems.push({
              Update: {
                TableName: TableNames.CHAMPIONSHIP_HISTORY,
                Key: {
                  championshipId: currentReign.championshipId,
                  wonDate: currentReign.wonDate,
                },
                UpdateExpression: 'SET defenses = if_not_exists(defenses, :zero) + :one',
                ExpressionAttributeValues: {
                  ':zero': 0,
                  ':one': 1,
                },
              },
            });
          }

          // Championship record stays the same — no need to update currentChampion
        } else {
          // Title change: new champion crowned

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
            const historyResult = await dynamoDb.query({
              TableName: TableNames.CHAMPIONSHIP_HISTORY,
              KeyConditionExpression: 'championshipId = :championshipId',
              FilterExpression: 'attribute_not_exists(lostDate)',
              ExpressionAttributeValues: { ':championshipId': match.championshipId },
              ScanIndexForward: false,
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
                defenses: 0,
              },
            },
          });
        }

        if (championshipTransactItems.length > 0) {
          await dynamoDb.transactWrite({
            TransactItems: championshipTransactItems,
          } as TransactWriteCommandInput);
        }
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
            if (!round || !round.matches) continue;
            for (let matchIndex = 0; matchIndex < round.matches.length; matchIndex++) {
              const bracketMatch = round.matches[matchIndex];
              if (!bracketMatch) continue;
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
            const foundRound = brackets.rounds[foundRoundIndex];
            const foundMatch = foundRound?.matches?.[foundMatchIndex];
            if (!foundRound || !foundMatch) {
              console.warn(`Corrupted bracket data: round ${foundRoundIndex} or match ${foundMatchIndex} is null`);
            } else {
              foundMatch.winner = winner;
              foundMatch.matchId = match.matchId;

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

                const nextRound = brackets.rounds[nextRoundIndex];
                const nextMatch = nextRound?.matches?.[nextMatchIndex];
                if (!nextRound || !nextMatch) {
                  console.warn(`Corrupted bracket data: next round ${nextRoundIndex} or next match ${nextMatchIndex} is null`);
                } else {
                  if (isFirstOfPair) {
                    nextMatch.participant1 = winner;
                  } else {
                    nextMatch.participant2 = winner;
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
      }
    }

    // Auto-complete event if all its matches are now finished
    // Must await — if fire-and-forget, Lambda may freeze before completion runs
    try {
      await autoCompleteEvent(matchId);
    } catch (err) {
      console.warn('Event auto-complete failed:', err);
    }

    // Fire-and-forget: trigger ranking and cost recalculation via async Lambda invocation
    try {
      await invokeAsync('contenders', { source: 'recordResult' });
    } catch (err) {
      console.warn('Failed to invoke calculateRankings async:', err);
    }
    try {
      await invokeAsync('fantasy', { source: 'recordResult' });
    } catch (err) {
      console.warn('Failed to invoke recalculateWrestlerCosts async:', err);
    }

    const returnedMatch = {
      ...match,
      winners: body.winners,
      losers: body.losers,
      status: 'completed' as const,
      ...(body.starRating != null && { starRating: body.starRating }),
      ...(body.matchOfTheNight != null && { matchOfTheNight: body.matchOfTheNight }),
    };
    return success({
      message: 'Match result recorded successfully',
      match: returnedMatch,
    });
  } catch (err) {
    console.error('Error recording match result:', err);
    return serverError('Failed to record match result');
  }
};
