export const MATCH_TYPES = ['Singles', 'Tag Team', 'Triple Threat', 'Fatal 4-Way', 'Six Pack Challenge', 'Battle Royal'];
export const STIPULATIONS = ['None', 'Steel Cage', 'Ladder', 'Hell in a Cell', 'Last Man Standing', 'Iron Man', 'Tables'];

export function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}
