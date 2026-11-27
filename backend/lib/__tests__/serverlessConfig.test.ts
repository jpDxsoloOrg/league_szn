import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

type CfnResource = { Type: string; DependsOn?: string[]; Properties: Record<string, unknown> };
type BridgeFragment = { Resources: Record<string, CfnResource> };
interface LegacyBridge {
  (): BridgeFragment;
  LEGACY_HTTP_FUNCTIONS: ReadonlyArray<string>;
  buildLegacyBridge: () => BridgeFragment;
  permissionLogicalId: (functionName: string) => string;
}

const legacyBridge = createRequire(__filename)('../../legacy-bridge.js') as LegacyBridge;

const backendRoot = resolve(__dirname, '../..');
const template = readFileSync(join(backendRoot, 'serverless.yml'), 'utf8');

/**
 * Splits the `resources` list's `Resources` section into one text block per
 * logical ID. `resources:` is a list so legacy-bridge.js can be merged in
 * (INFRA-207 PR 2a).
 */
function resourceBlocks(): Map<string, string> {
  const start = template.indexOf('\n- Resources:\n');
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
    expect(template.indexOf('\n- Resources:\n')).toBeGreaterThan(0);
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
    // Set by the script that keeps the triggers. As a template property, the
    // change would make CloudFormation call UpdateUserPool without them.
    expect(pool).not.toMatch(/^\s+DeletionProtection:/m);
    const setupScript = readFileSync(join(backendRoot, 'scripts/setup-cognito.sh'), 'utf8');
    expect(setupScript).toContain('DeletionProtection: "ACTIVE"');

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

  it('requires an explicit stage, because the dev stage is production', () => {
    expect(template).toMatch(/^ {2}stage: \$\{opt:stage\}$/m);
  });

  it('keeps npm run remove from reaching a stack', () => {
    const packageJson = JSON.parse(readFileSync(join(backendRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts.remove).toMatch(/^echo '.*' >&2 && exit 1$/);
  });

  it('attaches the managed security headers policy to every cache behavior', () => {
    const behaviors = template.match(/ViewerProtocolPolicy: redirect-to-https/g) ?? [];
    const attached = template.match(/ResponseHeadersPolicyId: \$\{self:custom\.securityHeadersPolicyId\}/g) ?? [];

    expect(behaviors.length).toBe(2);
    expect(attached.length).toBe(behaviors.length);
    expect(template).toContain('securityHeadersPolicyId: 67f7725c-6f97-4210-82d7-5512b31e9d03');
  });
});

describe.each(['deploy-dev.yml', 'deploy-prod.yml'])('%s Cognito wiring', (workflow) => {
  const steps = readFileSync(join(backendRoot, '../.github/workflows', workflow), 'utf8').split('\n      - name: ');
  const step = (name: string) => steps.find((text) => text.startsWith(name)) ?? '';
  const rewiresAfterFailure = "if: ${{ !cancelled() && steps.deploy_backend.conclusion != 'skipped' }}";

  it('re-attaches the triggers even when the backend deploy fails', () => {
    expect(steps.find((text) => text.startsWith('Deploy backend'))).toContain('id: deploy_backend');
    expect(step('Extract Cognito IDs')).toContain(rewiresAfterFailure);
    expect(step('Wire Cognito')).toContain(rewiresAfterFailure);
  });
});

describe.each(['deploy-dev.yml', 'deploy-prod.yml'])('%s INFRA-207 deploy rails', (workflow) => {
  const steps = readFileSync(join(backendRoot, '../.github/workflows', workflow), 'utf8').split('\n      - name: ');
  const indexOf = (name: string) => steps.findIndex((text) => text.startsWith(name));
  const deployIndex = steps.findIndex((text) => text.startsWith('Deploy backend') && text.includes('id: deploy_backend'));

  it('refreshes the API stage deployment after a successful backend deploy', () => {
    const refreshIndex = indexOf('Refresh API stage deployment');
    expect(deployIndex).toBeGreaterThan(0);
    expect(refreshIndex).toBeGreaterThan(deployIndex);

    const refresh = steps[refreshIndex];
    expect(refresh).toContain("if: steps.deploy_backend.outcome == 'success'");
    expect(refresh).toContain('--logical-resource-id ApiGatewayRestApi');
    expect(refresh).toMatch(/aws apigateway get-stage[\s\S]*echo "Previous [\s\S]*aws apigateway create-deployment/);
  });

  it('caps stage throttling in the refresh step (INFRA-207 PR 2a, plan 7.5)', () => {
    const refresh = steps[indexOf('Refresh API stage deployment')];
    expect(refresh).toMatch(/aws apigateway create-deployment[\s\S]*aws apigateway update-stage/);
    expect(refresh).toContain("'op=replace,path=/*/*/throttling/rateLimit,value=500'");
    expect(refresh).toContain("'op=replace,path=/*/*/throttling/burstLimit,value=1000'");
  });

  it('keeps deploying the frontend when the stage refresh fails, then fails the job at the end', () => {
    const refresh = steps[indexOf('Refresh API stage deployment')];
    expect(refresh).toContain('id: refresh_stage');
    expect(refresh).toContain('continue-on-error: true');

    const failIndex = indexOf('Fail if API stage refresh failed');
    expect(failIndex).toBeGreaterThan(indexOf('Invalidate CloudFront cache'));
    expect(steps[failIndex]).toContain("steps.refresh_stage.outcome == 'failure'");
    expect(steps[failIndex]).toContain('exit 1');
  });

  it('checks stack limits after the cycle check and the cut-over gate before the deploy', () => {
    const cycleIndex = indexOf('Check generated stacks for dependency cycles');
    const limitsIndex = indexOf('Check generated stacks against resource limits');
    const gateIndex = indexOf('Check API cut-over gate');

    expect(cycleIndex).toBeGreaterThan(0);
    expect(limitsIndex).toBeGreaterThan(cycleIndex);
    expect(gateIndex).toBeGreaterThan(limitsIndex);
    expect(deployIndex).toBeGreaterThan(gateIndex);
    expect(steps[limitsIndex]).toContain('npm run check-stack-limits');
    expect(steps[gateIndex]).toContain('node scripts/check-api-cutover.js --stage ');
  });

  it('diffs the packaged templates against the live stack before the deploy (PR 2a until 2b)', () => {
    const diffIndex = indexOf('Diff packaged templates against live stack');
    expect(diffIndex).toBeGreaterThan(indexOf('Check generated stacks for dependency cycles'));
    expect(deployIndex).toBeGreaterThan(diffIndex);
    const stage = workflow === 'deploy-dev.yml' ? 'devtest' : 'dev';
    expect(steps[diffIndex]).toContain(`node scripts/diff-live-template.js --stage ${stage}`);
    expect(steps[diffIndex]).not.toContain('continue-on-error');
  });
});

/** Functions with no http events in their own right: kept by INFRA-207 (plan 3). */
const NON_HTTP_FUNCTIONS = [
  'adminAuthorizer',
  'postConfirmation',
  'preSignUp',
  'expireChallenges',
  'expireContractOffers',
  'weeklyJobs',
  'recalculateContenders',
];

/** Function name -> the event types declared under its `events:` list. */
function eventTypesByFunction(): Map<string, string[]> {
  const section = template.slice(template.indexOf('\nfunctions:\n'), template.indexOf('\nresources:\n'));
  const byFunction = new Map<string, string[]>();
  let current = '';
  for (const line of section.split('\n')) {
    const header = /^ {2}([A-Za-z0-9]+):$/.exec(line);
    if (header) {
      current = header[1];
      byFunction.set(current, []);
    }
    const event = /^ {6}- ([A-Za-z]+):/.exec(line);
    if (event && current) byFunction.get(current)?.push(event[1]);
  }
  return byFunction;
}

describe('serverless.yml INFRA-207 cut-over (PR 2a)', () => {
  it('declares http events on no function except api', () => {
    const withHttp = [...eventTypesByFunction()]
      .filter(([, types]) => types.some((type) => type === 'http' || type === 'httpApi'))
      .map(([name]) => name);
    expect(withHttp).toEqual(['api']);
  });

  it('no longer declares the login function', () => {
    expect(functionNames()).not.toContain('login');
  });

  it('merges legacy-bridge.js into resources', () => {
    expect(template).toMatch(/^- \$\{file\(\.\/legacy-bridge\.js\)\}$/m);
  });

  it('bridges every event-less legacy HTTP function, and only those', () => {
    const expected = [...functionNames()]
      .filter((name) => name !== 'api' && !NON_HTTP_FUNCTIONS.includes(name))
      .sort();
    expect([...legacyBridge.LEGACY_HTTP_FUNCTIONS].sort()).toEqual(expected);
  });

  it('emits each permission and the authorizer under its live logical ID, in Serverless form', () => {
    const { Resources } = legacyBridge.buildLegacyBridge();
    expect(Object.keys(Resources).length).toBe(legacyBridge.LEGACY_HTTP_FUNCTIONS.length + 2);
    expect(Resources.GetStandingsLambdaPermissionApiGateway).toEqual({
      Type: 'AWS::Lambda::Permission',
      Properties: {
        FunctionName: { 'Fn::GetAtt': ['GetStandingsLambdaFunction', 'Arn'] },
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn: {
          'Fn::Join': ['', [
            'arn:', { Ref: 'AWS::Partition' }, ':execute-api:', { Ref: 'AWS::Region' }, ':',
            { Ref: 'AWS::AccountId' }, ':', { Ref: 'ApiGatewayRestApi' }, '/*/*',
          ]],
        },
      },
    });
    expect(Resources.AdminAuthorizerLambdaPermissionApiGateway.Properties.FunctionName).toEqual({
      'Fn::GetAtt': ['AdminAuthorizerLambdaFunction', 'Arn'],
    });
    expect(Resources.AdminAuthorizerApiGatewayAuthorizer).toEqual({
      Type: 'AWS::ApiGateway::Authorizer',
      DependsOn: [],
      Properties: {
        IdentitySource: 'method.request.header.Authorization',
        Name: 'adminAuthorizer',
        RestApiId: { Ref: 'ApiGatewayRestApi' },
        AuthorizerUri: {
          'Fn::Join': ['', [
            'arn:', { Ref: 'AWS::Partition' }, ':apigateway:', { Ref: 'AWS::Region' },
            ':lambda:path/2015-03-31/functions/', { 'Fn::GetAtt': ['AdminAuthorizerLambdaFunction', 'Arn'] },
            '/invocations',
          ]],
        },
        Type: 'TOKEN',
      },
    });
    expect(legacyBridge.permissionLogicalId('rivalryNotes')).toBe('RivalryNotesLambdaPermissionApiGateway');
  });

  it('is what Serverless\'s ${file()} resolves: a function returning the Resources fragment', () => {
    expect(typeof legacyBridge).toBe('function');
    expect(legacyBridge()).toEqual(legacyBridge.buildLegacyBridge());
  });
});
