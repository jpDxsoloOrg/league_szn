/**
 * Shared predicate for "should this player appear on roster-facing screens".
 *
 * `Player.hasWrestlerRole` mirrors Cognito group membership (see the field
 * docs on the Player type). The tri-state matters here: an unsynced player
 * (`undefined`) stays visible so that shipping this filter cannot blank the
 * standings before an admin has run the sync-roles backfill. Only an explicit
 * `false` hides someone.
 */
export function hasWrestlerRole(player: { hasWrestlerRole?: boolean }): boolean {
  return player.hasWrestlerRole !== false;
}
