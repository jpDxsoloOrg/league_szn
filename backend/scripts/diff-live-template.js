#!/usr/bin/env node
'use strict';

/**
 * INFRA-207 deploy 2a pre-deploy check (read-only). Compares the packaged
 * templates in .serverless/ with the live root stack and every live nested
 * stack (`aws cloudformation get-template`; nested stack names come from
 * `list-stack-resources` on the root), and prints the added, removed and
 * changed logical IDs per stack.
 *
 * It fails when:
 *   1. an AWS::Lambda::Permission, AWS::ApiGateway::Authorizer or
 *      AWS::Lambda::Function is removed, or moves to a different stack
 *      (login's Function and Permission are the only allowed removals);
 *   2. a bridged resource (legacy-bridge.js: the API Gateway permissions and
 *      the authorizer) has Properties that differ from live, after normalizing
 *      Fn::GetAtt string/array forms and the nested-stack Parameters/Ref and
 *      Outputs plumbing. Identical Properties cannot trigger a replacement.
 *      A bridged resource that is not live fails too, unless it is a
 *      permission whose target function is also new in the packaged templates
 *      (a stage that lags main gets the function and its permission together);
 *   3. anything is removed other than API Gateway Methods and Resources, the
 *      APINestedStack, login's Function/LogGroup/Permission, the per-deploy
 *      API Gateway Deployment and any AWS::Lambda::Version (their logical IDs
 *      are code hashes and they are DeletionPolicy: Retain).
 *
 * VersionsNestedStack is skipped entirely: its Versions, Parameters and
 * Outputs churn with the code hash on every deploy.
 *
 * Both deploy workflows run it after `serverless package` and before
 * `serverless deploy` while the bridge exists (2a until 2b), so a failure
 * blocks the deploy.
 *
 * This replaces a CloudFormation change set, which would need the nested
 * templates uploaded to the deployment bucket (a mutation).
 * See docs/plans/plan-infra-207-api-simplification.md section 6, PR 2a.
 *
 * Usage: npx serverless package --stage <stage> &&
 *   node scripts/diff-live-template.js --stage <stage> [--dir .serverless]
 *     [--service wwe-2k-league-api] [--region us-east-1] [--profile p]
 */

const path = require('path');
const { loadPackagedTemplates } = require('./check-stack-limits');
const { createAwsCli, isNotFound, parseArgs } = require('./aws-cli');
const legacyBridge = require('../legacy-bridge');

const DEFAULT_SERVICE = 'wwe-2k-league-api';
const ROOT = 'root';
const SKIPPED_STACKS = new Set(['VersionsNestedStack']);

/** Types whose removal or move between stacks fails the check (rule 1). */
const PROTECTED_TYPES = new Set(['AWS::Lambda::Permission', 'AWS::ApiGateway::Authorizer', 'AWS::Lambda::Function']);

/** Types 2a may remove (rule 3). */
const REMOVABLE_TYPES = new Set([
  'AWS::ApiGateway::Method',
  'AWS::ApiGateway::Resource',
  'AWS::ApiGateway::Deployment',
  'AWS::Lambda::Version',
]);

/** Logical IDs 2a may remove whatever their type: the deleted login function, and the API nested stack. */
const REMOVABLE_IDS = new Set([
  'LoginLambdaFunction',
  'LoginLogGroup',
  'LoginLambdaPermissionApiGateway',
  'APINestedStack',
]);

/** Logical IDs whose Properties must equal live exactly (rule 2). */
const BRIDGED_IDS = new Set(Object.keys(legacyBridge.buildLegacyBridge().Resources));

