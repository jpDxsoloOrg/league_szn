import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';

/** Cognito groups that count as GMs (Moderator and above). */
export const STAFF_GROUP_NAMES: readonly string[] = ['Admin', 'Moderator'];

const cognitoClient = new CognitoIdentityProviderClient({});

const userIdOf = (user: UserType): string | undefined =>
  user.Attributes?.find((attr) => attr.Name === 'sub')?.Value ?? user.Username;

/**
 * Cognito ids (`sub`, the id notifications are keyed by) of every enabled
 * Admin and Moderator, deduplicated. Never throws: on a Cognito error it logs
 * and returns what it has, so a notification fan-out cannot break its caller.
 */
export async function listStaffUserIds(): Promise<string[]> {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) {
    console.warn('COGNITO_USER_POOL_ID is not set; no staff users to notify');
    return [];
  }
  const ids = new Set<string>();
  for (const groupName of STAFF_GROUP_NAMES) {
    try {
      let nextToken: string | undefined;
      do {
        const result = await cognitoClient.send(
          new ListUsersInGroupCommand({
            UserPoolId: userPoolId,
            GroupName: groupName,
            Limit: 60,
            ...(nextToken ? { NextToken: nextToken } : {}),
          }),
        );
        for (const user of result.Users ?? []) {
          const userId = userIdOf(user);
          if (userId && user.Enabled !== false) ids.add(userId);
        }
        nextToken = result.NextToken;
      } while (nextToken);
    } catch (err: unknown) {
      console.error(`Failed to list ${groupName} users:`, err);
    }
  }
  return [...ids];
}
