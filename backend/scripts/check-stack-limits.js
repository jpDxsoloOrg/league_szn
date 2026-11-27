#!/usr/bin/env node
'use strict';

/**
 * Fails when a packaged CloudFormation template is close to a hard limit:
 * 500 resources or 200 parameters/outputs per stack. serverless-plugin-split-stacks
 * does not count parameters, and stacks-map.js alone cannot show the totals,
 * so this reads the packaged output in .serverless/.
 *
 * ROOT_MAX was 485 in INFRA-207 PR 1 (a "must not grow" check: the live root
 * held 478 resources and the plugin pins deployed resources in place). From
 * deploy 2a it is 450: 2a drops the 281 Methods and 44 Resources root held,
 * so the packaged 2a root must already pass at 450.
 * See docs/plans/plan-infra-207-api-simplification.md section 7.1.
 *
 * Usage: npx serverless package --stage <stage> && node scripts/check-stack-limits.js [dir]
 */

const fs = require('fs');
const path = require('path');

const ROOT_MAX = 450;
const NESTED_MAX = 450;
const MAX_PARAMETERS = 180;
const MAX_OUTPUTS = 180;

const DEFAULT_DIR = '.serverless';
const ROOT_TEMPLATE = 'cloudformation-template-update-stack.json';
const NESTED_TEMPLATE = /^cloudformation-template-(.+)-nested-stack\.json$/;

/** The packaged root template and every nested template in `dir`, as { name, isRoot, template }. */
function loadPackagedTemplates(dir) {
  const rootPath = path.join(dir, ROOT_TEMPLATE);
  if (!fs.existsSync(rootPath)) {
    throw new Error(`No packaged root template at ${rootPath}. Run npx serverless package first.`);
  }
  const templates = [{ name: 'root', isRoot: true, template: JSON.parse(fs.readFileSync(rootPath, 'utf8')) }];
  for (const file of fs.readdirSync(dir).sort()) {
    const match = NESTED_TEMPLATE.exec(file);
    if (match) {
      templates.push({
        name: match[1],
        isRoot: false,
        template: JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')),
      });
    }
  }
  return templates;
}

const count = (section) => Object.keys(section || {}).length;

/** Per-stack counts and the list of limit violations. */
function checkStackLimits(templates, limits = {}) {
  const rootMax = limits.rootMax ?? ROOT_MAX;
  const nestedMax = limits.nestedMax ?? NESTED_MAX;
  const maxParameters = limits.maxParameters ?? MAX_PARAMETERS;
  const maxOutputs = limits.maxOutputs ?? MAX_OUTPUTS;

  const rows = [];
  const failures = [];
  for (const { name, isRoot, template } of templates) {
    const row = {
      name,
      resources: count(template.Resources),
      parameters: count(template.Parameters),
      outputs: count(template.Outputs),
      resourceMax: isRoot ? rootMax : nestedMax,
    };
    rows.push(row);
    if (row.resources > row.resourceMax) {
      failures.push(`${name}: ${row.resources} resources (max ${row.resourceMax})`);
    }
    if (row.parameters > maxParameters) {
      failures.push(`${name}: ${row.parameters} parameters (max ${maxParameters})`);
    }
    if (row.outputs > maxOutputs) {
      failures.push(`${name}: ${row.outputs} outputs (max ${maxOutputs})`);
    }
  }
  return { rows, failures };
}

function main() {
  const dir = path.resolve(process.argv[2] || DEFAULT_DIR);
  const { rows, failures } = checkStackLimits(loadPackagedTemplates(dir));
  for (const row of rows) {
    console.log(
      `${row.name.padEnd(14)} resources ${String(row.resources).padStart(3)}/${row.resourceMax}` +
        `  parameters ${String(row.parameters).padStart(3)}/${MAX_PARAMETERS}` +
        `  outputs ${String(row.outputs).padStart(3)}/${MAX_OUTPUTS}`,
    );
  }
  if (failures.length > 0) {
    console.error('Stack limits exceeded:');
    for (const failure of failures) console.error(`  ${failure}`);
    console.error('Route new resource types in stacks-map.js before deploying (INFRA-207).');
    process.exit(1);
  }
  console.log('All stacks are within limits.');
}

if (require.main === module) main();

module.exports = {
  ROOT_MAX,
  NESTED_MAX,
  MAX_PARAMETERS,
  MAX_OUTPUTS,
  loadPackagedTemplates,
  checkStackLimits,
};
