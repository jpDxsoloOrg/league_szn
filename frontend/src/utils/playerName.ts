import type { TFunction } from 'i18next';

/** A staff-facing player name. Some accounts have none, and a blank row can't be told apart from the next. */
export function nameOrUnnamed(name: string | null | undefined, unnamedLabel: string): string {
  return name?.trim() || unnamedLabel;
}

/**
 * Label for a player id missing from a loaded name map, whose row was deleted.
 * An empty map means the names didn't load, which says nothing about the player.
 */
export function missingPlayerLabel(names: ReadonlyMap<string, unknown>, t: TFunction): string {
  return names.size > 0 ? t('common.formerMember') : t('common.unknown');
}
