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

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

/**
 * Backfill `Player.hasWrestlerRole` from Cognito group membership.
 *
 * The public roster filters read the denormalized flag rather than calling
 * Cognito, and the flag is only maintained going forward by postConfirmation
 * and updateUserRole. Existing players therefore start out unsynced
 * (`undefined`), which the filters treat as visible. Running this stamps
 * every player explicitly, which is what actually turns the filter on:
 *
 *   - linked user in the Wrestler group  -> true
 *   - linked user not in the group       -> false
 *   - no linked Cognito account at all   -> false
 *
 * Safe to re-run; only players whose flag actually changes are written.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
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

    // sub -> is in the Wrestler group
    const wrestlerBySub = new Map<string, boolean>();
    for (const user of allCognitoUsers) {
      const sub = (user.Attributes || []).find((a) => a.Name === 'sub')?.Value;
      if (!sub) continue;
      try {
        const groupsResult = await cognitoClient.send(
          new AdminListGroupsForUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: user.Username!,
          })
        );
        const groups = (groupsResult.Groups || []).map((g) => g.GroupName);
        wrestlerBySub.set(sub, groups.includes('Wrestler'));
      } catch (err) {
        // A group lookup failure must not demote a real wrestler, so skip the
        // user entirely and leave their existing flag alone.
        console.error(`Failed to read groups for ${user.Username}:`, err);
      }
    }

    const { roster: { players } } = getRepositories();
    const allPlayers = await players.list();

    let granted = 0;
    let revoked = 0;
    let unchanged = 0;
    let skipped = 0;

    for (const player of allPlayers) {
      // Linked to a user whose groups we could not read — leave as-is rather
      // than guessing.
      if (player.userId && !wrestlerBySub.has(player.userId)) {
        const known = allCognitoUsers.some((u) =>
          (u.Attributes || []).some(
            (a) => a.Name === 'sub' && a.Value === player.userId
          )
        );
        if (known) {
          skipped++;
          continue;
        }
      }

      // No linked account, or a linked account without the group -> false.
      const shouldBeWrestler = player.userId
        ? wrestlerBySub.get(player.userId) === true
        : false;

      if (player.hasWrestlerRole === shouldBeWrestler) {
        unchanged++;
        continue;
      }

      await players.update(player.playerId, { hasWrestlerRole: shouldBeWrestler });
      if (shouldBeWrestler) {
        granted++;
      } else {
        revoked++;
      }
    }

    return success({
      message: 'Wrestler roles synced to players',
      totalPlayers: allPlayers.length,
      granted,
      revoked,
      unchanged,
      skipped,
    });
  } catch (error) {
    console.error('Sync wrestler roles error:', error);
    return serverError('Failed to sync wrestler roles');
  }
};
