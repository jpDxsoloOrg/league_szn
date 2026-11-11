import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const cssOf = (path: string) => readFileSync(join(process.cwd(), 'src/components', path), 'utf8');

/** The declarations of the first rule with exactly this selector. */
const ruleBody = (css: string, selector: string): string => {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} rule`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
};

/**
 * jsdom has no layout, so this pins the rules that keep words whole at 320.
 * `overflow-wrap: anywhere` lets a flex item shrink below its longest word.
 */
describe('words stay whole on narrow screens', () => {
  it('a tournament title wraps above its status rather than splitting', () => {
    const css = cssOf('Tournaments.css');

    expect(ruleBody(css, '.tournament-card__header')).toContain('flex-wrap: wrap');
    expect(ruleBody(css, '.tournament-card__header h2')).toContain('overflow-wrap: break-word');
  });

  it('a commentary card stacks at phone width and keeps records on one line', () => {
    const css = cssOf('events/CommentaryWrestlerCard.css');

    expect(ruleBody(css, '.commentary-card-name')).toContain('overflow-wrap: break-word');
    expect(ruleBody(css, '.commentary-card-record dd')).toContain('white-space: nowrap');
    expect(css.slice(css.indexOf('@media (max-width: 360px)'))).toContain('flex-direction: column');
  });

  it('a division pill stays inside the commentary card', () => {
    expect(ruleBody(cssOf('events/CommentaryWrestlerCard.css'), '.commentary-card-division')).toContain('max-width: 100%');
  });
});
