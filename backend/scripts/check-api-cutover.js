#!/usr/bin/env node
'use strict';

/**
 * INFRA-207 API cut-over gate. Runs after `serverless package` and before
 * `serverless deploy`, and compares the packaged templates with the live
 * stack and REST API (read-only, except check B's one stage refresh).
 *
 * - Check A (while the live stack still has the gateway authorizer): fail when
 *   the live API is proxy-only and the packaged templates declare explicit
 *   API Gateway Methods (a pre-2a template over a 2a stage).
 * - Check B (first 2b deploy on a stage: packaged templates lack the authorizer,
 *   the live stack still has it): require a proxy-only live API and a
 *   proxy-only stage snapshot. A stale snapshot is refreshed once with
 *   create-deployment (never with --dry-run), then re-checked.
 * - Check C (live stack lacks the authorizer): fail when the packaged templates
 *   still declare it (a pre-2b template over a stage that has run 2b).
 * - Check D (while the live stack still has the gateway authorizer): fail when
 *   the packaged templates are proxy-only (no explicit Methods) but the live
 *   API has no /{proxy+} resource. That is a 2a (or 2b) template over a stage
 *   that never ran deploy 1, which would create the proxy and remove every
 *   explicit route in one deploy, so the refresh step would move all traffic
 *   onto a router that has never served this stage or been parity-checked.
 * - A missing stack or RestApi (first deploy of a stage) passes every check.
 *
 * See docs/plans/plan-infra-207-api-simplification.md section 7.3.
 *
 * Usage: node scripts/check-api-cutover.js --stage <stage> [--dir .serverless]
 *          [--service wwe-2k-league-api] [--region us-east-1] [--profile p] [--dry-run]
 */

const path = require('path');
const { loadPackagedTemplates } = require('./check-stack-limits');
const { createAwsCli, describeStackResourceId, getApiResources, isNotFound, parseArgs } = require('./aws-cli');

const AUTHORIZER_ID = 'AdminAuthorizerApiGatewayAuthorizer';
const REST_API_ID = 'ApiGatewayRestApi';
const PROXY_METHOD_IDS = new Set(['ApiGatewayMethodProxyVarAny', 'ApiGatewayMethodProxyVarOptions']);
const PROXY_PATH = '/{proxy+}';
const PROXY_ONLY_PATHS = new Set(['/', PROXY_PATH]);
const DEFAULT_SERVICE = 'wwe-2k-league-api';

/** Whether the packaged templates carry the authorizer, and their non-proxy Methods. */
function analyzeTemplates(templates) {
  let hasAuthorizer = false;
  const explicitMethods = [];
  for (const { template } of templates) {
    for (const [logicalId, resource] of Object.entries(template.Resources || {})) {
      if (logicalId === AUTHORIZER_ID) hasAuthorizer = true;
      if (resource && resource.Type === 'AWS::ApiGateway::Method' && !PROXY_METHOD_IDS.has(logicalId)) {
        explicitMethods.push(logicalId);
      }
    }
  }
  return { hasAuthorizer, explicitMethods };
}

/** True when the paths are exactly `/` and `/{proxy+}`. */
function isProxyOnly(paths) {
  const unique = new Set(paths);
  return unique.size === PROXY_ONLY_PATHS.size && [...PROXY_ONLY_PATHS].every((item) => unique.has(item));
}

/** True when every path is `/` or `/{proxy+}` (an empty snapshot qualifies). */
function isProxyOnlySubset(paths) {
  return paths.every((item) => PROXY_ONLY_PATHS.has(item));
}

/**
 * Runs checks A, B, C and D. `aws` is the live-state reader (see createCliReader):
 *   getStackResourceId(stackName, logicalId) -> string | null
 *   getResourcePaths(restApiId) -> string[]
 *   getStageSnapshotPaths(restApiId, stage) -> string[] | null (null: no stage)
 *   createDeployment(restApiId, stage, description) -> string (deployment id)
 * Returns { ok, messages }.
 */
