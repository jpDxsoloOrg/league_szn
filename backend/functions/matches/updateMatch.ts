import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

interface UpdateMatchBody {
  matchFormat?: string;
  stipulationId?: string | null;
  participants?: string[];
  teams?: string[][] | null;
  isChampionship?: boolean;
  championshipId?: string | null;
  tournamentId?: string | null;
  seasonId?: string | null;
  eventId?: string | null;
  designation?: string | null;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const matchId = event.pathParameters?.matchId;
    if (!matchId) {
      return badRequest('matchId is required');
    }

    const { data: body, error: parseError } = parseBody<UpdateMatchBody>(event);
    if (parseError) return parseError;

    // Fetch existing match (matchId is PK, need to find the sort key 'date')
    const matchResult = await dynamoDb.query({
      TableName: TableNames.MATCHES,
      KeyConditionExpression: 'matchId = :matchId',
      ExpressionAttributeValues: { ':matchId': matchId },
      Limit: 1,
    });

    const existingMatch = matchResult.Items?.[0] as Record<string, unknown> | undefined;
    if (!existingMatch) {
      return notFound('Match not found');
    }

    // Only allow editing scheduled matches
    if (existingMatch.status !== 'scheduled') {
      return badRequest('Only scheduled matches can be edited');
    }

    // Validate participants if provided
    if (body.participants) {
      if (body.participants.length < 2) {
        return badRequest('At least 2 participants are required');
      }

      // Check for duplicate participants
      const uniqueParticipants = new Set(body.participants);
      if (uniqueParticipants.size !== body.participants.length) {
        return badRequest('Duplicate participants are not allowed');
      }

      const playerValidationPromises = body.participants.map(async (playerId) => {
        const player = await dynamoDb.get({
          TableName: TableNames.PLAYERS,
          Key: { playerId },
        });
        return { playerId, exists: !!player.Item, player: player.Item };
      });

      const playerResults = await Promise.all(playerValidationPromises);
      const missingPlayers = playerResults.filter((p) => !p.exists).map((p) => p.playerId);

      if (missingPlayers.length > 0) {
        return notFound(`Players not found: ${missingPlayers.join(', ')}`);
      }

      // Validate championship division restriction if championship is set
      const effectiveChampionshipId = body.championshipId !== undefined
        ? body.championshipId
        : existingMatch.championshipId as string | undefined;

      if (effectiveChampionshipId) {
        const championship = await dynamoDb.get({
          TableName: TableNames.CHAMPIONSHIPS,
          Key: { championshipId: effectiveChampionshipId },
        });

        if (championship.Item) {
          const champDivisionId = (championship.Item as Record<string, unknown>).divisionId as string | undefined;
          if (champDivisionId) {
            const wrongDivision = playerResults.filter((p) => {
              const playerDivision = (p.player as Record<string, unknown>)?.divisionId as string | undefined;
              return playerDivision !== champDivisionId;
            });

            if (wrongDivision.length > 0) {
              return badRequest(
                `Championship is locked to a division. The following participants are not in the correct division: ${wrongDivision.map((p) => p.playerId).join(', ')}`,
              );
            }
          }
        }
      }
    }

    // Validate championship exists if provided
    if (body.championshipId) {
      const championship = await dynamoDb.get({
        TableName: TableNames.CHAMPIONSHIPS,
        Key: { championshipId: body.championshipId },
      });

      if (!championship.Item) {
        return notFound(`Championship not found: ${body.championshipId}`);
      }
    }

    // Validate isChampionship + championshipId consistency
    const effectiveIsChampionship = body.isChampionship !== undefined
      ? body.isChampionship
      : existingMatch.isChampionship as boolean;
    const effectiveChampionshipId = body.championshipId !== undefined
      ? body.championshipId
      : existingMatch.championshipId as string | null | undefined;

    if (effectiveIsChampionship && !effectiveChampionshipId) {
      return badRequest('Championship ID is required for championship matches');
    }

    // Validate tournament exists if provided
    if (body.tournamentId) {
      const tournament = await dynamoDb.get({
        TableName: TableNames.TOURNAMENTS,
        Key: { tournamentId: body.tournamentId },
      });

      if (!tournament.Item) {
        return notFound(`Tournament not found: ${body.tournamentId}`);
      }

      if ((tournament.Item as Record<string, unknown>).status === 'completed') {
        return badRequest('Cannot assign match to a completed tournament');
      }
    }

    // Validate season exists and is active if provided
    if (body.seasonId) {
      const season = await dynamoDb.get({
        TableName: TableNames.SEASONS,
        Key: { seasonId: body.seasonId },
      });

      if (!season.Item) {
        return notFound(`Season not found: ${body.seasonId}`);
      }

      if ((season.Item as Record<string, unknown>).status !== 'active') {
        return badRequest('Cannot assign match to an inactive season');
      }
    }

    // Validate stipulationId exists if provided
    if (body.stipulationId) {
      const stipulation = await dynamoDb.get({
        TableName: TableNames.STIPULATIONS,
        Key: { stipulationId: body.stipulationId },
      });

      if (!stipulation.Item) {
        return notFound(`Stipulation not found: ${body.stipulationId}`);
      }
    }

    // Build update expression
    const now = new Date().toISOString();
    const expressionParts: string[] = [];
    const expressionNames: Record<string, string> = {};
    const expressionValues: Record<string, unknown> = {};

