import { APIGatewayProxyHandler } from 'aws-lambda';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole, getAuthContext } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { changeUserRole, deleteUserAccount, setUserEnabled, type UserActionOutcome } from './userActions';

/**
 * Users per request. The page sends larger selections in chunks: the account's
 * Lambda concurrency is small, so one request works through its users in turn
 * rather than the browser firing one request per user.
 */
export const MAX_BULK_USERS = 50;

export const BULK_ACTIONS = ['enable', 'disable', 'addRole', 'removeRole', 'delete'] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

/** Admin is granted and removed one account at a time, from the Manage dialog. */
export const BULK_ROLES = ['Wrestler', 'Moderator'] as const;
export type BulkRole = (typeof BULK_ROLES)[number];

/** Actions that would lock the caller out or strip their own access. */
const SELF_GUARDED: ReadonlySet<BulkAction> = new Set(['disable', 'delete', 'removeRole']);

interface BulkUsersBody {
  action?: unknown;
  role?: unknown;
  usernames?: unknown;
}

export interface BulkUserResult {
  username: string;
  ok: boolean;
  code?: string;
  message?: string;
}

function isBulkAction(value: unknown): value is BulkAction {
  return typeof value === 'string' && (BULK_ACTIONS as readonly string[]).includes(value);
}

function isBulkRole(value: unknown): value is BulkRole {
  return typeof value === 'string' && (BULK_ROLES as readonly string[]).includes(value);
}

function runAction(action: BulkAction, username: string, role: BulkRole | undefined): Promise<UserActionOutcome> {
  switch (action) {
    case 'enable':
      return setUserEnabled(username, true);
    case 'disable':
      return setUserEnabled(username, false);
    case 'delete':
      return deleteUserAccount(username);
    case 'addRole':
      return changeUserRole(username, role!, 'promote');
    case 'removeRole':
      return changeUserRole(username, role!, 'demote');
  }
}

/**
 * POST /admin/users/bulk (Admin only)
 * Body: { action, usernames: string[], role? }
 *
 * Applies one action to up to MAX_BULK_USERS accounts with the same guards as
 * the single-user routes, and reports each account's result. One account
 * failing does not stop the rest. The caller's own account is never disabled,
 * deleted or stripped of a role here.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  const parsed = parseBody<BulkUsersBody>(event);
  if (parsed.error) return parsed.error;
  const { action, role, usernames } = parsed.data;

  if (!isBulkAction(action)) return badRequest(`action must be one of: ${BULK_ACTIONS.join(', ')}`);
  const needsRole = action === 'addRole' || action === 'removeRole';
  if (needsRole && !isBulkRole(role)) return badRequest(`role must be one of: ${BULK_ROLES.join(', ')}`);
  if (!Array.isArray(usernames) || usernames.length === 0 || !usernames.every((name) => typeof name === 'string' && name.trim())) {
    return badRequest('usernames must be a non-empty array of usernames');
  }
  const unique = [...new Set(usernames as string[])];
  if (unique.length > MAX_BULK_USERS) return badRequest(`At most ${MAX_BULK_USERS} users per request`);

  const caller = getAuthContext(event);
  const isCaller = (username: string) => username === caller.username || username === caller.sub;

  try {
    const results: BulkUserResult[] = [];
    for (const username of unique) {
      if (SELF_GUARDED.has(action) && isCaller(username)) {
        results.push({ username, ok: false, code: 'SELF', message: 'You cannot do this to your own account' });
        continue;
      }
      try {
        const outcome = await runAction(action, username, needsRole ? (role as BulkRole) : undefined);
        results.push(outcome.ok ? { username, ok: true } : { username, ok: false, code: outcome.code, message: outcome.message });
      } catch (err) {
        console.error(`Bulk ${action} failed for ${username}:`, err);
        results.push({ username, ok: false, code: 'ERROR', message: 'Something went wrong for this account' });
      }
    }

    const succeeded = results.filter((result) => result.ok).length;
    return success({ action, role: needsRole ? role : undefined, results, succeeded, failed: results.length - succeeded });
  } catch (error) {
    console.error('Bulk users error:', error);
    return serverError('Failed to apply the bulk action');
  }
};
