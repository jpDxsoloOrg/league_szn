import { handler as listInjuriesHandler } from './listInjuries';
import { handler as getPlayerInjuriesHandler } from './getPlayerInjuries';
import { handler as createStorylineInjuryHandler } from './createStorylineInjury';
import { handler as healInjuryHandler } from './healInjury';
import { handler as updateCurrentInjuryHandler } from './updateCurrentInjury';
import { handler as adjustStaminaHandler } from './adjustStamina';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

/**
 * Single Lambda for GM injury management (INJ-08). Staff (Moderator + Admin)
 * see the injury board and heal, extend, put on storyline injuries and adjust
 * stamina; a player's injury history is public (staff get the full rows).
 * Every route answers 403 while the `injuries` feature is off, except the
 * public history, which returns an empty list.
 */
export const routes: ReadonlyArray<RouteConfig> = [
  { resource: '/injuries', method: 'GET', handler: listInjuriesHandler, access: STAFF },
  { resource: '/players/{playerId}/injuries', method: 'GET', handler: getPlayerInjuriesHandler, access: 'public' },
  { resource: '/players/{playerId}/injuries', method: 'POST', handler: createStorylineInjuryHandler, access: STAFF },
  { resource: '/players/{playerId}/injuries/heal', method: 'POST', handler: healInjuryHandler, access: STAFF },
  { resource: '/players/{playerId}/injuries/current', method: 'PATCH', handler: updateCurrentInjuryHandler, access: STAFF },
  { resource: '/players/{playerId}/stamina', method: 'PATCH', handler: adjustStaminaHandler, access: STAFF },
];

export const handler = createRouter(routes);
