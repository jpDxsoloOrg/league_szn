import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context } from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getSeasonAwardsHandler } from './getSeasonAwards';
import { handler as createSeasonAwardHandler } from './createSeasonAward';
import { handler as deleteSeasonAwardHandler } from './deleteSeasonAward';

const noopCallback = () => {};

export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod?.toUpperCase() ?? 'GET';
  const pathParams = event.pathParameters ?? {};

  if (method === 'GET' && pathParams.seasonId && !pathParams.awardId) {
    return (await getSeasonAwardsHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'POST' && pathParams.seasonId && !pathParams.awardId) {
    return (await createSeasonAwardHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'DELETE' && pathParams.seasonId && pathParams.awardId) {
    return (await deleteSeasonAwardHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }

  return methodNotAllowed();
};
