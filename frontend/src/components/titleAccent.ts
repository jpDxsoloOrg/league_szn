import type { Championship } from '../types';
import type { TileAccent } from './ui/PhotoTile';

/** Rim light for a title. Titles carry no tier field, so this reads the name. */
export function getTitleAccent(championship: Pick<Championship, 'name' | 'type'>): TileAccent {
  if (championship.type === 'tag') return 'tag';
  const name = championship.name.toLowerCase();
  if (/world|universal|heavyweight/.test(name)) return 'world';
  if (/united states|\bus\b/.test(name)) return 'us';
  if (/intercontinental|\bic\b/.test(name)) return 'ic';
  return 'none';
}
