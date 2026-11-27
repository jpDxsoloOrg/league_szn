import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

interface Template {
  Resources: Record<string, { Type: string }>;
}

interface PackagedTemplate {
  name: string;
  isRoot: boolean;
  template: Template;
}

interface LiveReader {
  getStackResourceId: (stackName: string, logicalId: string) => Promise<string | null>;
  getResourcePaths: (restApiId: string) => Promise<string[]>;
  getStageSnapshotPaths: (restApiId: string, stage: string) => Promise<string[] | null>;
  createDeployment: (restApiId: string, stage: string, description: string) => Promise<string>;
}

interface GateResult {
  ok: boolean;
  messages: string[];
}

interface CutoverGate {
  runCutoverGate: (options: {
    stage: string;
    templates: PackagedTemplate[];
    aws: LiveReader;
    dryRun?: boolean;
    sha?: string;
  }) => Promise<GateResult>;
  createCliReader: (run: (args: string[]) => unknown) => LiveReader;
}

const load = createRequire(__filename);
const { runCutoverGate, createCliReader } = load('../check-api-cutover.js') as CutoverGate;

const METHOD = { Type: 'AWS::ApiGateway::Method' };
const AUTHORIZER = { Type: 'AWS::ApiGateway::Authorizer' };
const PROXY_ONLY = ['/', '/{proxy+}'];
const EXPLICIT_API = ['/', '/{proxy+}', '/players', '/players/{playerId}'];

/** PR 1 / pre-2a: explicit routes, the proxy and the authorizer. */
const pre2a: Template = {
  Resources: {
    ApiGatewayMethodPlayersGet: METHOD,
    ApiGatewayMethodPlayersOptions: METHOD,
    ApiGatewayMethodProxyVarAny: METHOD,
    ApiGatewayMethodProxyVarOptions: METHOD,
    AdminAuthorizerApiGatewayAuthorizer: AUTHORIZER,
  },
};
/** 2a: proxy only, bridge keeps the authorizer. */
const deploy2a: Template = {
  Resources: {
    ApiGatewayMethodProxyVarAny: METHOD,
    ApiGatewayMethodProxyVarOptions: METHOD,
    AdminAuthorizerApiGatewayAuthorizer: AUTHORIZER,
  },
};
/** 2b: proxy only, no authorizer. */
const deploy2b: Template = {
  Resources: { ApiGatewayMethodProxyVarAny: METHOD, ApiGatewayMethodProxyVarOptions: METHOD },
};
/** After 2b, a deliberate explicit slow route (plan section 10). */
const post2bSlowRoute: Template = {
  Resources: { ...deploy2b.Resources, ApiGatewayMethodSlowDashrouteGet: METHOD },
};

/** Templates split over root and a nested stack, as the split-stacks plugin writes them. */
function packaged(template: Template): PackagedTemplate[] {
  const entries = Object.entries(template.Resources);
  const half = Math.ceil(entries.length / 2);
  return [
    { name: 'root', isRoot: true, template: { Resources: Object.fromEntries(entries.slice(0, half)) } },
    { name: 'Overflow', isRoot: false, template: { Resources: Object.fromEntries(entries.slice(half)) } },
  ];
}

interface LiveState {
  stack?: boolean;
  restApi?: boolean;
  authorizer?: boolean;
  resources?: string[];
  snapshot?: string[] | null;
  snapshotAfterRefresh?: string[];
}

function live(state: LiveState) {
  const { stack = true, restApi = true, authorizer = true, resources = EXPLICIT_API } = state;
  let snapshot = state.snapshot === undefined ? resources : state.snapshot;
  const createDeployment = vi.fn(async () => {
    snapshot = state.snapshotAfterRefresh ?? PROXY_ONLY;
    return 'newdep';
  });
  const aws: LiveReader = {
    getStackResourceId: vi.fn(async (stackName: string, logicalId: string) => {
      expect(stackName).toBe('wwe-2k-league-api-devtest');
      if (!stack) return null;
      if (logicalId === 'ApiGatewayRestApi') return restApi ? 'api123' : null;
      if (logicalId === 'AdminAuthorizerApiGatewayAuthorizer') return authorizer ? 'auth1' : null;
      return null;
    }),
    getResourcePaths: vi.fn(async () => resources),
    getStageSnapshotPaths: vi.fn(async () => snapshot),
    createDeployment,
  };
  return { aws, createDeployment };
}

const gate = (template: Template, state: LiveState, dryRun = false) => {
  const { aws, createDeployment } = live(state);
  return runCutoverGate({ stage: 'devtest', templates: packaged(template), aws, dryRun }).then((result) => ({
    ...result,
    createDeployment,
  }));
};

const failureText = (result: GateResult) => result.messages[result.messages.length - 1];

describe('check-api-cutover: first deploy of a stage', () => {
  it('passes when the stack does not exist', async () => {
    const result = await gate(pre2a, { stack: false });
    expect(result.ok).toBe(true);
  });

  it('passes when the stack has no RestApi', async () => {
    const result = await gate(deploy2b, { restApi: false });
    expect(result.ok).toBe(true);
  });
});

describe('check-api-cutover: today and PR 1', () => {
  it('passes a pre-2a template over a pre-2a stage', async () => {
    const result = await gate(pre2a, { authorizer: true, resources: EXPLICIT_API });
    expect(result.ok).toBe(true);
    expect(result.createDeployment).not.toHaveBeenCalled();
  });

  it('passes a 2a template over a pre-2a stage (the 2a deploy)', async () => {
    const result = await gate(deploy2a, { authorizer: true, resources: EXPLICIT_API });
    expect(result.ok).toBe(true);
  });
});

