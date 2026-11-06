import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { forbidden, success, serverError } from '../../lib/response';
import { requireSuperAdmin } from '../../lib/auth';
import { BULK_DATA_BLOCKED_MESSAGE, isBulkDataOperationAllowed } from './dataTransferConfig';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireSuperAdmin(event);
  if (denied) return denied;

  if (!isBulkDataOperationAllowed()) {
    return forbidden(BULK_DATA_BLOCKED_MESSAGE);
  }

  try {
    const { clearAllData } = getRepositories();
    const results = await clearAllData();

    let totalErrors = 0;
    const deletedCounts: Record<string, number> = {};
    const errorCounts: Record<string, number> = {};

    for (const [key, { deleted, errors }] of Object.entries(results)) {
      deletedCounts[key] = deleted;
      if (errors > 0) {
        errorCounts[key] = errors;
        totalErrors += errors;
      }
    }

    const response: Record<string, unknown> = {
      message: totalErrors > 0
        ? `Data cleared with ${totalErrors} individual delete error(s)`
        : 'All data cleared successfully',
      deletedCounts,
    };
    if (totalErrors > 0) {
      response.errorCounts = errorCounts;
    }
    return success(response);
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('Error clearing all data:', detail, stack);
    return serverError('Failed to clear all data');
  }
};