    const fieldsToUpdate: Array<{ key: string; bodyKey: keyof UpdateMatchBody }> = [
      { key: 'matchFormat', bodyKey: 'matchFormat' },
      { key: 'stipulationId', bodyKey: 'stipulationId' },
      { key: 'participants', bodyKey: 'participants' },
      { key: 'teams', bodyKey: 'teams' },
      { key: 'isChampionship', bodyKey: 'isChampionship' },
      { key: 'championshipId', bodyKey: 'championshipId' },
      { key: 'tournamentId', bodyKey: 'tournamentId' },
      { key: 'seasonId', bodyKey: 'seasonId' },
      { key: 'eventId', bodyKey: 'eventId' },
      { key: 'designation', bodyKey: 'designation' },
    ];

    for (const field of fieldsToUpdate) {
      if (body[field.bodyKey] !== undefined) {
        const alias = `#${field.key}`;
        const valueAlias = `:${field.key}`;
        expressionNames[alias] = field.key;
        expressionValues[valueAlias] = body[field.bodyKey];
        expressionParts.push(`${alias} = ${valueAlias}`);
      }
    }

    // Always set updatedAt
    expressionNames['#updatedAt'] = 'updatedAt';
    expressionValues[':updatedAt'] = now;
    expressionParts.push('#updatedAt = :updatedAt');

    if (expressionParts.length === 1) {
      // Only updatedAt — nothing meaningful to update
      return badRequest('No fields to update');
    }

    await dynamoDb.update({
      TableName: TableNames.MATCHES,
      Key: { matchId, date: existingMatch.date as string },
      UpdateExpression: `SET ${expressionParts.join(', ')}`,
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
    });

    // Handle eventId changes — remove from old event, add to new event
    // Also handle designation changes when staying on the same event
    const oldEventId = existingMatch.eventId as string | undefined;
    const newEventId = body.eventId !== undefined ? (body.eventId as string | null) : undefined;

    // Designation changed but event stayed the same — update the card in-place
    const effectiveEventId = newEventId !== undefined ? newEventId : oldEventId;
    if (body.designation !== undefined && effectiveEventId && (newEventId === undefined || newEventId === oldEventId)) {
      try {
        const eventResult = await dynamoDb.get({
          TableName: TableNames.EVENTS,
          Key: { eventId: effectiveEventId },
        });

        if (eventResult.Item) {
          const matchCards = ((eventResult.Item as Record<string, unknown>).matchCards as Record<string, unknown>[] | undefined) || [];
          const updatedCards = matchCards.map((card) => {
            if ((card as Record<string, unknown>).matchId === matchId) {
              return { ...card, designation: body.designation };
            }
            return card;
          });

          await dynamoDb.update({
            TableName: TableNames.EVENTS,
            Key: { eventId: effectiveEventId },
            UpdateExpression: 'SET matchCards = :cards, updatedAt = :now',
            ExpressionAttributeValues: {
              ':cards': updatedCards,
              ':now': now,
            },
          });
        }
      } catch (err) {
        console.warn('Failed to update designation on event:', err);
      }
    }

    if (newEventId !== undefined && newEventId !== oldEventId) {
      // Remove from old event if it had one
      if (oldEventId) {
        try {
          const oldEventResult = await dynamoDb.get({
            TableName: TableNames.EVENTS,
            Key: { eventId: oldEventId },
          });

          if (oldEventResult.Item) {
            const matchCards = ((oldEventResult.Item as Record<string, unknown>).matchCards as Record<string, unknown>[] | undefined) || [];
            const updatedCards = matchCards.filter(
              (card) => (card as Record<string, unknown>).matchId !== matchId,
            );

            await dynamoDb.update({
              TableName: TableNames.EVENTS,
              Key: { eventId: oldEventId },
              UpdateExpression: 'SET matchCards = :cards, updatedAt = :now',
              ExpressionAttributeValues: {
                ':cards': updatedCards,
                ':now': now,
              },
            });
          }
        } catch (err) {
          console.warn('Failed to remove match from old event:', err);
        }
      }

      // Add to new event if one was provided
      if (newEventId) {
        try {
          const newEventResult = await dynamoDb.get({
            TableName: TableNames.EVENTS,
            Key: { eventId: newEventId },
          });

          if (newEventResult.Item) {
            const existingCards = ((newEventResult.Item as Record<string, unknown>).matchCards as unknown[] | undefined) || [];
            const newCard = {
              matchId,
              position: existingCards.length + 1,
              designation: body.designation || (existingMatch.designation as string | undefined) || 'midcard',
            };

            await dynamoDb.update({
              TableName: TableNames.EVENTS,
              Key: { eventId: newEventId },
              UpdateExpression: 'SET matchCards = list_append(if_not_exists(matchCards, :empty), :newCard), updatedAt = :now',
              ExpressionAttributeValues: {
                ':newCard': [newCard],
                ':empty': [],
                ':now': now,
              },
            });
          }
        } catch (err) {
          console.warn('Failed to add match to new event:', err);
        }
      }
    }

    // Return the updated match
    const updatedResult = await dynamoDb.query({
      TableName: TableNames.MATCHES,
      KeyConditionExpression: 'matchId = :matchId',
      ExpressionAttributeValues: { ':matchId': matchId },
      Limit: 1,
    });

    return success(updatedResult.Items?.[0] || { matchId, updated: true });
  } catch (err) {
    console.error('Error updating match:', err);
    return serverError('Failed to update match');
  }
};
