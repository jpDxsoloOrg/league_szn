import { APIGatewayProxyHandler } from 'aws-lambda';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { getRepositories } from '../../lib/repositories';
import type { Player } from '../../lib/repositories';
import { listAllUsers, listGroupsByUsername } from '../../lib/cognitoDirectory';

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

/**
 * Linked players by Cognito sub, read straight from the repository rather than
 * via public `GET /players`, which leaves out players with no real wrestler
 * name. Admins need to see (and slot) a Wrestler-role user whose player record
 * exists but has no wrestler assigned yet. A failure only loses the linkage.
 */
async function loadPlayersByUserId(): Promise<Map<string, Player>> {
  const playersByUserId = new Map<string, Player>();
  try {
    for (const player of await getRepositories().roster.players.list()) {
      if (player.userId) playersByUserId.set(player.userId, player);
    }
  } catch (err) {
    console.error('Failed to load players for user linkage:', err);
  }
  return playersByUserId;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const [allCognitoUsers, groupsByUsername, playersByUserId] = await Promise.all([
      listAllUsers(cognitoClient, USER_POOL_ID),
      listGroupsByUsername(cognitoClient, USER_POOL_ID),
      loadPlayersByUserId(),
    ]);

    const users = allCognitoUsers.map((user) => {
      const attrs: Record<string, string> = {};
      (user.Attributes || []).forEach((attr) => {
        if (attr.Name && attr.Value) {
          attrs[attr.Name] = attr.Value;
        }
      });

      const linkedPlayer = attrs['sub'] ? playersByUserId.get(attrs['sub']) : undefined;

      return {
        username: user.Username,
        sub: attrs['sub'] || '',
        email: attrs['email'] || '',
        name: attrs['name'] || '',
        wrestlerName: attrs['custom:wrestler_name'] || '',
        psnId: attrs['custom:psn_id'] || '',
        playerName: attrs['custom:player_name'] || '',
        status: user.UserStatus,
        enabled: user.Enabled,
        created: user.UserCreateDate?.toISOString(),
        groups: (user.Username && groupsByUsername.get(user.Username)) || [],
        player: linkedPlayer
          ? {
              playerId: linkedPlayer.playerId,
              divisionId: linkedPlayer.divisionId || '',
              currentWrestler: linkedPlayer.currentWrestler || '',
              currentWrestlerId: linkedPlayer.currentWrestlerId || '',
            }
          : null,
      };
    });

    return success({ users });
  } catch (error) {
    console.error('List users error:', error);
    return serverError('Failed to list users');
  }
};
