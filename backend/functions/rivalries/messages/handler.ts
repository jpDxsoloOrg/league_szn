import { handler as postMessageHandler } from './postMessage';
import { handler as listMessagesHandler } from './listMessages';
import { createRouter, type RouteConfig } from '../../../lib/router';

/**
 * Single Lambda for rivalry messages (RIV-04). Both routes are
 * authed; per-message audience filtering happens inside the handlers.
 */
const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/rivalries/{rivalryId}/messages',
    method: 'GET',
    handler: listMessagesHandler,
    requireAuth: true,
  },
  {
    resource: '/rivalries/{rivalryId}/messages',
    method: 'POST',
    handler: postMessageHandler,
    requireAuth: true,
  },
];

export const handler = createRouter(routes);
