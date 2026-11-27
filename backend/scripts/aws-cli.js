'use strict';

/**
 * Thin wrapper around the aws CLI shared by the deploy scripts
 * (check-api-cutover.js, proxy-parity-check.js). Every call asks for JSON
 * output and returns it parsed. Scripts take the reader built here as a
 * parameter, so their unit tests pass a fake instead.
 */

const { execFileSync } = require('child_process');

const NOT_FOUND = /does not exist|NotFoundException|Invalid stage identifier/;

class AwsCliError extends Error {
  constructor(args, stderr) {
    super(`aws ${args.slice(0, 2).join(' ')} failed: ${stderr.trim()}`);
    this.name = 'AwsCliError';
    this.stderr = stderr;
  }
}

/** True when the CLI error means the stack, resource or stage is missing. */
function isNotFound(error) {
  return error instanceof AwsCliError && NOT_FOUND.test(error.stderr);
}

/**
 * Returns run(args) -> parsed JSON (or null for empty output).
 * `exec` defaults to execFileSync and exists for tests.
 */
function createAwsCli({ region, profile, exec = execFileSync } = {}) {
  return function run(args) {
    const fullArgs = [...args, '--output', 'json'];
    if (region) fullArgs.push('--region', region);
    if (profile) fullArgs.push('--profile', profile);
    let stdout;
    try {
      stdout = exec('aws', fullArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
    } catch (error) {
      const stderr = error && error.stderr ? String(error.stderr) : String(error && error.message);
      throw new AwsCliError(args, stderr);
    }
    const text = String(stdout).trim();
    return text ? JSON.parse(text) : null;
  };
}

/** Physical ID of a logical resource in a stack, or null if the stack or resource is missing. */
function describeStackResourceId(run, stackName, logicalId) {
  try {
    const result = run([
      'cloudformation', 'describe-stack-resource',
      '--stack-name', stackName,
      '--logical-resource-id', logicalId,
    ]);
    const detail = result && result.StackResourceDetail;
    if (!detail || detail.ResourceStatus === 'DELETE_COMPLETE') return null;
    return detail.PhysicalResourceId || null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** Every resource of a REST API, as returned by get-resources (the CLI paginates). */
function getApiResources(run, restApiId) {
  const result = run(['apigateway', 'get-resources', '--rest-api-id', restApiId, '--limit', '500']);
  return (result && result.items) || [];
}

/** Command-line flags as { name: value | true }. */
function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const [name, inline] = arg.slice(2).split('=', 2);
    if (inline !== undefined) {
      options[name] = inline;
    } else if (argv[index + 1] !== undefined && !argv[index + 1].startsWith('--')) {
      options[name] = argv[index + 1];
      index += 1;
    } else {
      options[name] = true;
    }
  }
  return options;
}

module.exports = { AwsCliError, isNotFound, createAwsCli, describeStackResourceId, getApiResources, parseArgs };
