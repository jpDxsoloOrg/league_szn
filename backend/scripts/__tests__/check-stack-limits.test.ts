import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

interface Template {
  Resources?: Record<string, unknown>;
  Parameters?: Record<string, unknown>;
  Outputs?: Record<string, unknown>;
}

interface PackagedTemplate {
  name: string;
  isRoot: boolean;
  template: Template;
}

interface Limits {
  rootMax?: number;
  nestedMax?: number;
  maxParameters?: number;
  maxOutputs?: number;
}

interface StackLimitChecker {
  ROOT_MAX: number;
  NESTED_MAX: number;
  MAX_PARAMETERS: number;
  MAX_OUTPUTS: number;
  loadPackagedTemplates: (dir: string) => PackagedTemplate[];
  checkStackLimits: (
    templates: PackagedTemplate[],
    limits?: Limits,
  ) => { rows: { name: string; resources: number }[]; failures: string[] };
}

const load = createRequire(__filename);
const { ROOT_MAX, NESTED_MAX, MAX_PARAMETERS, MAX_OUTPUTS, loadPackagedTemplates, checkStackLimits } = load(
  '../check-stack-limits.js',
) as StackLimitChecker;

function entries(count: number, prefix: string): Record<string, unknown> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`${prefix}${index}`, { Type: 'AWS::SNS::Topic' }]),
  );
}

const root = (resources: number, extra: Template = {}): PackagedTemplate => ({
  name: 'root',
  isRoot: true,
  template: { Resources: entries(resources, 'Root'), ...extra },
});

const nested = (name: string, resources: number, extra: Template = {}): PackagedTemplate => ({
  name,
  isRoot: false,
  template: { Resources: entries(resources, name), ...extra },
});

describe('check-stack-limits thresholds', () => {
  it('uses the PR 1 thresholds', () => {
    expect(ROOT_MAX).toBe(485);
    expect(NESTED_MAX).toBe(450);
    expect(MAX_PARAMETERS).toBe(180);
    expect(MAX_OUTPUTS).toBe(180);
  });

  it('passes a 478-resource root at ROOT_MAX 485', () => {
    expect(checkStackLimits([root(478)]).failures).toEqual([]);
  });

  it('fails a 478-resource root at 450', () => {
    expect(checkStackLimits([root(478)], { rootMax: 450 }).failures).toEqual(['root: 478 resources (max 450)']);
  });

  it('fails a 486-resource root at 485', () => {
    expect(checkStackLimits([root(486)]).failures).toEqual(['root: 486 resources (max 485)']);
  });

  it('passes a 450-resource nested stack and fails a 451-resource one', () => {
    const { failures } = checkStackLimits([root(10), nested('Overflow', 450), nested('Overflow2', 451)]);
    expect(failures).toEqual(['Overflow2: 451 resources (max 450)']);
  });

  it('fails 181 parameters or 181 outputs in any template', () => {
    const { failures } = checkStackLimits([
      root(10, { Parameters: entries(180, 'P'), Outputs: entries(181, 'O') }),
      nested('Permissions', 10, { Parameters: entries(181, 'P') }),
    ]);
    expect(failures).toEqual(['root: 181 outputs (max 180)', 'Permissions: 181 parameters (max 180)']);
  });

  it('reports per-stack counts', () => {
    const { rows } = checkStackLimits([root(3), nested('API', 2)]);
    expect(rows.map(({ name, resources }) => [name, resources])).toEqual([
      ['root', 3],
      ['API', 2],
    ]);
  });
});

describe('loadPackagedTemplates', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('reads the root and every nested template, not the create-stack template', () => {
    dir = mkdtempSync(join(tmpdir(), 'stack-limits-'));
    writeFileSync(join(dir, 'cloudformation-template-update-stack.json'), JSON.stringify({ Resources: entries(2, 'R') }));
    writeFileSync(join(dir, 'cloudformation-template-create-stack.json'), JSON.stringify({ Resources: entries(1, 'C') }));
    writeFileSync(
      join(dir, 'cloudformation-template-Overflow-nested-stack.json'),
      JSON.stringify({ Resources: entries(451, 'O') }),
    );

    const templates = loadPackagedTemplates(dir);
    expect(templates.map(({ name, isRoot }) => [name, isRoot])).toEqual([
      ['root', true],
      ['Overflow', false],
    ]);
    expect(checkStackLimits(templates).failures).toEqual(['Overflow: 451 resources (max 450)']);
  });

  it('fails clearly when nothing was packaged', () => {
    dir = mkdtempSync(join(tmpdir(), 'stack-limits-'));
    expect(() => loadPackagedTemplates(dir)).toThrow(/serverless package/);
  });
});