const nestedStackId = (name) => (name === ROOT ? ROOT : `${name}NestedStack`);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Builds a resolver for one side (live or packaged). `stacks` maps a stack ID
 * (`root` or `<Name>NestedStack`) to its template. A nested template sees the
 * root through its Parameters (set on the root's nested-stack resource) and
 * other nested stacks through `Fn::GetAtt [<Stack>, Outputs.<Name>]`; both are
 * replaced by the root-level expression they carry.
 */
function createNormalizer(stacks) {
  const root = stacks.get(ROOT) || { Resources: {} };

  function normalize(value, stackId, depth = 0) {
    if (depth > 20) return value;
    if (Array.isArray(value)) return value.map((item) => normalize(item, stackId, depth));
    if (!isObject(value)) return value;

    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === 'Fn::GetAtt') {
      const raw = value['Fn::GetAtt'];
      const parts = typeof raw === 'string'
        ? [raw.slice(0, raw.indexOf('.')), raw.slice(raw.indexOf('.') + 1)]
        : raw;
      const [target, attribute] = parts;
      // A reference to another nested stack's output: follow it to its Value.
      if (typeof attribute === 'string' && attribute.startsWith('Outputs.') && stacks.has(target)) {
        const output = (stacks.get(target).Outputs || {})[attribute.slice('Outputs.'.length)];
        if (output) return normalize(output.Value, target, depth + 1);
      }
      return { 'Fn::GetAtt': [target, attribute] };
    }
    if (keys.length === 1 && keys[0] === 'Ref' && stackId !== ROOT) {
      const template = stacks.get(stackId) || {};
      const name = value.Ref;
      if ((template.Parameters || {})[name]) {
        const parent = (root.Resources || {})[stackId];
        const passed = parent && parent.Properties && (parent.Properties.Parameters || {})[name];
        if (passed !== undefined) return normalize(passed, ROOT, depth + 1);
      }
      return value;
    }
    return Object.fromEntries(keys.map((key) => [key, normalize(value[key], stackId, depth)]));
  }

  return normalize;
}

/** logicalId -> { stack, resource } over every stack except the skipped ones. */
function indexResources(stacks) {
  const index = new Map();
  for (const [stackId, template] of stacks) {
    if (SKIPPED_STACKS.has(stackId)) continue;
    for (const [logicalId, resource] of Object.entries(template.Resources || {})) {
      index.set(logicalId, { stack: stackId, resource });
    }
  }
  return index;
}

const stableJson = (value) => JSON.stringify(value);

/**
 * The logical ID of the function an AWS::Lambda::Permission points at
 * (`FunctionName: Fn::GetAtt [<Fn>, Arn]` after normalizing nested-stack
 * plumbing), or null for any other resource or shape.
 */
function permissionTarget({ stack, resource }, normalize) {
  if (resource.Type !== 'AWS::Lambda::Permission') return null;
  const functionName = normalize((resource.Properties || {}).FunctionName, stack);
  const getAtt = isObject(functionName) ? functionName['Fn::GetAtt'] : undefined;
  return Array.isArray(getAtt) && getAtt[1] === 'Arn' && typeof getAtt[0] === 'string' ? getAtt[0] : null;
}

/**
 * Compares the live and packaged stacks (each a Map of stack ID -> template).
 * Returns { report: per-stack added/removed/changed, failures: string[] }.
 */
function diffTemplates(live, packaged) {
  const liveIndex = indexResources(live);
  const packagedIndex = indexResources(packaged);
  const normalizeLive = createNormalizer(live);
  const normalizePackaged = createNormalizer(packaged);
  const failures = [];
  const report = new Map();
  const rowFor = (stackId) => {
    if (!report.has(stackId)) report.set(stackId, { added: [], removed: [], changed: [] });
    return report.get(stackId);
  };

  for (const [logicalId, { stack, resource }] of liveIndex) {
    const now = packagedIndex.get(logicalId);
    const type = resource.Type;
    if (now && now.stack === stack) continue;

    rowFor(stack).removed.push(logicalId);
    if (now) rowFor(now.stack).added.push(logicalId);
    const where = now ? `moves ${stack} -> ${now.stack}` : `removed from ${stack}`;

    if (PROTECTED_TYPES.has(type) && !(REMOVABLE_IDS.has(logicalId) && !now)) {
      failures.push(`${logicalId} (${type}) ${where}`);
      continue;
    }
    if (now) {
      failures.push(`${logicalId} (${type}) ${where}: a move deletes and recreates it`);
      continue;
    }
    if (!REMOVABLE_TYPES.has(type) && !REMOVABLE_IDS.has(logicalId)) {
      failures.push(`${logicalId} (${type}) ${where}`);
    }
  }

  for (const [logicalId, { stack, resource }] of packagedIndex) {
    const before = liveIndex.get(logicalId);
    if (!before) {
      rowFor(stack).added.push(logicalId);
      continue;
    }
    if (before.stack !== stack) continue; // reported as a move above
    const liveProperties = normalizeLive(before.resource.Properties || {}, before.stack);
    const packagedProperties = normalizePackaged(resource.Properties || {}, stack);
    const sameType = before.resource.Type === resource.Type;
    if (sameType && stableJson(liveProperties) === stableJson(packagedProperties)) continue;

    rowFor(stack).changed.push(logicalId);
    if (BRIDGED_IDS.has(logicalId)) {
      failures.push(
        `${logicalId} (bridged) differs from live in ${stack}:\n` +
          `      live:     ${stableJson(liveProperties)}\n` +
          `      packaged: ${stableJson(packagedProperties)}`,
      );
    } else if (!sameType) {
      failures.push(`${logicalId} changes type ${before.resource.Type} -> ${resource.Type}`);
    }
  }

  for (const id of BRIDGED_IDS) {
    const packagedEntry = packagedIndex.get(id);
    if (!packagedEntry || liveIndex.has(id)) continue;
    // A stage that lags main may not have the function yet (prod before the
    // contracts or injuries release): 2a then creates the function and its
    // bridged permission together, which removes nothing the live snapshot uses.
    const target = permissionTarget(packagedEntry, normalizePackaged);
    if (target && packagedIndex.has(target) && !liveIndex.has(target)) continue;
    failures.push(`${id} (bridged) is not live: it would be created, not kept`);
  }

  return { report, failures };
}

