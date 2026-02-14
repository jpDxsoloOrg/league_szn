export const MATCH_TYPES = ['Singles', 'Tag Team', 'Triple Threat', 'Fatal 4-Way', 'Six Pack Challenge', 'Battle Royal'];

export function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}
