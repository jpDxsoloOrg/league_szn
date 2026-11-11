import { handler as upsertNoteHandler } from './upsertNote';
import { handler as listNotesHandler } from './listNotes';
import { handler as deleteNoteHandler } from './deleteNote';
import { createRouter, type RouteConfig } from '../../../lib/router';

/**
 * Single Lambda for rivalry notes (RIV-05). All routes are authed;
 * role + visibility filtering happens inside the handlers.
 */
export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/rivalries/{rivalryId}/notes',
    method: 'GET',
    handler: listNotesHandler,
    access: 'self-service',
  },
  {
    resource: '/rivalries/{rivalryId}/notes',
    method: 'POST',
    handler: upsertNoteHandler,
    access: 'self-service',
  },
  {
    resource: '/rivalries/{rivalryId}/notes/{noteId}',
    method: 'DELETE',
    handler: deleteNoteHandler,
    access: 'self-service',
  },
];

export const handler = createRouter(routes);
