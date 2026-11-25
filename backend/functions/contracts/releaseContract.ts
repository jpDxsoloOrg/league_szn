import { APIGatewayProxyHandler } from 'aws-lambda';
import { parseBody } from '../../lib/parseBody';
import { getRepositories, ConcurrencyError } from '../../lib/repositories';
import { badRequest, conflict, notFound, serverError, success } from '../../lib/response';
import { contractLabel, notifyPlayer, readNote } from './contractShared';

interface ReleaseBody {
  note?: unknown;
}

/**
 * POST /contracts/{contractId}/release `{ note }` (Moderator/Admin): end an
 * active contract now. One transaction moves it to `released` and clears the
 * player's `activeContractId`, so the player is a free agent again. The note
 * replaces the contract's `note` (the release reason is the one kept).
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const contractId = event.pathParameters?.contractId;
    if (!contractId) return notFound('Contract not found');

    const { data: body, error: parseError } = parseBody<ReleaseBody>(event);
    if (parseError) return parseError;
    const { note, error: noteError } = readNote(body.note, true);
    if (noteError) return badRequest(noteError);

    const repos = getRepositories();
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return notFound('Contract not found');
    if (contract.status !== 'active') {
      return conflict(`Only an active contract can be released; this one is ${contract.status}`);
    }

    try {
      await repos.runInTransaction(async (tx) => {
        tx.updateContract(contractId, {
          status: 'released',
          endedAt: new Date().toISOString(),
          endReason: 'released',
          note,
        }, 'active');
        tx.clearPlayerActiveContract(contract.playerId, contractId);
      });
    } catch (err) {
      if (err instanceof ConcurrencyError) return conflict('This contract changed while saving. Reload and try again.');
      throw err;
    }

    const player = await repos.roster.players.findById(contract.playerId);
    if (player) {
      await notifyPlayer(player, contract, 'contract_released', `You were released from your ${contractLabel(contract)}.`);
    }

    return success(await repos.contracts.findById(contractId));
  } catch (err) {
    console.error('Error releasing contract:', err);
    return serverError('Failed to release the contract');
  }
};
