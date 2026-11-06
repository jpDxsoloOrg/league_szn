import type { APIGatewayProxyEvent } from 'aws-lambda';
import { getVerifiedCaller, isStaff } from '../../lib/optionalCaller';

interface TagTeamMembers {
  player1Id: string;
  player2Id: string;
}

/** True when either member of the team is in `hiddenIds`. */
export function hasHiddenMember(team: TagTeamMembers, hiddenIds: ReadonlySet<string>): boolean {
  return hiddenIds.has(team.player1Id) || hiddenIds.has(team.player2Id);
}

/**
 * Who may still see teams with a hidden member. A team like that cannot be
 * challenged, so it stays off public pages, but staff manage it and its own
 * members need it to accept invites and follow their team.
 */
export async function resolveTagTeamViewer(
  event: APIGatewayProxyEvent,
  findPlayerByUserId: (userId: string) => Promise<{ playerId: string } | null>,
): Promise<{ canSeeAll: boolean; callerPlayerId?: string }> {
  const caller = await getVerifiedCaller(event);
  if (isStaff(caller)) return { canSeeAll: true };
  if (!caller?.sub) return { canSeeAll: false };
  const callerPlayer = await findPlayerByUserId(caller.sub).catch(() => null);
  return { canSeeAll: false, callerPlayerId: callerPlayer?.playerId };
}
