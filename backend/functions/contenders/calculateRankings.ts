import { Handler } from 'aws-lambda';
import { success, serverError } from '../../lib/response';
import {
  recalculateContenderRankings,
  type ConfigOverrides,
} from '../../lib/services/recalculateContenderRankings';

export const handler: Handler = async (event) => {
  try {
    // Async invocation (from recordResult via invokeAsync) — no requestContext
    const isAsyncInvocation = !event.requestContext;

    const body = isAsyncInvocation
      ? (event || {})
      : ((event.body ? JSON.parse(event.body) : null) ?? {});
    const requestedChampionshipId: string | undefined = body.championshipId;
    const configOverrides: ConfigOverrides = {
      minimumMatches: typeof body.minimumMatches === 'number' ? body.minimumMatches : undefined,
      maxContenders: typeof body.maxContenders === 'number' ? body.maxContenders : undefined,
      divisionRestricted: typeof body.divisionRestricted === 'boolean' ? body.divisionRestricted : undefined,
    };

    const result = await recalculateContenderRankings(requestedChampionshipId, configOverrides);

    // Partial runs report their failures in the summary; a run that saved
    // nothing is an error for the caller.
    if (result.championshipsFailed > 0 && result.championshipsProcessed === 0) {
      throw new Error(`Rankings failed for: ${result.failedChampionships.join(', ')}`);
    }

    // For async invocations, just return the plain result (no API Gateway response wrapper)
    if (isAsyncInvocation) {
      console.log('Async ranking recalculation complete:', JSON.stringify(result));
      return result;
    }

    return success(result);
  } catch (err) {
    console.error('Error calculating rankings:', err);

    // For async invocations, re-throw so Lambda marks it as failed
    if (!event.requestContext) {
      throw err;
    }

    return serverError('Failed to calculate rankings');
  }
};
