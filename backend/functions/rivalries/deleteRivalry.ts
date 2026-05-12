import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import type { RivalryMessage, RivalryNote } from '../../lib/repositories';

const MESSAGES_PAGE_SIZE = 200;

/**
 * DELETE /rivalry-requests/{rivalryId}.
 *
 * GM-only hard delete. Cascades RivalryMessages + RivalryNotes + the
 * META row + every PARTICIPANT row via the UnitOfWork, which chunks
 * writes into TransactWriteItems batches of ≤100 (see DynamoUnitOfWork).
 * The chunks are not globally atomic — a mid-cascade failure can leave
 * dangling rows, but the rivalry itself is gone after the first chunk
 * because the META + PARTICIPANT deletes are staged first.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const rivalryId = event.pathParameters?.rivalryId;
    if (!rivalryId) return badRequest('rivalryId is required');

    const {
      rivalries,
      rivalryMessages,
      rivalryNotes,
      runInTransaction,
    } = getRepositories();

    const rivalry = await rivalries.get(rivalryId);
    if (!rivalry) return notFound('Rivalry not found');

    // Paginate every message so the cascade also covers thread histories
    // that exceed a single Query page.
    const allMessages: RivalryMessage[] = [];
    let cursor: string | undefined;
    do {
      const page = await rivalryMessages.list(rivalryId, {
        limit: MESSAGES_PAGE_SIZE,
        cursor,
      });
      allMessages.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);

    const allNotes: RivalryNote[] = await rivalryNotes.listByRivalry(rivalryId);

    await runInTransaction(async (tx) => {
      tx.deleteRivalry(
        rivalryId,
        rivalry.participants.map((p) => p.playerId),
      );
      for (const m of allMessages) tx.deleteRivalryMessage(m);
      for (const n of allNotes) tx.deleteRivalryNote(n);
    });

    return noContent();
  } catch (err) {
    console.error('Error deleting rivalry:', err);
    return serverError('Failed to delete rivalry');
  }
};
