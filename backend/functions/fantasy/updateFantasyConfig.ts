import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const denied = requireRole(event, 'Admin');
    if (denied) return denied;

    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;

    const { fantasy } = getRepositories();
    const updatedConfig = await fantasy.upsertConfig(body as Record<string, unknown>);

    return success(updatedConfig);
  } catch (err) {
    console.error('Error updating fantasy config:', err);
    return serverError('Failed to update fantasy config');
  }
};
