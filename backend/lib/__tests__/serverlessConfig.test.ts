import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const backendRoot = resolve(__dirname, '../..');
const template = readFileSync(join(backendRoot, 'serverless.yml'), 'utf8');

/** Splits the `resources.Resources` section into one text block per logical ID. */
function resourceBlocks(): Map<string, string> {
  const start = template.indexOf('\n  Resources:\n');
  const end = template.indexOf('\n  Outputs:\n');
  const blocks = new Map<string, string>();
  let currentId: string | null = null;

  for (const line of template.slice(start, end).split('\n')) {
    const header = /^ {4}([A-Za-z0-9]+):$/.exec(line);
    if (header) {
      currentId = header[1];
      blocks.set(currentId, '');
    } else if (currentId) {
      blocks.set(currentId, `${blocks.get(currentId)}${line}\n`);
    }
  }
  return blocks;
}

function blocksOfType(type: string): [string, string][] {
  return [...resourceBlocks()].filter(([, block]) => block.includes(`Type: ${type}\n`));
}

function functionNames(): Set<string> {
  const section = template.slice(template.indexOf('\nfunctions:\n'), template.indexOf('\nresources:\n'));
  return new Set([...section.matchAll(/^ {2}([A-Za-z0-9]+):$/gm)].map((match) => match[1]));
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('serverless.yml data protection', () => {
  it('finds the tables it checks', () => {
    expect(blocksOfType('AWS::DynamoDB::Table').length).toBeGreaterThanOrEqual(41);
  });

  it('protects every DynamoDB table', () => {
    for (const [logicalId, block] of blocksOfType('AWS::DynamoDB::Table')) {
      expect(block, logicalId).toContain('DeletionPolicy: Retain');
      expect(block, logicalId).toContain('UpdateReplacePolicy: Retain');
      expect(block, logicalId).toContain('DeletionProtectionEnabled: true');
      expect(block, logicalId).toContain('PointInTimeRecoveryEnabled: true');
    }
  });

  it('protects the user pool and retains what hangs off it', () => {
    const [[, pool]] = blocksOfType('AWS::Cognito::UserPool');
    expect(pool).toContain('DeletionProtection: ACTIVE');

    const poolResources = [
      ...blocksOfType('AWS::Cognito::UserPool'),
      ...blocksOfType('AWS::Cognito::UserPoolGroup'),
      ...blocksOfType('AWS::Cognito::UserPoolClient'),
    ];
    for (const [logicalId, block] of poolResources) {
      expect(block, logicalId).toContain('DeletionPolicy: Retain');
      expect(block, logicalId).toContain('UpdateReplacePolicy: Retain');
    }
  });

  it('retains and versions every bucket', () => {
    for (const [logicalId, block] of blocksOfType('AWS::S3::Bucket')) {
      expect(block, logicalId).toContain('DeletionPolicy: Retain');
      expect(block, logicalId).toContain('UpdateReplacePolicy: Retain');
      expect(block, logicalId).toMatch(/VersioningConfiguration:\n\s+Status: Enabled/);
    }
  });
});

describe('serverless.yml async Lambda permissions', () => {
  const invokeGrants = [...template.matchAll(/:function:\$\{self:service\}-\$\{self:provider\.stage\}-([A-Za-z0-9]+)/g)]
    .map((match) => match[1]);

  it('grants invoke only on functions that exist', () => {
    expect(invokeGrants.length).toBeGreaterThan(0);
    for (const grant of invokeGrants) {
      expect(functionNames(), grant).toContain(grant);
    }
  });

  it('grants invoke on every invokeAsync target', () => {
    const sources = [...sourceFiles(join(backendRoot, 'functions')), ...sourceFiles(join(backendRoot, 'lib'))];
    const targets = sources.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/invokeAsync\(\s*'([A-Za-z0-9]+)'/g)].map((match) => match[1])
    );

    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(invokeGrants, target).toContain(target);
    }
  });
});

describe('serverless.yml edge and setup settings', () => {
  it('has no default value for the admin setup key', () => {
    expect(template).toContain("ADMIN_SETUP_KEY: ${env:ADMIN_SETUP_KEY, ''}");
  });

  it('attaches the managed security headers policy to every cache behavior', () => {
    const behaviors = template.match(/ViewerProtocolPolicy: redirect-to-https/g) ?? [];
    const attached = template.match(/ResponseHeadersPolicyId: \$\{self:custom\.securityHeadersPolicyId\}/g) ?? [];

    expect(behaviors.length).toBe(2);
    expect(attached.length).toBe(behaviors.length);
    expect(template).toContain('securityHeadersPolicyId: 67f7725c-6f97-4210-82d7-5512b31e9d03');
  });
});
