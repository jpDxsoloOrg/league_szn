import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context } from 'aws-lambda';

import { handler as companiesHandler } from '../companies/handler';
import { handler as showsHandler } from '../shows/handler';
import { handler as divisionsHandler } from '../divisions/handler';
import { handler as stipulationsHandler } from '../stipulations/handler';
import { handler as matchTypesHandler } from '../matchTypes/handler';
import { handler as videosHandler } from '../videos/handler';
import { handler as activityHandler } from '../activity/handler';
import { handler as transfersHandler } from '../transfers/handler';
import { handler as storylineRequestsHandler } from '../storylineRequests/handler';
import { notFound } from '../../lib/response';

type DomainHandler = APIGatewayProxyHandler;

// Resource-prefix → domain handler. Order matters: longer / more specific
// prefixes come first so `/admin/videos` matches its entry before a bare
// `/admin/*` prefix (if one is ever added).
const routeTable: ReadonlyArray<[string, DomainHandler]> = [
  ['/admin/videos', videosHandler],
  ['/admin/transfers', transfersHandler],
  ['/admin/storyline-requests', storylineRequestsHandler],
  ['/companies', companiesHandler],
  ['/shows', showsHandler],
  ['/divisions', divisionsHandler],
  ['/stipulations', stipulationsHandler],
  ['/match-types', matchTypesHandler],
  ['/videos', videosHandler],
  ['/activity', activityHandler],
  ['/transfers', transfersHandler],
  ['/storyline-requests', storylineRequestsHandler],
];

function matchDomain(resource: string | undefined): DomainHandler | null {
  if (!resource) return null;
  for (const [prefix, handler] of routeTable) {
    if (resource === prefix || resource.startsWith(`${prefix}/`)) {
      return handler;
    }
  }
  return null;
}

const noopCallback = () => {};

export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback,
): Promise<APIGatewayProxyResult> => {
  const matched = matchDomain(event.resource);
  if (!matched) {
    return notFound(`No handler for resource ${event.resource ?? '(none)'}`);
  }
  return (await matched(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
};
