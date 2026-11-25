import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
interface Resource {
  Type: string;
  DependsOn?: string[];
  Properties?: Record<string, Json>;
}
interface Template {
  Resources: Record<string, Resource>;
  Parameters?: Record<string, { Type: string }>;
  Outputs?: Record<string, { Value: Json }>;
}
type Stacks = Map<string, Template>;
interface StackReport {
  added: string[];
  removed: string[];
  changed: string[];
}
interface DiffLiveTemplate {
  BRIDGED_IDS: Set<string>;
  diffTemplates: (live: Stacks, packaged: Stacks) => { report: Map<string, StackReport>; failures: string[] };
  loadLiveTemplates: (run: (args: string[]) => unknown, stackName: string) => Stacks | null;
  parseTemplateBody: (body: unknown) => Template;
}

const { BRIDGED_IDS, diffTemplates, loadLiveTemplates } = createRequire(__filename)(
  '../diff-live-template.js',
) as DiffLiveTemplate;

const sourceArn = (restApi: Json): Json => ({
  'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':execute-api:', { Ref: 'AWS::Region' }, ':',
    { Ref: 'AWS::AccountId' }, ':', restApi, '/*/*']],
});

/** A root-stack API Gateway permission, as Serverless writes it. */
const rootPermission = (fn: string, getAtt: Json = { 'Fn::GetAtt': [`${fn}LambdaFunction`, 'Arn'] }): Resource => ({
  Type: 'AWS::Lambda::Permission',
  Properties: {
    FunctionName: getAtt,
    Action: 'lambda:InvokeFunction',
    Principal: 'apigateway.amazonaws.com',
    SourceArn: sourceArn({ Ref: 'ApiGatewayRestApi' }),
  },
});

/** The same permission after split-stacks moved it to the Permissions nested stack. */
const nestedPermission = (fn: string, functionParameter = `${fn}LambdaFunctionArnParameter`): Resource => ({
  Type: 'AWS::Lambda::Permission',
  Properties: {
    FunctionName: { Ref: functionParameter },
    Action: 'lambda:InvokeFunction',
    Principal: 'apigateway.amazonaws.com',
    SourceArn: sourceArn({ Ref: 'ApiGatewayRestApiParameter' }),
  },
});

const fn = (): Resource => ({ Type: 'AWS::Lambda::Function', Properties: { Handler: 'h' } });
const typed = (Type: string): Resource => ({ Type, Properties: {} });

/** A live layout: root, a Permissions stack, an API stack and a Versions stack. */
function liveStacks(): Stacks {
  return new Map<string, Template>([
    ['root', {
      Resources: {
        ApiGatewayRestApi: typed('AWS::ApiGateway::RestApi'),
        PlayersTable: typed('AWS::DynamoDB::Table'),
        GetStandingsLambdaFunction: fn(),
        PlayersLambdaFunction: fn(),
        LoginLambdaFunction: fn(),
        LoginLogGroup: typed('AWS::Logs::LogGroup'),
        GetStandingsLambdaPermissionApiGateway: rootPermission('GetStandings', { 'Fn::GetAtt': 'GetStandingsLambdaFunction.Arn' }),
        ApiGatewayMethodStandingsGet: typed('AWS::ApiGateway::Method'),
        ApiGatewayDeployment1: typed('AWS::ApiGateway::Deployment'),
        APINestedStack: typed('AWS::CloudFormation::Stack'),
        PermissionsNestedStack: {
          Type: 'AWS::CloudFormation::Stack',
          Properties: {
            Parameters: {
              PlayersLambdaFunctionArnParameter: { 'Fn::GetAtt': ['PlayersLambdaFunction', 'Arn'] },
              LoginLambdaFunctionArnParameter: { 'Fn::GetAtt': ['LoginLambdaFunction', 'Arn'] },
              ApiGatewayRestApiParameter: { Ref: 'ApiGatewayRestApi' },
            },
          },
        },
        VersionsNestedStack: typed('AWS::CloudFormation::Stack'),
      },
    }],
    ['PermissionsNestedStack', {
      Parameters: {
        PlayersLambdaFunctionArnParameter: { Type: 'String' },
        LoginLambdaFunctionArnParameter: { Type: 'String' },
        ApiGatewayRestApiParameter: { Type: 'String' },
      },
      Resources: {
        PlayersLambdaPermissionApiGateway: nestedPermission('Players'),
        LoginLambdaPermissionApiGateway: nestedPermission('Login'),
      },
    }],
    ['APINestedStack', { Resources: { ApiGatewayResourceStandings: typed('AWS::ApiGateway::Resource') } }],
    ['VersionsNestedStack', { Resources: { PlayersLambdaVersionAbc: typed('AWS::Lambda::Version') } }],
  ]);
}

