import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';

interface ScheduleMatchBody {
  date: string;
  matchType: string;
  stipulation?: string;
  participants: string[];
  isChampionship: boolean;
  championshipId?: string;
  tournamentId?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }

    const body: ScheduleMatchBody = JSON.parse(event.body);

    if (!body.date || !body.matchType || !body.participants || body.participants.length < 2) {
      return badRequest('Date, matchType, and at least 2 participants are required');
    }

    if (body.isChampionship && !body.championshipId) {
      return badRequest('Championship ID is required for championship matches');
    }

    const match = {
      matchId: uuidv4(),
      date: body.date,
      matchType: body.matchType,
      stipulation: body.stipulation || '',
      participants: body.participants,
      isChampionship: body.isChampionship,
      championshipId: body.championshipId,
      tournamentId: body.tournamentId,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    };

    await dynamoDb.put({
      TableName: TableNames.MATCHES,
      Item: match,
    });

    return created(match);
  } catch (err) {
    console.error('Error scheduling match:', err);
    return serverError('Failed to schedule match');
  }
};
