import { handler as listWrestlersHandler } from './listWrestlers';
import { handler as createWrestlerHandler } from './createWrestler';
import { handler as getWrestlerHandler } from './getWrestler';
import { handler as updateWrestlerHandler } from './updateWrestler';
import { handler as deleteWrestlerHandler } from './deleteWrestler';
import { handler as importWrestlersHandler } from './importWrestlers';
import { createRouter, RouteConfig } from '../../lib/router';

// Order is significant for readability: /wrestlers/import is registered before
// /wrestlers/{wrestlerId} so it's unambiguous that "import" is a distinct
// resource, not a path parameter. (API Gateway matches on `event.resource`,
// so each entry here is keyed on the exact resource template.)
const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/wrestlers/import',
    method: 'POST',
    handler: importWrestlersHandler,
  },
  {
    resource: '/wrestlers',
    method: 'GET',
    handler: listWrestlersHandler,
  },
  {
    resource: '/wrestlers',
    method: 'POST',
    handler: createWrestlerHandler,
  },
  {
    resource: '/wrestlers/{wrestlerId}',
    method: 'GET',
    handler: getWrestlerHandler,
  },
  {
    resource: '/wrestlers/{wrestlerId}',
    method: 'PUT',
    handler: updateWrestlerHandler,
  },
  {
    resource: '/wrestlers/{wrestlerId}',
    method: 'DELETE',
    handler: deleteWrestlerHandler,
  },
];

export const handler = createRouter(routes);