/** The packaged 2a layout for the live stacks above: routes and login gone, permissions bridged. */
function packagedStacks(): Stacks {
  const live = liveStacks();
  const root = structuredClone(live.get('root')!);
  for (const id of ['LoginLambdaFunction', 'LoginLogGroup', 'ApiGatewayMethodStandingsGet', 'ApiGatewayDeployment1', 'APINestedStack']) {
    delete root.Resources[id];
  }
  root.Resources.GetStandingsLambdaPermissionApiGateway = rootPermission('GetStandings');
  root.Resources.OverflowNestedStack = typed('AWS::CloudFormation::Stack');
  const rootParameters = root.Resources.PermissionsNestedStack.Properties!.Parameters as Record<string, Json>;
  delete rootParameters.LoginLambdaFunctionArnParameter;
  const permissions = structuredClone(live.get('PermissionsNestedStack')!);
  delete permissions.Resources.LoginLambdaPermissionApiGateway;
  delete permissions.Parameters!.LoginLambdaFunctionArnParameter;
  return new Map<string, Template>([
    ['root', root],
    ['PermissionsNestedStack', permissions],
    ['OverflowNestedStack', {
      Resources: {
        ApiGatewayDeployment2: typed('AWS::ApiGateway::Deployment'),
        ApiGatewayMethodProxyVarAny: typed('AWS::ApiGateway::Method'),
      },
    }],
    ['VersionsNestedStack', { Resources: { PlayersLambdaVersionDef: typed('AWS::Lambda::Version') } }],
  ]);
}

