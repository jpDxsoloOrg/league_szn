import { handler as offerContractHandler } from './offerContract';
import { handler as acceptOfferHandler } from './acceptOffer';
import { handler as declineOfferHandler } from './declineOffer';
import { handler as withdrawOfferHandler } from './withdrawOffer';
import { handler as releaseContractHandler } from './releaseContract';
import { handler as listContractsHandler } from './listContracts';
import { handler as getMyContractsHandler } from './getMyContracts';
import { handler as getPlayerContractHandler } from './getPlayerContract';
import { handler as getFreeAgentsHandler } from './getFreeAgents';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

/**
 * Single Lambda for contracts (ECO-04). GMs (Moderator/Admin) offer, withdraw
 * and release; the player an offer was made to accepts or declines it (the
 * handlers check ownership, so those routes are self-service).
 */
export const routes: ReadonlyArray<RouteConfig> = [
  { resource: '/contracts', method: 'GET', handler: listContractsHandler, access: STAFF },
  { resource: '/contracts', method: 'POST', handler: offerContractHandler, access: STAFF },
  { resource: '/contracts/{contractId}/accept', method: 'POST', handler: acceptOfferHandler, access: 'self-service' },
  { resource: '/contracts/{contractId}/decline', method: 'POST', handler: declineOfferHandler, access: 'self-service' },
  { resource: '/contracts/{contractId}/withdraw', method: 'POST', handler: withdrawOfferHandler, access: STAFF },
  { resource: '/contracts/{contractId}/release', method: 'POST', handler: releaseContractHandler, access: STAFF },
  { resource: '/players/me/contracts', method: 'GET', handler: getMyContractsHandler, access: 'self-service' },
  { resource: '/players/{playerId}/contract', method: 'GET', handler: getPlayerContractHandler, access: 'public' },
  { resource: '/free-agents', method: 'GET', handler: getFreeAgentsHandler, access: 'public' },
];

export const handler = createRouter(routes);
