import {
  CognitoIdentityProviderClient,
  ListGroupsCommand,
  ListUsersCommand,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { UserType } from '@aws-sdk/client-cognito-identity-provider';

/** Cognito's maximum page size for ListUsers and ListUsersInGroup. */
const PAGE_SIZE = 60;

/** Every user in the pool, following pagination. Throws on a Cognito error. */
export async function listAllUsers(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
): Promise<UserType[]> {
  const users: UserType[] = [];
  let paginationToken: string | undefined;
  do {
    const result = await client.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        Limit: PAGE_SIZE,
        ...(paginationToken ? { PaginationToken: paginationToken } : {}),
      }),
    );
    users.push(...(result.Users ?? []));
    paginationToken = result.PaginationToken;
  } while (paginationToken);
  return users;
}

async function listGroupNames(client: CognitoIdentityProviderClient, userPoolId: string): Promise<string[]> {
  const names: string[] = [];
  let nextToken: string | undefined;
  do {
    const result = await client.send(
      new ListGroupsCommand({ UserPoolId: userPoolId, ...(nextToken ? { NextToken: nextToken } : {}) }),
    );
    for (const group of result.Groups ?? []) {
      if (group.GroupName) names.push(group.GroupName);
    }
    nextToken = result.NextToken;
  } while (nextToken);
  return names;
}

/**
 * Username -> the groups that user belongs to, built from each group's member
 * list. That is a few paged calls per group instead of one
 * AdminListGroupsForUser call per user, which Cognito throttles once the pool
 * has hundreds of users. A user in no group is absent from the map.
 * Throws on a Cognito error, so callers never act on a partial picture.
 */
export async function listGroupsByUsername(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
): Promise<Map<string, string[]>> {
  const groupsByUsername = new Map<string, string[]>();
  for (const groupName of await listGroupNames(client, userPoolId)) {
    let nextToken: string | undefined;
    do {
      const result = await client.send(
        new ListUsersInGroupCommand({
          UserPoolId: userPoolId,
          GroupName: groupName,
          Limit: PAGE_SIZE,
          ...(nextToken ? { NextToken: nextToken } : {}),
        }),
      );
      for (const user of result.Users ?? []) {
        if (!user.Username) continue;
        const groups = groupsByUsername.get(user.Username);
        if (groups) groups.push(groupName);
        else groupsByUsername.set(user.Username, [groupName]);
      }
      nextToken = result.NextToken;
    } while (nextToken);
  }
  return groupsByUsername;
}
