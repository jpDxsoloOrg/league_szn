import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/** jsdom has no layout, so this pins the rule that keeps the link easy to tap. */
describe('discipline tap targets', () => {
  it('gives the "How strikes work" link the full touch height', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/discipline/Discipline.css'), 'utf8');
    const start = css.indexOf('.strikes-panel__help {');
    expect(start).toBeGreaterThanOrEqual(0);

    const rule = css.slice(start, css.indexOf('}', start));
    expect(rule).toContain('display: inline-flex');
    expect(rule).toContain('min-height: var(--touch-target)');
  });
});
