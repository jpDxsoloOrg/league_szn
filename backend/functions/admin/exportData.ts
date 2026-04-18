import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { requireSuperAdmin } from '../../lib/auth';
import { serverError, success } from '../../lib/response';
import { EXPORT_SCHEMA_VERSION, type SeedImportPayload } from './dataTransferConfig';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireSuperAdmin(event);
  if (denied) return denied;

  try {
    const { exportAllData } = getRepositories();
    const exportData = await exportAllData();

    const counts: Record<string, number> = {};
    for (const [key, items] of Object.entries(exportData)) {
      counts[key] = items.length;
    }

    const payload: SeedImportPayload = {
      version: EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      stage: process.env.STAGE || 'unknown',
      data: exportData as SeedImportPayload['data'],
    };

    return success({ ...payload, counts });
  } catch (error) {
    console.error('Error exporting data:', error);
    return serverError('Failed to export data');
  }
};