describe('check-api-cutover: check A', () => {
  it('fails an explicit Method over a proxy-only API while the live authorizer exists', async () => {
    const result = await gate(pre2a, { authorizer: true, resources: PROXY_ONLY });
    expect(result.ok).toBe(false);
    expect(failureText(result)).toMatch(/^Check A failed: template re-adds explicit API routes over a proxy-only stage/);
    expect(failureText(result)).toContain('ApiGatewayMethodPlayersGet');
  });

  it('does not fire once the live authorizer is absent; check C fires for that template instead', async () => {
    const result = await gate(pre2a, { authorizer: false, resources: PROXY_ONLY });
    expect(result.ok).toBe(false);
    expect(failureText(result)).toMatch(/^Check C failed/);
  });

  it('passes a post-2b template with an explicit Method and no authorizer', async () => {
    const result = await gate(post2bSlowRoute, { authorizer: false, resources: [...PROXY_ONLY, '/slow-route'] });
    expect(result.ok).toBe(true);
  });

  it('passes a 2a template redeployed over a 2a stage', async () => {
    const result = await gate(deploy2a, { authorizer: true, resources: PROXY_ONLY });
    expect(result.ok).toBe(true);
  });
});

describe('check-api-cutover: check B', () => {
  it('fails the first 2b deploy when the live API still has explicit routes', async () => {
    const result = await gate(deploy2b, { authorizer: true, resources: EXPLICIT_API });
    expect(result.ok).toBe(false);
    expect(failureText(result)).toMatch(/deploy 2a to this stage first/);
    expect(result.createDeployment).not.toHaveBeenCalled();
  });

  it('passes the first 2b deploy over a proxy-only API and snapshot', async () => {
    const result = await gate(deploy2b, { authorizer: true, resources: PROXY_ONLY, snapshot: PROXY_ONLY });
    expect(result.ok).toBe(true);
    expect(result.createDeployment).not.toHaveBeenCalled();
  });

  it('refreshes a stale stage snapshot once, then passes', async () => {
    const result = await gate(deploy2b, { authorizer: true, resources: PROXY_ONLY, snapshot: EXPLICIT_API });
    expect(result.ok).toBe(true);
    expect(result.createDeployment).toHaveBeenCalledTimes(1);
    expect(result.createDeployment).toHaveBeenCalledWith('api123', 'devtest', expect.any(String));
  });

  it('fails when the snapshot is still not proxy-only after the refresh', async () => {
    const result = await gate(deploy2b, {
      authorizer: true,
      resources: PROXY_ONLY,
      snapshot: EXPLICIT_API,
      snapshotAfterRefresh: EXPLICIT_API,
    });
    expect(result.ok).toBe(false);
    expect(result.createDeployment).toHaveBeenCalledTimes(1);
    expect(failureText(result)).toMatch(/after a refresh/);
  });

  it('never calls create-deployment on a dry run', async () => {
    const result = await gate(deploy2b, { authorizer: true, resources: PROXY_ONLY, snapshot: EXPLICIT_API }, true);
    expect(result.ok).toBe(false);
    expect(result.createDeployment).not.toHaveBeenCalled();
    expect(failureText(result)).toMatch(/Dry run/);
  });

  it('does not run when the live authorizer is absent, even with extra live resources', async () => {
    const result = await gate(deploy2b, {
      authorizer: false,
      resources: [...PROXY_ONLY, '/slow-route'],
      snapshot: [...PROXY_ONLY, '/slow-route'],
    });
    expect(result.ok).toBe(true);
    expect(result.createDeployment).not.toHaveBeenCalled();
  });
});

describe('check-api-cutover: check C', () => {
  it('fails a template with the authorizer over a stage that has run 2b', async () => {
    const result = await gate(deploy2a, { authorizer: false, resources: PROXY_ONLY });
    expect(result.ok).toBe(false);
    expect(failureText(result)).toBe(
      'Check C failed: template predates INFRA-207 2b on a stage that has run 2b: rebase onto main.',
    );
  });

  it('passes a 2b template over a stage that has run 2b', async () => {
    const result = await gate(deploy2b, { authorizer: false, resources: PROXY_ONLY });
    expect(result.ok).toBe(true);
  });
});

describe('check-api-cutover: CLI reader', () => {
  it('maps the aws CLI responses', async () => {
    const calls: string[][] = [];
    const run = (args: string[]): unknown => {
      calls.push(args);
      if (args[1] === 'get-resources') return { items: [{ path: '/' }, { path: '/{proxy+}' }] };
      if (args[1] === 'get-stage') return { deploymentId: 'dep1' };
      if (args[1] === 'get-deployment') return { id: 'dep1', apiSummary: { '/{proxy+}': {}, '/': {} } };
      if (args[1] === 'create-deployment') return { id: 'dep2' };
      return { StackResourceDetail: { PhysicalResourceId: 'api123', ResourceStatus: 'UPDATE_COMPLETE' } };
    };
    const reader = createCliReader(run);

    expect(await reader.getStackResourceId('s', 'ApiGatewayRestApi')).toBe('api123');
    expect(await reader.getResourcePaths('api123')).toEqual(['/', '/{proxy+}']);
    expect(await reader.getStageSnapshotPaths('api123', 'devtest')).toEqual(['/{proxy+}', '/']);
    expect(await reader.createDeployment('api123', 'devtest', 'refresh')).toBe('dep2');
    expect(calls.find((args) => args[1] === 'get-deployment')).toEqual([
      'apigateway', 'get-deployment', '--rest-api-id', 'api123', '--deployment-id', 'dep1', '--embed', 'apisummary',
    ]);
  });
});
