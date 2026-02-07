/**
 * Migration script: Add all existing Cognito users to the Admin group.
 * Run this once after deploying the Cognito Groups.
 *
 * Usage: npx ts-node scripts/migrate-users-to-admin.ts
 *
 * Required env vars:
 *   COGNITO_USER_POOL_ID - The User Pool ID
 *   AWS_REGION (optional, defaults to us-east-1)
 */

import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const REGION = process.env.AWS_REGION || 'us-east-1';

if (!USER_POOL_ID) {
  console.error('COGNITO_USER_POOL_ID environment variable is required');
  process.exit(1);
}

const client = new CognitoIdentityProviderClient({ region: REGION });

async function migrateUsers() {
  console.log(`Migrating existing users to Admin group in pool: ${USER_POOL_ID}`);

  let paginationToken: string | undefined;
  let totalMigrated = 0;

  do {
    const result = await client.send(
      new ListUsersCommand({
        UserPoolId: USER_POOL_ID!,
        Limit: 60,
        PaginationToken: paginationToken,
      })
    );

    for (const user of result.Users || []) {
      const username = user.Username!;
      try {
        await client.send(
          new AdminAddUserToGroupCommand({
            UserPoolId: USER_POOL_ID!,
            Username: username,
            GroupName: 'Admin',
          })
        );
        console.log(`  Added ${username} to Admin group`);
        totalMigrated++;
      } catch (error) {
        console.error(`  Failed to add ${username} to Admin group:`, error);
      }
    }

    paginationToken = result.PaginationToken;
  } while (paginationToken);

  console.log(`\nMigration complete. ${totalMigrated} users added to Admin group.`);
}

migrateUsers().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
