import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/** jsdom applies no CSS, so the stacking rule is read from the source. */
function zIndexOf(file: string, selector: string): number {
  const css = readFileSync(resolve(__dirname, file), 'utf8');
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf('}', start));
  return Number(/z-index:\s*(\d+)/.exec(block)?.[1] ?? 0);
}

describe('championship tile layers', () => {
  it('keeps the open button level with the tile text, so the text cannot swallow clicks', () => {
    const textLayer = zIndexOf('../ui/PhotoTile.css', '.ui-tile__text');
    const buttonLayer = zIndexOf('../Championships.css', '.title-item__open');

    expect(textLayer).toBeGreaterThan(0);
    expect(buttonLayer).toBeGreaterThanOrEqual(textLayer);
  });
});