describe('diff-live-template', () => {
  it('bridges the real legacy-bridge.js logical IDs', () => {
    expect(BRIDGED_IDS.has('GetStandingsLambdaPermissionApiGateway')).toBe(true);
    expect(BRIDGED_IDS.has('PlayersLambdaPermissionApiGateway')).toBe(true);
    expect(BRIDGED_IDS.has('AdminAuthorizerApiGatewayAuthorizer')).toBe(true);
    expect(BRIDGED_IDS.has('LoginLambdaPermissionApiGateway')).toBe(false);
  });

  it('passes the expected 2a diff and reports it per stack', () => {
    const { report, failures } = diffTemplates(liveStacks(), packagedStacks());
    expect(failures).toEqual([]);
    expect(report.get('root')?.removed.sort()).toEqual([
      'APINestedStack', 'ApiGatewayDeployment1', 'ApiGatewayMethodStandingsGet', 'LoginLambdaFunction', 'LoginLogGroup',
    ]);
    expect(report.get('APINestedStack')?.removed).toEqual(['ApiGatewayResourceStandings']);
    expect(report.get('PermissionsNestedStack')?.removed).toEqual(['LoginLambdaPermissionApiGateway']);
    expect(report.get('OverflowNestedStack')?.added.sort()).toEqual(['ApiGatewayDeployment2', 'ApiGatewayMethodProxyVarAny']);
    // The GetAtt string form on live equals the array form packaged.
    expect(report.get('root')?.changed ?? []).not.toContain('GetStandingsLambdaPermissionApiGateway');
  });

  it('skips VersionsNestedStack', () => {
    const { report } = diffTemplates(liveStacks(), packagedStacks());
    expect(report.has('VersionsNestedStack')).toBe(false);
  });

  it('fails when a bridged permission is removed', () => {
    const packaged = packagedStacks();
    delete packaged.get('PermissionsNestedStack')!.Resources.PlayersLambdaPermissionApiGateway;
    expect(diffTemplates(liveStacks(), packaged).failures).toEqual([
      'PlayersLambdaPermissionApiGateway (AWS::Lambda::Permission) removed from PermissionsNestedStack',
    ]);
  });

  it('fails when a function is removed', () => {
    const packaged = packagedStacks();
    delete packaged.get('root')!.Resources.PlayersLambdaFunction;
    expect(diffTemplates(liveStacks(), packaged).failures).toEqual([
      'PlayersLambdaFunction (AWS::Lambda::Function) removed from root',
    ]);
  });

  it('fails when a permission moves to another stack', () => {
    const packaged = packagedStacks();
    const moved = packaged.get('PermissionsNestedStack')!.Resources.PlayersLambdaPermissionApiGateway;
    delete packaged.get('PermissionsNestedStack')!.Resources.PlayersLambdaPermissionApiGateway;
    packaged.get('OverflowNestedStack')!.Resources.PlayersLambdaPermissionApiGateway = moved;
    expect(diffTemplates(liveStacks(), packaged).failures).toEqual([
      'PlayersLambdaPermissionApiGateway (AWS::Lambda::Permission) moves PermissionsNestedStack -> OverflowNestedStack',
    ]);
  });

  it('fails when a bridged permission differs from live', () => {
    const packaged = packagedStacks();
    packaged.get('root')!.Resources.GetStandingsLambdaPermissionApiGateway.Properties!.Principal = 'lambda.amazonaws.com';
    const { failures } = diffTemplates(liveStacks(), packaged);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^GetStandingsLambdaPermissionApiGateway \(bridged\) differs from live in root/);
  });

  it('resolves nested-stack parameters to the root value they carry', () => {
    const packaged = packagedStacks();
    // A renamed parameter that still carries the same root expression is not a change.
    const permissions = packaged.get('PermissionsNestedStack')!;
    permissions.Resources.PlayersLambdaPermissionApiGateway = nestedPermission('Players', 'PlayersArnRenamed');
    permissions.Parameters!.PlayersArnRenamed = { Type: 'String' };
    const rootParameters = packaged.get('root')!.Resources.PermissionsNestedStack.Properties!.Parameters as Record<string, Json>;
    rootParameters.PlayersArnRenamed = { 'Fn::GetAtt': ['PlayersLambdaFunction', 'Arn'] };
    expect(diffTemplates(liveStacks(), packaged).failures).toEqual([]);

    // The same parameter name carrying a different function is a change.
    rootParameters.PlayersArnRenamed = { 'Fn::GetAtt': ['GetStandingsLambdaFunction', 'Arn'] };
    const { failures } = diffTemplates(liveStacks(), packaged);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^PlayersLambdaPermissionApiGateway \(bridged\) differs from live/);
  });

  it('follows another nested stack\'s outputs to their value', () => {
    const packaged = packagedStacks();
    packaged.get('OverflowNestedStack')!.Outputs = {
      PlayersArn: { Value: { 'Fn::GetAtt': ['PlayersLambdaFunction', 'Arn'] } },
    };
    const rootParameters = packaged.get('root')!.Resources.PermissionsNestedStack.Properties!.Parameters as Record<string, Json>;
    rootParameters.PlayersLambdaFunctionArnParameter = { 'Fn::GetAtt': ['OverflowNestedStack', 'Outputs.PlayersArn'] };
    expect(diffTemplates(liveStacks(), packaged).failures).toEqual([]);
  });

  it('fails when anything else is removed, such as a table', () => {
    const packaged = packagedStacks();
    delete packaged.get('root')!.Resources.PlayersTable;
    expect(diffTemplates(liveStacks(), packaged).failures).toEqual([
      'PlayersTable (AWS::DynamoDB::Table) removed from root',
    ]);
  });

  it('fails when a bridged resource is not live but its function is (it would be created, not kept)', () => {
    const live = liveStacks();
    live.get('root')!.Resources.ContractsLambdaFunction = fn();
    const packaged = packagedStacks();
    packaged.get('root')!.Resources.ContractsLambdaFunction = fn();
    packaged.get('root')!.Resources.ContractsLambdaPermissionApiGateway = rootPermission('Contracts');
    expect(diffTemplates(live, packaged).failures).toEqual([
      'ContractsLambdaPermissionApiGateway (bridged) is not live: it would be created, not kept',
    ]);
  });

  it('fails when a bridged permission is not live and its function is missing from the packaged templates', () => {
    const packaged = packagedStacks();
    packaged.get('root')!.Resources.ContractsLambdaPermissionApiGateway = rootPermission('Contracts');
    expect(diffTemplates(liveStacks(), packaged).failures).toEqual([
      'ContractsLambdaPermissionApiGateway (bridged) is not live: it would be created, not kept',
    ]);
  });

  it('allows a bridged permission created together with its new function (stage lags main)', () => {
    const packaged = packagedStacks();
    packaged.get('root')!.Resources.ContractsLambdaFunction = fn();
    packaged.get('root')!.Resources.ContractsLambdaPermissionApiGateway = rootPermission('Contracts');
    // The same in a nested stack, where FunctionName is a parameter carrying the root GetAtt.
    const rootParameters = packaged.get('root')!.Resources.PermissionsNestedStack.Properties!.Parameters as Record<string, Json>;
    rootParameters.InjuriesLambdaFunctionArnParameter = { 'Fn::GetAtt': ['InjuriesLambdaFunction', 'Arn'] };
    const permissions = packaged.get('PermissionsNestedStack')!;
    permissions.Parameters!.InjuriesLambdaFunctionArnParameter = { Type: 'String' };
    permissions.Resources.InjuriesLambdaPermissionApiGateway = nestedPermission('Injuries');
    packaged.get('OverflowNestedStack')!.Resources.InjuriesLambdaFunction = fn();

    const { report, failures } = diffTemplates(liveStacks(), packaged);
    expect(failures).toEqual([]);
    expect(report.get('root')?.added).toEqual(expect.arrayContaining(['ContractsLambdaFunction', 'ContractsLambdaPermissionApiGateway']));
    expect(report.get('PermissionsNestedStack')?.added).toEqual(['InjuriesLambdaPermissionApiGateway']);
  });

  it('still fails a new authorizer, which has no target function to excuse it', () => {
    const live = liveStacks();
    const packaged = packagedStacks();
    packaged.get('root')!.Resources.AdminAuthorizerLambdaFunction = fn();
    packaged.get('root')!.Resources.AdminAuthorizerApiGatewayAuthorizer = typed('AWS::ApiGateway::Authorizer');
    expect(diffTemplates(live, packaged).failures).toEqual([
      'AdminAuthorizerApiGatewayAuthorizer (bridged) is not live: it would be created, not kept',
    ]);
  });
});

