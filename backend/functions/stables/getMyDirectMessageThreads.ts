import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, forbidden, notFound, unauthorized, serverError } from '../../lib/response';
import { getAuthContext } from '../../lib/auth';
import type { FactionDirectMessage } from '../../lib/repositories/factionMessages';

interface ThreadRow {
  partnerPlayerId: string;
  partnerPlayerName: string | null;
  partnerWrestlerName: string | null;
  partnerImageUrl: string | null;
  lastMessage: FactionDirectMessage;
  lastMessageAt: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!auth.sub) {
      return unauthorized('Authentication required');
    }

    const factionId = event.pathParameters?.stableId;
    if (!factionId) {
      return badRequest('stableId is required');
    }

    const {
      roster: { stables: stablesRepo, players: playersRepo },
      factionDirectMessages: factionDirectMessagesRepo,
    } = getRepositories();

    const faction = await stablesRepo.findById(factionId);
    if (!faction) {
      return notFound('Faction not found');
    }

    const callerPlayer = await playersRepo.findByUserId(auth.sub);
    const callerPlayerId = callerPlayer?.playerId;
    const memberIds = faction.memberIds ?? [];
    const isMember = callerPlayerId ? memberIds.includes(callerPlayerId) : false;

    if (!isMember || !callerPlayerId) {
      return forbidden('Only faction members can list direct message threads');
    }

    const summaries = await factionDirectMessagesRepo.listThreadsForPlayer(
      factionId,
      callerPlayerId,
    );

    const items: ThreadRow[] = await Promise.all(
      summaries.map(async (s) => {
        const partner = await playersRepo.findById(s.partnerPlayerId);
        return {
          partnerPlayerId: s.partnerPlayerId,
          partnerPlayerName: partner?.name ?? null,
          partnerWrestlerName: partner?.currentWrestler ?? null,
          partnerImageUrl: partner?.imageUrl ?? null,
          lastMessage: s.lastMessage,
          lastMessageAt: s.lastMessage.createdAt,
        };
      }),
    );

    return success({ items });
  } catch (err) {
    console.error('Error listing faction direct message threads:', err);
    return serverError('Failed to list direct message threads');
  }
};
