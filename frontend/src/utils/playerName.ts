/** A staff-facing player name. Some accounts have none, and a blank row can't be told apart from the next. */
export function nameOrUnnamed(name: string | null | undefined, unnamedLabel: string): string {
  return name?.trim() || unnamedLabel;
}
