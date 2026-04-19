import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { requireRole } from '../../lib/auth';

const MAX_BULK_DELETE = 100;

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const { data: body, error: parseError } = parseBody<{ isHidden?: boolean }>(event);
    if (parseError) return parseError;

    const isHidden = body?.isHidden;
    if (typeof isHidden !== 'boolean') {
      return badRequest('isHidden boolean is required (e.g. { "isHidden": true } to delete hidden promos)');
    }

    const { content: { promos } } = getRepositories();

    const allPromos = await promos.list();
    const toDelete = allPromos.filter((p) => p.isHidden === isHidden).slice(0, MAX_BULK_DELETE);
    let deleted = 0;

    for (const p of toDelete) {
      if (!p.promoId) continue;
      await promos.delete(p.promoId);
      deleted += 1;
    }

    return success({
      deleted,
      message: deleted >= MAX_BULK_DELETE ? `Deleted ${deleted} promos (max limit reached). More may exist.` : `Deleted ${deleted} promos.`,
    });
  } catch (err) {
    console.error('Error bulk deleting promos:', err);
    return serverError('Failed to bulk delete promos');
  }
};
