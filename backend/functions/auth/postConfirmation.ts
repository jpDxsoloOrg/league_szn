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

  // Auto-create a Player record from signup attributes. When the picked
  // wrestler matches a row in the curated roster (Wrestlers table), also
  // link the Player.currentWrestlerId FK and flip that wrestler to
  // isInUse=true inside the same UoW — best-effort, so a failure here
  // never blocks confirmation.
  try {
    const sub = attrs['sub'];
    const wrestlerName = attrs['custom:wrestler_name'] || '';
    const playerName = attrs['custom:player_name'] || '';
    const psnId = attrs['custom:psn_id'] || '';

    if (sub) {
      const { roster, runInTransaction } = getRepositories();
      const { players, wrestlers } = roster;
      const existingPlayer = await players.findByUserId(sub);

      if (!existingPlayer) {
        const newPlayer = await players.create({
          name: playerName,
          currentWrestler: wrestlerName,
          psnId: psnId || undefined,
        });

        let linked = false;
        if (wrestlerName.trim().length > 0) {
          const target = wrestlerName.trim().toLowerCase();
          const all = await wrestlers.list();
          const match = all.find(
            (w) => w.name.toLowerCase() === target && !w.isInUse,
          );
          if (match) {
            try {
              await runInTransaction(async (tx) => {
                tx.assignWrestlerToPlayer({
                  wrestlerId: match.wrestlerId,
                  playerId: newPlayer.playerId,
                  slot: 'primary',
                });
                tx.updatePlayer(newPlayer.playerId, {
                  userId: sub,
                  currentWrestlerId: match.wrestlerId,
                });
              });
              linked = true;
              console.log(
                `Player ${newPlayer.playerId} linked to wrestler ${match.wrestlerId} (${match.name})`,
              );
            } catch (linkErr) {
              // Transaction failed (e.g., concurrent claim) — fall through
              // to the unlinked branch so the userId still gets set.
              console.warn(
                `Failed to link wrestler for user ${username}:`,
                linkErr,
              );
            }
          }
        }

        if (!linked) {
          await players.update(newPlayer.playerId, { userId: sub });
        }
        console.log(`Player record created for user ${username}: ${newPlayer.playerId}`);
      }
    }
  } catch (error) {
    console.error(`Failed to create player record for ${username}:`, error);
    // Don't throw - we don't want to block account confirmation
  }

  return event;
};
