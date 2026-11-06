#!/usr/bin/env node
'use strict';

/**
 * Fails when the generated root CloudFormation template has a dependency cycle
 * between its resources. CloudFormation only reports one at deploy time, and
 * stacks-map.js alone cannot show one, so this reads the packaged output.
 *
 * Usage: npx serverless package --stage <stage> && node scripts/check-stack-cycles.js [template]
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_TEMPLATE = '.serverless/cloudformation-template-update-stack.json';
const PSEUDO_SUB_VARIABLE = /\$\{(?!!)([A-Za-z0-9]+)(?:\.[^}]*)?\}/g;

/** Logical IDs referenced by Ref, Fn::GetAtt and Fn::Sub anywhere in `node`. */
function collectReferences(node, found = new Set()) {
  if (Array.isArray(node)) {
    node.forEach((item) => collectReferences(item, found));
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'Ref' && typeof value === 'string') {
        found.add(value);
      } else if (key === 'Fn::GetAtt') {
        found.add(Array.isArray(value) ? value[0] : String(value).split('.')[0]);
      } else if (key === 'Fn::Sub') {
        const text = Array.isArray(value) ? value[0] : value;
        for (const match of String(text).matchAll(PSEUDO_SUB_VARIABLE)) found.add(match[1]);
        if (Array.isArray(value)) collectReferences(value[1], found);
      } else {
        collectReferences(value, found);
      }
    }
  }
  return found;
}

/** Each resource's dependencies on other resources in the template. */
function buildDependencyGraph(template) {
  const resources = template.Resources || {};
  const graph = new Map();
  for (const [logicalId, resource] of Object.entries(resources)) {
    const dependsOn = [].concat(resource.DependsOn || []);
    const references = collectReferences({ ...resource, DependsOn: undefined });
    const dependencies = [...dependsOn, ...references].filter(
      (id) => id !== logicalId && id in resources,
    );
    graph.set(logicalId, new Set(dependencies));
  }
  return graph;
}

/** The first dependency cycle found, as a list of logical IDs, or null. */
function findCycle(graph) {
  const finished = new Set();
  const active = new Set();

  for (const start of graph.keys()) {
    if (finished.has(start)) continue;
    const trail = [];
    const stack = [{ id: start, pending: [...graph.get(start)] }];
    active.add(start);
    trail.push(start);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const next = frame.pending.pop();
      if (next === undefined) {
        stack.pop();
        trail.pop();
        active.delete(frame.id);
        finished.add(frame.id);
      } else if (active.has(next)) {
        return [...trail.slice(trail.indexOf(next)), next];
      } else if (!finished.has(next)) {
        active.add(next);
        trail.push(next);
        stack.push({ id: next, pending: [...graph.get(next)] });
      }
    }
  }
  return null;
}

function main() {
  const templatePath = path.resolve(process.argv[2] || DEFAULT_TEMPLATE);
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  const cycle = findCycle(buildDependencyGraph(template));
  if (cycle) {
    console.error(`Circular dependency in ${templatePath}: ${cycle.join(' -> ')}`);
    process.exit(1);
  }
  console.log(`No dependency cycles in ${Object.keys(template.Resources || {}).length} root resources.`);
}

if (require.main === module) main();

module.exports = { buildDependencyGraph, findCycle };
