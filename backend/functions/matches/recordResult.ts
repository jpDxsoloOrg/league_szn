import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { success, badRequest, conflict, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import {
  recordMatchResult,
  RecordMatchResultError,
} from '../../lib/services/recordMatchResult';

interface RecordResultBody {
  winners: string[];
  losers: string[];
  isDraw?: boolean;
}

function mapRecordResultError(error: RecordMatchResultError): APIGatewayProxyResult {
  switch (error.kind) {
    case 'badRequest':
      return badRequest(error.message);
    case 'notFound':
      return notFound(error.message);
    case 'conflict':
      return conflict(error.message);
  }
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const matchId = event.pathParameters?.matchId;

    if (!matchId) {
      return badRequest('Match ID is required');
    }

    const { data: body, error: parseError } = parseBody<RecordResultBody>(event);
    if (parseError) return parseError;

    const { match } = await recordMatchResult(
      { matchId, winners: body.winners, losers: body.losers, isDraw: body.isDraw },
      { source: 'manual' },
    );

    return success({
      message: 'Match result recorded successfully',
      match,
    });
  } catch (err) {
    if (err instanceof RecordMatchResultError) {
      return mapRecordResultError(err);
    }
    console.error('Error recording match result:', err);
    return serverError('Failed to record match result');
  }
};