async function runCutoverGate({ stage, service = DEFAULT_SERVICE, templates, aws, dryRun = false, sha = '' }) {
  const messages = [];
  const fail = (message) => ({ ok: false, messages: [...messages, message] });
  const stackName = `${service}-${stage}`;

  const restApiId = await aws.getStackResourceId(stackName, REST_API_ID);
  if (!restApiId) {
    messages.push(`No live stack or RestApi for ${stackName}: first deploy of this stage, all checks pass.`);
    return { ok: true, messages };
  }

  const packaged = analyzeTemplates(templates);
  const liveAuthorizer = Boolean(await aws.getStackResourceId(stackName, AUTHORIZER_ID));
  messages.push(
    `RestApi ${restApiId}; live authorizer ${liveAuthorizer ? 'present' : 'absent'}; ` +
      `packaged authorizer ${packaged.hasAuthorizer ? 'present' : 'absent'}; ` +
      `packaged explicit Methods ${packaged.explicitMethods.length}.`,
  );

  if (!liveAuthorizer) {
    messages.push('Checks A and B do not apply: the live stack has no gateway authorizer.');
    if (packaged.hasAuthorizer) {
      return fail(
        'Check C failed: template predates INFRA-207 2b on a stage that has run 2b: rebase onto main.',
      );
    }
    messages.push('Check C passed.');
    return { ok: true, messages };
  }

  messages.push('Check C does not apply: the live stack still has the gateway authorizer.');
  const livePaths = await aws.getResourcePaths(restApiId);
  const liveProxyOnly = isProxyOnly(livePaths);
  messages.push(`Live API has ${livePaths.length} resources${liveProxyOnly ? ' (proxy-only)' : ''}.`);

  if (packaged.explicitMethods.length === 0 && !livePaths.includes(PROXY_PATH)) {
    return fail(
      `Check D failed: template is proxy-only but the live API has no ${PROXY_PATH} resource. ` +
        'Deploy INFRA-207 PR 1 (proxy alongside the explicit routes) to this stage and run ' +
        'scripts/proxy-parity-check.js on it before deploying 2a.',
    );
  }
  messages.push('Check D passed.');

  if (liveProxyOnly && packaged.explicitMethods.length > 0) {
    return fail(
      'Check A failed: template re-adds explicit API routes over a proxy-only stage (INFRA-207): rebase onto main. ' +
        `Explicit Methods: ${packaged.explicitMethods.slice(0, 5).join(', ')}` +
        `${packaged.explicitMethods.length > 5 ? ', ...' : ''}`,
    );
  }
  messages.push('Check A passed.');

  if (packaged.hasAuthorizer) {
    messages.push('Check B does not apply: the packaged templates still declare the authorizer.');
    return { ok: true, messages };
  }

  if (!liveProxyOnly) {
    return fail('Check B failed: the live API still has explicit routes: deploy 2a to this stage first.');
  }

  const snapshot = (await aws.getStageSnapshotPaths(restApiId, stage)) || [];
  if (isProxyOnlySubset(snapshot)) {
    messages.push('Check B passed: live API and stage snapshot are proxy-only.');
    return { ok: true, messages };
  }

  if (dryRun) {
    return fail(
      `Check B: the ${stage} stage snapshot still lists ${snapshot.length} paths. ` +
        'Dry run, so create-deployment was not called; a real run would refresh the stage once and re-check.',
    );
  }

  const deploymentId = await aws.createDeployment(restApiId, stage, `cut-over gate refresh ${sha}`.trim());
  messages.push(`Stage snapshot listed explicit paths; created deployment ${deploymentId} and re-checking.`);
  const refreshed = (await aws.getStageSnapshotPaths(restApiId, stage)) || [];
  if (!isProxyOnlySubset(refreshed)) {
    return fail(`Check B failed: the ${stage} stage snapshot still lists ${refreshed.length} paths after a refresh.`);
  }
  messages.push('Check B passed after refreshing the stage.');
  return { ok: true, messages };
}

/** Live-state reader backed by the aws CLI. */
function createCliReader(run) {
  return {
    getStackResourceId: async (stackName, logicalId) => describeStackResourceId(run, stackName, logicalId),
    getResourcePaths: async (restApiId) => getApiResources(run, restApiId).map((item) => item.path),
    getStageSnapshotPaths: async (restApiId, stage) => {
      let deploymentId;
      try {
        deploymentId = run(['apigateway', 'get-stage', '--rest-api-id', restApiId, '--stage-name', stage]).deploymentId;
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
      const deployment = run([
        'apigateway', 'get-deployment',
        '--rest-api-id', restApiId,
        '--deployment-id', deploymentId,
        '--embed', 'apisummary',
      ]);
      return Object.keys((deployment && deployment.apiSummary) || {});
    },
    createDeployment: async (restApiId, stage, description) => {
      const result = run([
        'apigateway', 'create-deployment',
        '--rest-api-id', restApiId,
        '--stage-name', stage,
        '--description', description,
      ]);
      return result.id;
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (typeof options.stage !== 'string') {
    console.error('Usage: node scripts/check-api-cutover.js --stage <stage> [--dir .serverless] [--dry-run]');
    process.exit(2);
  }
  const run = createAwsCli({
    region: typeof options.region === 'string' ? options.region : process.env.AWS_REGION || 'us-east-1',
    profile: typeof options.profile === 'string' ? options.profile : undefined,
  });
  const result = await runCutoverGate({
    stage: options.stage,
    service: typeof options.service === 'string' ? options.service : DEFAULT_SERVICE,
    templates: loadPackagedTemplates(path.resolve(typeof options.dir === 'string' ? options.dir : '.serverless')),
    aws: createCliReader(run),
    dryRun: options['dry-run'] === true,
    sha: process.env.GITHUB_SHA || '',
  });
  for (const message of result.messages) (result.ok ? console.log : console.error)(message);
  if (!result.ok) process.exit(1);
  console.log('API cut-over gate passed.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  AUTHORIZER_ID,
  analyzeTemplates,
  isProxyOnly,
  isProxyOnlySubset,
  runCutoverGate,
  createCliReader,
};
