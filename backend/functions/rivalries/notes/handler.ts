import { handler as upsertNoteHandler } from './upsertNote';
import { handler as listNotesHandler } from './listNotes';
import { createRouter, type RouteConfig } from '../../../lib/router';

/**
 * Single Lambda for rivalry notes (RIV-05). Both routes are authed;
 * role + visibility filtering happens inside the handlers.
 */
const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/rivalries/{rivalryId}/notes',
    method: 'GET',
    handler: listNotesHandler,
    requireAuth: true,
  },
  {
    resource: '/rivalries/{rivalryId}/notes',
    method: 'POST',
    handler: upsertNoteHandler,
    requireAuth: true,
  },
];

export const handler = createRouter(routes);