/** Parses a get-template TemplateBody, which the CLI returns as an object or a JSON string. */
function parseTemplateBody(body) {
  return typeof body === 'string' ? JSON.parse(body) : body;
}

/**
 * The live root and nested templates of `stackName`, as a Map of stack ID ->
 * template, or null when the stack does not exist (first deploy of a stage).
 * `run` is the aws CLI reader from aws-cli.js (read-only calls).
 */
function loadLiveTemplates(run, stackName) {
  const getTemplate = (name) => parseTemplateBody(
    run(['cloudformation', 'get-template', '--stack-name', name, '--template-stage', 'Original']).TemplateBody,
  );
  let rootTemplate;
  try {
    rootTemplate = getTemplate(stackName);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  const stacks = new Map([[ROOT, rootTemplate]]);
  const listed = run(['cloudformation', 'list-stack-resources', '--stack-name', stackName]);
  for (const summary of (listed && listed.StackResourceSummaries) || []) {
    if (summary.ResourceType !== 'AWS::CloudFormation::Stack') continue;
    if (summary.ResourceStatus === 'DELETE_COMPLETE' || SKIPPED_STACKS.has(summary.LogicalResourceId)) continue;
    stacks.set(summary.LogicalResourceId, getTemplate(summary.PhysicalResourceId));
  }
  return stacks;
}

/** The packaged templates in `dir`, as a Map of stack ID -> template. */
function loadPackagedStacks(dir) {
  return new Map(loadPackagedTemplates(dir).map(({ name, template }) => [nestedStackId(name), template]));
}

function printReport(report) {
  const stackIds = [...report.keys()].sort((a, b) => (a === ROOT ? -1 : b === ROOT ? 1 : a.localeCompare(b)));
  for (const stackId of stackIds) {
    const { added, removed, changed } = report.get(stackId);
    console.log(`${stackId}: +${added.length} -${removed.length} ~${changed.length}`);
    for (const [label, ids] of [['added', added], ['removed', removed], ['changed', changed]]) {
      if (ids.length > 0) console.log(`  ${label}: ${[...ids].sort().join(', ')}`);
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.stage || options.stage === true) {
    console.error('Usage: node scripts/diff-live-template.js --stage <stage> [--dir .serverless]');
    process.exit(2);
  }
  const service = typeof options.service === 'string' ? options.service : DEFAULT_SERVICE;
  const dir = path.resolve(typeof options.dir === 'string' ? options.dir : '.serverless');
  const run = createAwsCli({
    region: typeof options.region === 'string' ? options.region : process.env.AWS_REGION || 'us-east-1',
    profile: typeof options.profile === 'string' ? options.profile : undefined,
  });

  const stackName = `${service}-${options.stage}`;
  const live = loadLiveTemplates(run, stackName);
  if (!live) {
    console.log(`No live stack ${stackName}: first deploy of this stage, nothing to diff.`);
    return;
  }
  const { report, failures } = diffTemplates(live, loadPackagedStacks(dir));
  console.log(`Packaged templates vs live ${stackName} (VersionsNestedStack skipped):`);
  printReport(report);
  if (failures.length > 0) {
    console.error(`\n${failures.length} problem(s), do not deploy:`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log(`\nNo protected resource is removed or moved, and all ${BRIDGED_IDS.size} bridged resources match live.`);
}

if (require.main === module) main();

module.exports = {
  BRIDGED_IDS,
  createNormalizer,
  diffTemplates,
  loadLiveTemplates,
  loadPackagedStacks,
  parseTemplateBody,
  permissionTarget,
};
