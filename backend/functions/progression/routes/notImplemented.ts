import type { APIGatewayProxyHandler } from 'aws-lambda';
import { error } from '../../../lib/response';

/**
 * Placeholder for a progression route whose ticket hasn't landed yet.
 * Each ticket replaces its placeholders with the real handler.
 */
export const notImplemented: APIGatewayProxyHandler = async () =>
  error(501, 'Not implemented yet');
