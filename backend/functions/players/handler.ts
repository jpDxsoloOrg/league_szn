import { handler as getPlayersHandler } from './getPlayers';
import { handler as createPlayerHandler } from './createPlayer';
import { handler as updatePlayerHandler } from './updatePlayer';
import { handler as deletePlayerHandler } from './deletePlayer';
import { handler as getMyProfileHandler } from './getMyProfile';
import { handler as updateMyProfileHandler } from './updateMyProfile';
import { ADMIN_ONLY, createRouter, type RouteConfig, STAFF } from '../../lib/router';
import { handler as getPlayerHandler } from './getPlayer';
import { handler as getBookingSummaryHandler } from './getBookingSummary';
import { handler as getPlayerStatisticsHandler } from './getPlayerStatistics';
import { handler as getPlayerDisciplineHandler } from './getPlayerDiscipline';
import { handler as issueStrikeHandler } from './issueStrike';
import { handler as removeStrikeHandler } from './removeStrike';
import { handler as reactivatePlayerHandler } from './reactivatePlayer';
import { handler as adjustBalanceHandler } from '../economy/adjustBalance';
import { handler as getMyLedgerHandler } from './getMyLedger';
import { issueFineHandler, rescindFineHandler } from '../economy/fines';
import { handler as getPlayerLedgerHandler } from '../economy/getPlayerLedger';
import { handler as getPlayerBuildHandler } from './getPlayerBuild';
import { handler as getBuildRulesHandler } from './getBuildRules';
import { updateMyBuildHandler, updatePlayerBuildHandler } from './updatePlayerBuild';


/**
 * Single Lambda for players: routes by HTTP method and path.
 * Fronted by a /{proxy+} API Gateway route; the router verifies the JWT and
 * enforces each route's access declaration before dispatching to the handler.
 */

export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/players',
    method: 'GET',
    handler: getPlayersHandler,
    access: 'public',
  },
  {
    resource: '/players/me',
    method: 'GET',
    handler: getMyProfileHandler,
    access: 'self-service',
  },
  {
    resource: '/players/booking-summary',
    method: 'GET',
    handler: getBookingSummaryHandler,
    access: STAFF,
  },
  {
    resource: '/players/me',
    method: 'PUT',
    handler: updateMyProfileHandler,
    access: 'self-service',
  },
  {
    resource: '/players',
    method: 'POST',
    handler: createPlayerHandler,
    access: STAFF,
  },
  {
    resource: '/players/{playerId}',
    method: 'GET',
    handler: getPlayerHandler,
    access: 'public',
  },
  {
    resource: '/players/{playerId}/statistics',
    method: 'GET',
    handler: getPlayerStatisticsHandler,
    access: 'public',
  },
  {
    resource: '/players/{playerId}',
    method: 'PUT',
    handler: updatePlayerHandler,
    access: STAFF,
  },
  {
    resource: '/players/{playerId}',
    method: 'DELETE',
    handler: deletePlayerHandler,
    access: STAFF,
  },
  {
    resource: '/players/{playerId}/discipline',
    method: 'GET',
    handler: getPlayerDisciplineHandler,
    access: STAFF,
  },
  {
    resource: '/players/{playerId}/strikes',
    method: 'POST',
    handler: issueStrikeHandler,
    access: ADMIN_ONLY,
  },
  {
    resource: '/players/{playerId}/strikes/{strikeId}/remove',
    method: 'POST',
    handler: removeStrikeHandler,
    access: ADMIN_ONLY,
  },
  {
    resource: '/players/{playerId}/reactivate',
    method: 'POST',
    handler: reactivatePlayerHandler,
    access: ADMIN_ONLY,
  },

  // BLD-03: wrestler builds. Reading is public; a Wrestler saves their own
  // (the handler checks the role), staff save anyone's.
  {
    resource: '/builds/rules',
    method: 'GET',
    handler: getBuildRulesHandler,
    access: 'public',
  },
  {
    resource: '/players/{playerId}/build',
    method: 'GET',
    handler: getPlayerBuildHandler,
    access: 'public',
  },
  {
    resource: '/players/me/build',
    method: 'PUT',
    handler: updateMyBuildHandler,
    access: 'self-service',
  },
  {
    resource: '/players/{playerId}/build',
    method: 'PUT',
    handler: updatePlayerBuildHandler,
    access: STAFF,
  },

  // Ledger (ECO-02)
  {
    resource: '/players/{playerId}/ledger/adjust',
    method: 'POST',
    handler: adjustBalanceHandler,
    access: ADMIN_ONLY,
  },

  // Own wallet history (ECO-13)
  {
    resource: '/players/me/ledger',
    method: 'GET',
    handler: getMyLedgerHandler,
    access: 'self-service',
  },

  // ECO-14: the GM fines view reads a player's ledger.
  {
    resource: '/players/{playerId}/ledger',
    method: 'GET',
    handler: getPlayerLedgerHandler,
    access: STAFF,
  },

  // Fines (ECO-07)
  {
    resource: '/players/{playerId}/fines',
    method: 'POST',
    handler: issueFineHandler,
    access: STAFF,
  },
  {
    resource: '/fines/{entryId}/rescind',
    method: 'POST',
    handler: rescindFineHandler,
    access: STAFF,
  },

];
export const handler = createRouter(routes);