describe('loadLiveTemplates', () => {
  it('reads the root and every live nested stack except Versions, parsing string bodies', () => {
    const bodies: Record<string, unknown> = {
      'svc-devtest': { Resources: { A: { Type: 'AWS::SNS::Topic' } } },
      'arn:permissions': JSON.stringify({ Resources: { B: { Type: 'AWS::Lambda::Permission' } } }),
    };
    const run = vi.fn((args: string[]) => {
      if (args[1] === 'get-template') return { TemplateBody: bodies[args[3]] };
      return {
        StackResourceSummaries: [
          { LogicalResourceId: 'PermissionsNestedStack', PhysicalResourceId: 'arn:permissions', ResourceType: 'AWS::CloudFormation::Stack', ResourceStatus: 'UPDATE_COMPLETE' },
          { LogicalResourceId: 'VersionsNestedStack', PhysicalResourceId: 'arn:versions', ResourceType: 'AWS::CloudFormation::Stack', ResourceStatus: 'UPDATE_COMPLETE' },
          { LogicalResourceId: 'A', PhysicalResourceId: 'topic', ResourceType: 'AWS::SNS::Topic', ResourceStatus: 'UPDATE_COMPLETE' },
        ],
      };
    });
    const stacks = loadLiveTemplates(run, 'svc-devtest');
    expect([...stacks!.keys()]).toEqual(['root', 'PermissionsNestedStack']);
    expect(stacks!.get('PermissionsNestedStack')?.Resources.B.Type).toBe('AWS::Lambda::Permission');
    // Read-only calls only.
    for (const [args] of run.mock.calls) expect(['get-template', 'list-stack-resources']).toContain(args[1]);
  });

  it('returns null when the root stack does not exist (first deploy of a stage)', () => {
    const { AwsCliError } = createRequire(__filename)('../aws-cli.js') as {
      AwsCliError: new (args: string[], stderr: string) => Error;
    };
    const run = vi.fn(() => {
      throw new AwsCliError(['cloudformation', 'get-template'], 'Stack with id svc-new does not exist');
    });
    expect(loadLiveTemplates(run, 'svc-new')).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
