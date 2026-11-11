import { handler as listWrestlersHandler } from './listWrestlers';
import { handler as createWrestlerHandler } from './createWrestler';
import { handler as getWrestlerHandler } from './getWrestler';
import { handler as updateWrestlerHandler } from './updateWrestler';
import { handler as deleteWrestlerHandler } from './deleteWrestler';
import { handler as importWrestlersHandler } from './importWrestlers';
import { handler as resetAssignmentsHandler } from './resetAssignments';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

// Order is significant for readability: /wrestlers/import and
// /wrestlers/reset-assignments are registered before /wrestlers/{wrestlerId}
// so it's unambiguous that they are distinct resources, not path parameters.
// (API Gateway matches on `event.resource`, so each entry here is keyed on
// the exact resource template.)
export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/wrestlers/import',
    method: 'POST',
    handler: importWrestlersHandler,
    access: STAFF,
  },
  {
    resource: '/wrestlers/reset-assignments',
    method: 'POST',
    handler: resetAssignmentsHandler,
    access: STAFF,
  },
  {
    resource: '/wrestlers',
    method: 'GET',
    handler: listWrestlersHandler,
    access: 'public',
  },
  {
    resource: '/wrestlers',
    method: 'POST',
    handler: createWrestlerHandler,
    access: STAFF,
  },
  {
    resource: '/wrestlers/{wrestlerId}',
    method: 'GET',
    handler: getWrestlerHandler,
    access: 'public',
  },
  {
    resource: '/wrestlers/{wrestlerId}',
    method: 'PUT',
    handler: updateWrestlerHandler,
    access: STAFF,
  },
  {
    resource: '/wrestlers/{wrestlerId}',
    method: 'DELETE',
    handler: deleteWrestlerHandler,
    access: STAFF,
  },
];

export const handler = createRouter(routes);
