import { PostConfirmationTriggerHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { getRepositories } from '../../lib/repositories';

const cognitoClient = new CognitoIdentityProviderClient({});

/**
 * Post-Confirmation trigger: automatically adds new users to the "Wrestler" group
 * and creates a Player record from their signup attributes.
 * This runs after a user confirms their account (email verification).
 */
export const handler: PostConfirmationTriggerHandler = async (event) => {
  console.log('Post-confirmation trigger for user:', event.userName);

  const userPoolId = event.userPoolId;
  const username = event.userName;
  const attrs = event.request.userAttributes;

  // Add user to Wrestler group (default role)
  try {
    await cognitoClient.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: username,
        GroupName: 'Wrestler',
      })
    );
    console.log(`User ${username} added to Wrestler group`);
  } catch (error) {
    console.error(`Failed to add user ${username} to Wrestler group:`, error);
    // Don't throw - we don't want to block account confirmation
  }

  // Auto-create a Player record from signup attributes
  try {
    const sub = attrs['sub'];
    const wrestlerName = attrs['custom:wrestler_name'] || '';
    const playerName = attrs['custom:player_name'] || '';
    const psnId = attrs['custom:psn_id'] || '';

    if (sub) {
      const { roster: { players } } = getRepositories();
      const existingPlayer = await players.findByUserId(sub);

      if (!existingPlayer) {
        const newPlayer = await players.create({
          name: playerName,
          currentWrestler: wrestlerName,
          psnId: psnId || undefined,
        });
        await players.update(newPlayer.playerId, { userId: sub });
        console.log(`Player record created for user ${username}: ${newPlayer.playerId}`);
      }
    }
  } catch (error) {
    console.error(`Failed to create player record for ${username}:`, error);
    // Don't throw - we don't want to block account confirmation
  }

  return event;
};
