/**
 * How a player picks their wrestler on their own profile.
 *
 * - `'text'`   — free-text fields writing `currentWrestler` /
 *                `alternateWrestler` directly. What the league runs on today.
 * - `'roster'` — the FK-backed dropdowns that pick a row from the wrestlers
 *                roster (`currentWrestlerId` / `alternateWrestlerId`) and
 *                reserve it against the player.
 *
 * The roster system is intact on both ends — its dropdowns, the option
 * grouping, the assign/release transactions in `PUT /players/me`, and every
 * stored `*WrestlerId` are all still there. It is only hidden from the
 * profile form. Flip this one constant back to `'roster'` to restore it.
 *
 * While in `'text'` mode the profile form does not send the FK fields at all,
 * so a player's existing wrestler assignment is left exactly as it was rather
 * than being released.
 */
export type WrestlerNameEntryMode = 'text' | 'roster';

export const WRESTLER_NAME_ENTRY_MODE: WrestlerNameEntryMode = 'text';
