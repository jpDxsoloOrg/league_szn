import { APIGatewayProxyHandler } from 'aws-lambda';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { getRepositories } from '../../lib/repositories';
import { listAllUsers, listGroupsByUsername } from '../../lib/cognitoDirectory';

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
 * Group membership comes from each group's member list, and a Cognito error
 * fails the whole run before any write, so nobody is demoted on a partial read.
 * Safe to re-run; only players whose flag actually changes are written.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const [allCognitoUsers, groupsByUsername] = await Promise.all([
      listAllUsers(cognitoClient, USER_POOL_ID),
      listGroupsByUsername(cognitoClient, USER_POOL_ID),
    ]);

    // sub -> is in the Wrestler group
    const wrestlerBySub = new Map<string, boolean>();
    for (const user of allCognitoUsers) {
      const sub = (user.Attributes || []).find((a) => a.Name === 'sub')?.Value;
      if (!sub || !user.Username) continue;
      wrestlerBySub.set(sub, (groupsByUsername.get(user.Username) ?? []).includes('Wrestler'));
    }

    const { roster: { players } } = getRepositories();
    const allPlayers = await players.list();

    let granted = 0;
    let revoked = 0;
    let unchanged = 0;

    for (const player of allPlayers) {
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
    });
  } catch (error) {
    console.error('Sync wrestler roles error:', error);
    return serverError('Failed to sync wrestler roles');
  }
};
