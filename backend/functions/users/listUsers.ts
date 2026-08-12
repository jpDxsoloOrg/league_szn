import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminListGroupsForUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { UserType } from '@aws-sdk/client-cognito-identity-provider';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { getRepositories } from '../../lib/repositories';
import type { Player } from '../../lib/repositories';

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    // Linked players are read straight from the repository rather than via
    // `GET /players`, which drops any player without a `currentWrestler`.
    // Admins need to see (and slot) a Wrestler-role user whose player record
    // exists but has no wrestler assigned yet.
    const playersByUserId = new Map<string, Player>();
    try {
      const allPlayers = await getRepositories().roster.players.list();
      for (const player of allPlayers) {
        if (player.userId) {
          playersByUserId.set(player.userId, player);
        }
      }
    } catch (err) {
      console.error('Failed to load players for user linkage:', err);
    }

    const allCognitoUsers: UserType[] = [];
    let paginationToken: string | undefined;

    do {
      const result = await cognitoClient.send(
        new ListUsersCommand({
          UserPoolId: USER_POOL_ID,
          Limit: 60,
          ...(paginationToken ? { PaginationToken: paginationToken } : {}),
        })
      );
      allCognitoUsers.push(...(result.Users || []));
      paginationToken = result.PaginationToken;
    } while (paginationToken);

    const users = await Promise.all(
      allCognitoUsers.map(async (user) => {
        const attrs: Record<string, string> = {};
        (user.Attributes || []).forEach((attr) => {
          if (attr.Name && attr.Value) {
            attrs[attr.Name] = attr.Value;
          }
        });

        // Get groups for this user
        let groups: string[] = [];
        try {
          const groupsResult = await cognitoClient.send(
            new AdminListGroupsForUserCommand({
              UserPoolId: USER_POOL_ID,
              Username: user.Username!,
            })
          );
          groups = (groupsResult.Groups || []).map((g) => g.GroupName!);
        } catch (err) {
          console.error(`Failed to get groups for ${user.Username}:`, err);
        }

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
          groups,
          player: linkedPlayer
            ? {
                playerId: linkedPlayer.playerId,
                divisionId: linkedPlayer.divisionId || '',
                currentWrestler: linkedPlayer.currentWrestler || '',
                currentWrestlerId: linkedPlayer.currentWrestlerId || '',
              }
            : null,
        };
      })
    );

    return success({ users });
  } catch (error) {
    console.error('List users error:', error);
    return serverError('Failed to list users');
  }
};
