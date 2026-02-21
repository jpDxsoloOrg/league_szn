import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb } from '../../lib/dynamodb';
import { requireSuperAdmin } from '../../lib/auth';
import { serverError, success } from '../../lib/response';
import {
  EXPORT_SCHEMA_VERSION,
  EXPORT_TABLES,
  type ExportData,
  type ExportDatasetKey,
  type SeedImportPayload,
} from './dataTransferConfig';

function createEmptyExportData(): ExportData {
  const emptyData: Partial<Record<ExportDatasetKey, Record<string, unknown>[]>> = {};
  for (const table of EXPORT_TABLES) {
    emptyData[table.key] = [];
  }
  return emptyData as ExportData;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireSuperAdmin(event);
  if (denied) {
    return denied;
  }

  try {
    const exportData = createEmptyExportData();
    const counts: Partial<Record<ExportDatasetKey, number>> = {};

    for (const table of EXPORT_TABLES) {
      const items = await dynamoDb.scanAll({
        TableName: table.tableName,
      });
      exportData[table.key] = items;
      counts[table.key] = items.length;
    }

    const payload: SeedImportPayload = {
      version: EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      stage: process.env.STAGE || 'unknown',
      data: exportData,
    };

    return success({
      ...payload,
      counts,
    });
  } catch (error) {
    console.error('Error exporting data:', error);
    return serverError('Failed to export data');
  }
};
