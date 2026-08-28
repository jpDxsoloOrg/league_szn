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
 * Concurrency for the per-user Cognito lookups and the per-player writes.
 * Sequential await blew the Lambda timeout on a production-sized pool; going
 * fully unbounded risks Cognito throttling, so fan out in fixed batches.
 */
const BATCH_SIZE = 10;

async function inBatches<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    results.push(...(await Promise.all(batch.map(worker))));
  }
  return results;
}

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

    const usersWithSub = allCognitoUsers
      .map((user) => ({
        username: user.Username!,
        sub: (user.Attributes || []).find((a) => a.Name === 'sub')?.Value,
      }))
      .filter((u): u is { username: string; sub: string } => Boolean(u.sub));

    // Every sub Cognito knows about, so a player linked to a user whose group
    // lookup failed can be told apart from one linked to a deleted account.
    const knownSubs = new Set(usersWithSub.map((u) => u.sub));

    // sub -> is in the Wrestler group. A sub missing from this map after the
    // sweep means its lookup failed.
    const wrestlerBySub = new Map<string, boolean>();
    await inBatches(usersWithSub, async ({ username, sub }) => {
      try {
        const groupsResult = await cognitoClient.send(
          new AdminListGroupsForUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: username,
          })
        );
        const groups = (groupsResult.Groups || []).map((g) => g.GroupName);
        wrestlerBySub.set(sub, groups.includes('Wrestler'));
      } catch (err) {
        // A group lookup failure must not demote a real wrestler, so leave
        // the sub unmapped and skip that player below.
        console.error(`Failed to read groups for ${username}:`, err);
      }
    });

    const { roster: { players } } = getRepositories();
    const allPlayers = await players.list();

    let skipped = 0;
    let unchanged = 0;
    const toWrite: Array<{ playerId: string; shouldBeWrestler: boolean }> = [];

    for (const player of allPlayers) {
      // Linked to a live account whose groups we could not read — leave the
      // existing flag alone rather than guessing.
      if (
        player.userId &&
        knownSubs.has(player.userId) &&
        !wrestlerBySub.has(player.userId)
      ) {
        skipped++;
        continue;
      }

      // No linked account, or a linked account without the group -> false.
      const shouldBeWrestler = player.userId
        ? wrestlerBySub.get(player.userId) === true
        : false;

      if (player.hasWrestlerRole === shouldBeWrestler) {
        unchanged++;
        continue;
      }

      toWrite.push({ playerId: player.playerId, shouldBeWrestler });
    }

    await inBatches(toWrite, ({ playerId, shouldBeWrestler }) =>
      players.update(playerId, { hasWrestlerRole: shouldBeWrestler })
    );

    const granted = toWrite.filter((w) => w.shouldBeWrestler).length;

    return success({
      message: 'Wrestler roles synced to players',
      totalPlayers: allPlayers.length,
      granted,
      revoked: toWrite.length - granted,
      unchanged,
      skipped,
    });
  } catch (error) {
    console.error('Sync wrestler roles error:', error);
    return serverError('Failed to sync wrestler roles');
  }
};
