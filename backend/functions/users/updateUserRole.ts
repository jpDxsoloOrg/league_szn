import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminListGroupsForUserCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { v4 as uuidv4 } from 'uuid';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { dynamoDb, TableNames } from '../../lib/dynamodb';

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

const VALID_ROLES = ['Admin', 'Wrestler', 'Fantasy'] as const;

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }

    const { username, role, action } = JSON.parse(event.body) as {
      username: string;
      role: string;
      action: 'promote' | 'demote';
    };

    if (!username || !role || !action) {
      return badRequest('username, role, and action are required');
    }

    if (!VALID_ROLES.includes(role as typeof VALID_ROLES[number])) {
      return badRequest(`Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`);
    }

    if (action !== 'promote' && action !== 'demote') {
      return badRequest('action must be "promote" or "demote"');
    }

    if (action === 'promote') {
      await cognitoClient.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
          GroupName: role,
        })
      );

      // If promoting to Wrestler, also ensure they're in Fantasy
      if (role === 'Wrestler') {
        try {
          await cognitoClient.send(
            new AdminAddUserToGroupCommand({
              UserPoolId: USER_POOL_ID,
              Username: username,
              GroupName: 'Fantasy',
            })
          );
        } catch {
          // May already be in Fantasy group
        }

        // Auto-create a Player record for this Wrestler if one doesn't exist
        try {
          const userResult = await cognitoClient.send(
            new AdminGetUserCommand({
              UserPoolId: USER_POOL_ID,
              Username: username,
            })
          );

          const attrs = userResult.UserAttributes || [];
          const sub = attrs.find((a) => a.Name === 'sub')?.Value;
          const wrestlerName = attrs.find((a) => a.Name === 'custom:wrestler_name')?.Value || '';

          if (!sub) {
            console.error('User sub attribute missing for username:', username);
            throw new Error('User sub attribute missing');
          }

          // Check if a player already exists for this userId
          const existingPlayer = await dynamoDb.query({
            TableName: TableNames.PLAYERS,
            IndexName: 'UserIdIndex',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
              ':userId': sub,
            },
          });

          if (!existingPlayer.Items || existingPlayer.Items.length === 0) {
            const timestamp = new Date().toISOString();
            await dynamoDb.put({
              TableName: TableNames.PLAYERS,
              Item: {
                playerId: uuidv4(),
                userId: sub,
                name: '',
                currentWrestler: wrestlerName || '',
                wins: 0,
                losses: 0,
                draws: 0,
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            });
          }
        } catch (playerError) {
          console.error('Failed to auto-create player for wrestler:', playerError);
          // Non-blocking: don't fail the role change
        }
      }
    } else {
      await cognitoClient.send(
        new AdminRemoveUserFromGroupCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
          GroupName: role,
        })
      );
    }

    // Return updated groups
    const groupsResult = await cognitoClient.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
      })
    );
    const groups = (groupsResult.Groups || []).map((g) => g.GroupName!);

    return success({
      message: `User ${username} ${action === 'promote' ? 'added to' : 'removed from'} ${role} group`,
      username,
      groups,
    });
  } catch (error) {
    console.error('Update user role error:', error);
    return serverError('Failed to update user role');
  }
};
