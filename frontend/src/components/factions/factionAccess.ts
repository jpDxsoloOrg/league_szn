import type { StableDetailResponse } from '../../types/stable';

type FactionPeople = Pick<StableDetailResponse, 'leaderId' | 'memberIds'>;

/** Faction chat is members only: the direct message routes refuse anyone else, staff included. */
export function canReadFactionMessages(playerId: string | null, faction: FactionPeople): boolean {
  return playerId !== null && faction.memberIds.includes(playerId);
}

export function canManageFaction(playerId: string | null, isStaff: boolean, faction: FactionPeople): boolean {
  return isStaff || (playerId !== null && playerId === faction.leaderId);
}
