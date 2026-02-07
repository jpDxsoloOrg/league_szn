import { PostConfirmationTriggerHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({});

/**
 * Post-Confirmation trigger: automatically adds new users to the "Fantasy" group.
 * This runs after a user confirms their account (email verification).
 */
export const handler: PostConfirmationTriggerHandler = async (event) => {
  console.log('Post-confirmation trigger for user:', event.userName);

  const userPoolId = event.userPoolId;
  const username = event.userName;

  try {
    await cognitoClient.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: username,
        GroupName: 'Fantasy',
      })
    );
    console.log(`User ${username} added to Fantasy group`);
  } catch (error) {
    console.error(`Failed to add user ${username} to Fantasy group:`, error);
    // Don't throw - we don't want to block account confirmation
  }

  return event;
};
