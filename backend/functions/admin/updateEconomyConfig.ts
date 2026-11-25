import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { ConflictError } from '../../lib/repositories/errors';
import { success, badRequest, conflict, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { deepMergeSettings, toEconomySettingsInput } from '../../lib/policies/economyDefaults';
import { validateEconomySettings } from '../../lib/policies/economySettingsValidation';

interface UpdateEconomyConfigBody {
  settings?: unknown;
  expectedVersion?: unknown;
}

/**
 * PUT /admin/economy-config
 *
 * Body: `{ settings, expectedVersion? }`. `settings` may be partial: nested
 * objects merge into the current settings, arrays (fine presets) replace
 * them. The merged result is validated as a whole and saved as the next
 * version. With `expectedVersion`, a save over a newer version is a 409.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const { data: body, error: parseError } = parseBody<UpdateEconomyConfigBody>(event);
    if (parseError) return parseError;
    const { settings, expectedVersion } = body;

    if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
      return badRequest('settings object is required');
    }
    if (
      expectedVersion !== undefined
      && (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 0)
    ) {
      return badRequest('expectedVersion must be a non-negative integer');
    }

    const { user: { siteConfig } } = getRepositories();
    const current = toEconomySettingsInput(await siteConfig.getEconomySettings());
    const validation = validateEconomySettings(deepMergeSettings(current, settings));
    if (!validation.ok) return badRequest(validation.error);

    const { username, email, sub } = getAuthContext(event);
    const updatedBy = username || email || sub || 'unknown';
    const saved = await siteConfig.saveEconomySettings(validation.settings, updatedBy, expectedVersion);
    return success({ settings: saved });
  } catch (error) {
    if (error instanceof ConflictError) return conflict(error.message);
    console.error('Update economy config error:', error);
    return serverError('Failed to update economy settings');
  }
};
