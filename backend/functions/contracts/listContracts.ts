import { APIGatewayProxyHandler } from 'aws-lambda';
import { CONTRACT_STATUSES, CONTRACT_TYPES } from '../../lib/policies/contracts';
import { getRepositories, type ContractStatus, type ContractType } from '../../lib/repositories';
import { badRequest, serverError, success } from '../../lib/response';

/**
 * GET /contracts?status=&playerId=&type= (Moderator/Admin): contracts and
 * offers with their money, newest first. Every filter is optional.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { status, playerId, type } = event.queryStringParameters ?? {};
    if (status !== undefined && !(CONTRACT_STATUSES as readonly string[]).includes(status)) {
      return badRequest(`status must be one of ${CONTRACT_STATUSES.join(', ')}`);
    }
    if (type !== undefined && !(CONTRACT_TYPES as readonly string[]).includes(type)) {
      return badRequest(`type must be one of ${CONTRACT_TYPES.join(', ')}`);
    }
    const statusFilter = status as ContractStatus | undefined;
    const typeFilter = type as ContractType | undefined;

    const { contracts } = getRepositories();
    if (playerId) {
      const forPlayer = await contracts.listByPlayer(playerId);
      return success(forPlayer.filter((contract) =>
        (statusFilter === undefined || contract.status === statusFilter)
        && (typeFilter === undefined || contract.type === typeFilter)));
    }
    return success(await contracts.list({ status: statusFilter, type: typeFilter }));
  } catch (err) {
    console.error('Error listing contracts:', err);
    return serverError('Failed to list contracts');
  }
};
