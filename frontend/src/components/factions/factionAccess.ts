import type { StableDetailResponse } from '../../types/stable';

type FactionPeople = Pick<StableDetailResponse, 'leaderId' | 'memberIds'>;

/** Faction chat is members only: the direct message routes refuse anyone else, staff included. */
export function canReadFactionMessages(playerId: string | null, faction: FactionPeople): boolean {
  return playerId !== null && faction.memberIds.includes(playerId);
}

export function isFactionLeader(playerId: string | null, faction: Pick<FactionPeople, 'leaderId'>): boolean {
  return playerId !== null && playerId === faction.leaderId;
}

/** Faction writes accept the leader or a full Admin. A Moderator is refused unless they lead it. */
export function canManageFaction(playerId: string | null, isSuperAdmin: boolean, faction: FactionPeople): boolean {
  return isSuperAdmin || isFactionLeader(playerId, faction);
}
