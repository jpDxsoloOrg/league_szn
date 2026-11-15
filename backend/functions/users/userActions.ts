import type { APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminRemoveUserFromGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { badRequest, refused } from '../../lib/response';
import { getRepositories } from '../../lib/repositories';
import { isDeactivated } from '../../lib/discipline';
import { findPlayerForCognitoUsername } from '../../lib/disciplineActions';
import { deleteRefusal } from '../../lib/disciplineGates';
import { NEEDS_WRESTLER, newPlayerName } from '../../lib/needsWrestler';

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

export const MANAGED_ROLES = ['Admin', 'Moderator', 'Wrestler'] as const;
export type ManagedRole = (typeof MANAGED_ROLES)[number];
export type RoleAction = 'promote' | 'demote';

/**
 * What one account action came to. A refusal carries the exact response the
 * single-user route has always sent, plus its code and message for the bulk
 * route's per-user results. Unexpected errors are thrown, not returned.
 */
export type UserActionOutcome =
  | { ok: true }
  | { ok: false; code: string; message: string; response: APIGatewayProxyResult };

function refusal(response: APIGatewayProxyResult, fallbackCode: string): UserActionOutcome {
  const { message, code } = JSON.parse(response.body) as { message?: string; code?: string };
  return { ok: false, code: code ?? fallbackCode, message: message ?? '', response };
}

const OK: UserActionOutcome = { ok: true };

export async function setUserEnabled(username: string, enabled: boolean): Promise<UserActionOutcome> {
  if (enabled) {
    // The Player row decides access, so a login cannot be turned back on
    // around it. A lookup error throws, with nothing enabled.
    const player = await findPlayerForCognitoUsername(username);
    if (player && isDeactivated(player)) {
      return refusal(
        refused(409, 'PLAYER_DEACTIVATED', 'This player is deactivated. Reactivate them from Manage Players.'),
        'PLAYER_DEACTIVATED',
      );
    }
    await cognitoClient.send(new AdminEnableUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
  } else {
    await cognitoClient.send(new AdminDisableUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
  }
  return OK;
}

export async function deleteUserAccount(username: string): Promise<UserActionOutcome> {
  // A lookup error throws, so nothing is deleted without this check.
  const player = await findPlayerForCognitoUsername(username);
  const disciplineRefusal = player && deleteRefusal(player);
  if (disciplineRefusal) return refusal(disciplineRefusal, 'DISCIPLINE_ACTIVE');

  const user = await cognitoClient.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
  if (user.Enabled) {
    return refusal(badRequest('User must be disabled before deletion. Disable the user first.'), 'USER_ENABLED');
  }

  await cognitoClient.send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
  return OK;
}

/**
 * Keeps the player's wrestler flag in step with the Wrestler group, creating
 * the player on a first promote. Best effort: a failure is logged and the role
 * change stands, as it always has.
 */
async function syncWrestlerPlayer(username: string, action: RoleAction): Promise<void> {
  try {
    const user = await cognitoClient.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
    const attrs = user.UserAttributes || [];
    const attr = (name: string) => attrs.find((a) => a.Name === name)?.Value;
    const sub = attr('sub');
    if (!sub) {
      console.error('User sub attribute missing for username:', username);
      return;
    }

    const { roster: { players } } = getRepositories();
    const existingPlayer = await players.findByUserId(sub);

    if (action === 'demote') {
      // Mirror the removal onto the player so the public roster filters drop them.
      if (existingPlayer) await players.update(existingPlayer.playerId, { hasWrestlerRole: false });
      return;
    }

    if (!existingPlayer) {
      const wrestlerName = attr('custom:wrestler_name') || '';
      const newPlayer = await players.create({
        name: newPlayerName(attr('custom:player_name'), wrestlerName, sub),
        currentWrestler: wrestlerName || NEEDS_WRESTLER,
        psnId: attr('custom:psn_id') || undefined,
      });
      await players.update(newPlayer.playerId, { userId: sub, hasWrestlerRole: true });
    } else if (existingPlayer.hasWrestlerRole !== true) {
      // Re-granting the role has to re-show a player hidden by an earlier demote.
      await players.update(existingPlayer.playerId, { hasWrestlerRole: true });
    }
  } catch (err) {
    console.error(`Failed to sync the player after ${action} of Wrestler for ${username}:`, err);
  }
}

/** Adds or removes one group. The caller checks who may manage which role. */
export async function changeUserRole(username: string, role: ManagedRole, action: RoleAction): Promise<UserActionOutcome> {
  const command = action === 'promote'
    ? new AdminAddUserToGroupCommand({ UserPoolId: USER_POOL_ID, Username: username, GroupName: role })
    : new AdminRemoveUserFromGroupCommand({ UserPoolId: USER_POOL_ID, Username: username, GroupName: role });
  await cognitoClient.send(command);
  if (role === 'Wrestler') await syncWrestlerPlayer(username, action);
  return OK;
}
