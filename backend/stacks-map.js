'use strict';

/**
 * Custom migration map for serverless-plugin-split-stacks.
 *
 * Why this exists: the root CloudFormation stack hit the hard 500-resource
 * limit (502 after adding one Lambda). The plugin's default per-type map
 * only migrates a few resource types (ApiGateway::Resource -> API,
 * Lambda::Version -> Versions, Lambda::Permission -> Permissions, ...), so
 * every NEW Lambda function, log group, and API method still landed in the
 * root stack, which grew with each endpoint until it hit the cap.
 *
 * How it works: the plugin only ever migrates resources that are NOT yet
 * deployed (migrate-existing-resources.js keeps deployed resources in
 * whichever stack they already live in). That means this map:
 *   - never moves an existing resource, so there is zero delete/recreate
 *     risk for the live dev and prod stacks;
 *   - routes every NEW resource of the types below into the shared
 *     "Overflow" nested stack, so the root stack stops growing;
 *   - on a completely fresh deploy (new stage), everything counts as new
 *     and shards cleanly from the start.
 *
 * Everything goes to ONE Overflow stack (not per-type stacks) because each
 * nested stack is itself a root resource — with root at the limit, per-type
 * destinations would eat the very slots they free.
 *
 * AWS::ApiGateway::Deployment is included deliberately: serverless gives it
 * a new logical ID on every deploy, so it always counts as "new" and can be
 * routed out of root safely — that is what buys root its slack below 500.
 * Its DependsOn on the API methods is preserved by the plugin as a
 * DependsOn from the Overflow stack onto the root-stack methods.
 *
 * allowSuffix lets the plugin roll over to Overflow2, Overflow3, ... when a
 * stack fills (>= 500 resources or >= 200 outputs). Each rollover costs one
 * root slot, but a stack holds roughly 80-100 endpoints' worth of resources
 * so rollovers are rare.
 *
 * CAUTION:
 *   - Root sits just under the 500 limit. A new resource type not covered
 *     here or by the plugin defaults (a new S3 bucket, Cognito group, etc.
 *     added under `resources:`) lands in root and may fail the deploy —
 *     add a route for it here BEFORE deploying.
 *   - Never change routes in a way that would move already-deployed
 *     resources, and never use `force: true`: moving a deployed resource
 *     means delete + recreate, which conflicts for anything with a fixed
 *     name (functions, log groups, tables, API paths).
 *   - The plugin does not count the 200-parameter-per-stack limit when
 *     deciding a stack is full. If a deploy fails with a parameter-count
 *     error on the Overflow stack, point these types at a fresh destination
 *     name (e.g. 'OverflowB') — that only affects NEW resources.
 */

const OVERFLOW = { destination: 'Overflow', allowSuffix: true };

const ROUTES = {
  'AWS::ApiGateway::Method': OVERFLOW,
  'AWS::ApiGateway::Resource': OVERFLOW,
  'AWS::ApiGateway::Deployment': OVERFLOW,
  'AWS::Lambda::Function': OVERFLOW,
  'AWS::Logs::LogGroup': OVERFLOW,
  // Safe for NEW tables only — existing tables are never moved (see above).
  'AWS::DynamoDB::Table': OVERFLOW,
};

module.exports = (resource) => {
  // Returning undefined falls through to the plugin's default per-type map.
  return ROUTES[resource.Type];
};
