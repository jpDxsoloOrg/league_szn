/**
 * One-time script to send notifications for existing pending stable/tag team invites.
 *
 * Usage:
 *   IS_OFFLINE=true STAGE=offline ts-node scripts/notify-pending-invites.ts
 *
 * Or via npm:
 *   npm run notify-pending-invites
 */

const STAGE = process.env.STAGE || 'offline';
const SERVICE = 'wwe-2k-league-api';

// Set env vars before importing lib modules that read them at import time
process.env.IS_OFFLINE = process.env.IS_OFFLINE ?? 'true';
process.env.PLAYERS_TABLE = `${SERVICE}-players-${STAGE}`;
process.env.STABLE_INVITATIONS_TABLE = `${SERVICE}-stable-invitations-${STAGE}`;
process.env.TAG_TEAMS_TABLE = `${SERVICE}-tag-teams-${STAGE}`;
process.env.STABLES_TABLE = `${SERVICE}-stables-${STAGE}`;
process.env.NOTIFICATIONS_TABLE = `${SERVICE}-notifications-${STAGE}`;

// Provide dummy values for all other required TableNames so the import doesn't crash
const otherTables = [
  'MATCHES_TABLE', 'CHAMPIONSHIPS_TABLE', 'CHAMPIONSHIP_HISTORY_TABLE',
  'TOURNAMENTS_TABLE', 'SEASONS_TABLE', 'SEASON_STANDINGS_TABLE',
  'DIVISIONS_TABLE', 'EVENTS_TABLE', 'CONTENDER_RANKINGS_TABLE',
  'RANKING_HISTORY_TABLE', 'CONTENDER_OVERRIDES_TABLE', 'FANTASY_CONFIG_TABLE',
  'WRESTLER_COSTS_TABLE', 'FANTASY_PICKS_TABLE', 'SITE_CONFIG_TABLE',
  'CHALLENGES_TABLE', 'PROMOS_TABLE', 'STIPULATIONS_TABLE', 'MATCH_TYPES_TABLE',
  'SEASON_AWARDS_TABLE', 'COMPANIES_TABLE', 'SHOWS_TABLE', 'ANNOUNCEMENTS_TABLE',
];
for (const t of otherTables) {
  process.env[t] = process.env[t] ?? `${SERVICE}-unused-${STAGE}`;
}

import { dynamoDb, TableNames } from '../lib/dynamodb';
import { createNotification } from '../lib/notifications';

interface StableInvitation {
  invitationId: string;
  playerId: string;
  status: string;
}

interface TagTeam {
  tagTeamId: string;
  name: string;
  player2Id: string;
  status: string;
}

interface Player {
  playerId: string;
  userId?: string;
  name: string;
}

async function main(): Promise<void> {
  console.log(`Scanning for pending invites (stage: ${STAGE})...\n`);

  // 1. Scan pending stable invitations
  const stableResult = await dynamoDb.scanAll({
    TableName: TableNames.STABLE_INVITATIONS,
    FilterExpression: '#s = :pending',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':pending': 'pending' },
  });
  const pendingInvites = stableResult as unknown as StableInvitation[];
  console.log(`Found ${pendingInvites.length} pending stable invitation(s)`);

  // 2. Scan pending_partner tag teams
  const tagTeamResult = await dynamoDb.scanAll({
    TableName: TableNames.TAG_TEAMS,
    FilterExpression: '#s = :status',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':status': 'pending_partner' },
  });
  const pendingTagTeams = tagTeamResult as unknown as TagTeam[];
  console.log(`Found ${pendingTagTeams.length} pending tag team(s)\n`);

  let notificationCount = 0;

  // 3. Notify for each pending stable invitation
  for (const invite of pendingInvites) {
    const playerResult = await dynamoDb.get({
      TableName: TableNames.PLAYERS,
      Key: { playerId: invite.playerId },
    });
    const player = playerResult.Item as Player | undefined;

    if (!player) {
      console.log(`  [SKIP] Stable invite ${invite.invitationId}: player ${invite.playerId} not found`);
      continue;
    }
    if (!player.userId) {
      console.log(`  [SKIP] Stable invite ${invite.invitationId}: player "${player.name}" has no userId`);
      continue;
    }

    await createNotification({
      userId: player.userId,
      type: 'stable_invitation',
      message: 'You have a pending invitation to join a stable',
      sourceId: invite.invitationId,
      sourceType: 'stable',
    });
    notificationCount++;
    console.log(`  [SENT] Stable invite notification to "${player.name}" (${player.userId})`);
  }

  // 4. Notify for each pending tag team
  for (const tagTeam of pendingTagTeams) {
    const playerResult = await dynamoDb.get({
      TableName: TableNames.PLAYERS,
      Key: { playerId: tagTeam.player2Id },
    });
    const player = playerResult.Item as Player | undefined;

    if (!player) {
      console.log(`  [SKIP] Tag team "${tagTeam.name}" (${tagTeam.tagTeamId}): player2 ${tagTeam.player2Id} not found`);
      continue;
    }
    if (!player.userId) {
      console.log(`  [SKIP] Tag team "${tagTeam.name}" (${tagTeam.tagTeamId}): player "${player.name}" has no userId`);
      continue;
    }

    await createNotification({
      userId: player.userId,
      type: 'tag_team_invitation',
      message: `You have a pending tag team invitation: ${tagTeam.name}`,
      sourceId: tagTeam.tagTeamId,
      sourceType: 'tag_team',
    });
    notificationCount++;
    console.log(`  [SENT] Tag team invite notification to "${player.name}" (${player.userId})`);
  }

  console.log(`\nDone. Sent ${notificationCount} notification(s).`);
}

main().catch((error: unknown) => {
  console.error('Script failed:', error);
  process.exit(1);
});
