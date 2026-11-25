'use strict';

/**
 * INFRA-207 PR 2a only: the legacy-bridge resources file.
 *
 * Deploy 2a removes every explicit http event, so Serverless stops emitting
 * the per-function `<Fn>LambdaPermissionApiGateway` resources and the gateway
 * authorizer. Left alone, CloudFormation would delete them in the cleanup
 * phase while the stage still serves the pre-2a deployment snapshot, whose
 * explicit routes call those functions through those permissions (plan
 * section 4). This file re-declares them under their EXISTING logical IDs, in
 * the same root form Serverless generated, so CloudFormation sees no change:
 * serverless-plugin-split-stacks pins each one to the stack it lives in today
 * (root, PermissionsNestedStack or OverflowNestedStack) and rewrites the
 * references to nested-stack parameters exactly as before.
 *
 * Properties were copied from the live devtest and prod templates
 * (`aws cloudformation get-template`, root and every nested stack, 2026-11-24);
 * both stages are identical for every resource they share.
 * scripts/diff-live-template.js, run by deploy-dev.yml and deploy-prod.yml
 * before `serverless deploy`, fails the deploy if any of them drifts from live
 * or moves stack.
 *
 * Deploy 2b deletes this file, its `resources:` entry in serverless.yml, the
 * legacy functions and the authorizer.
 * See docs/plans/plan-infra-207-api-simplification.md sections 4 and 6.
 */

/**
 * Functions that served explicit http events before 2a, as named in
 * serverless.yml (generated from the pre-2a function set). `login` is not
 * here: 2a deletes it with its function.
 */
const LEGACY_HTTP_FUNCTIONS = Object.freeze([
  'createAdminUser',
  'users',
  'admin',
  'players',
  'overalls',
  'transfers',
  'storylineRequests',
  'matches',
  'championships',
  'tournaments',
  'getDashboard',
  'getStandings',
  'activity',
  'seasons',
  'seasonAwards',
  'companies',
  'shows',
  'locations',
  'divisions',
  'wrestlers',
  'stipulations',
  'matchTypes',
  'events',
  'contenders',
  'progression',
  'generateUploadUrl',
  'serveSwaggerUi',
  'serveOpenApiSpec',
  'getStatistics',
  'getRivalries',
  'getRivalryActivity',
  'rivalryMessages',
  'rivalryNotes',
  'rivalryRequests',
  'contracts',
  'injuries',
  'challenges',
  'promos',
  'stables',
  'tagTeams',
  'videos',
  'announcements',
  'notifications',
]);

const AUTHORIZER_FUNCTION = 'adminAuthorizer';
const AUTHORIZER_LOGICAL_ID = 'AdminAuthorizerApiGatewayAuthorizer';

/** Serverless's function logical-ID prefix: `getStandings` -> `GetStandings`. */
function normalizeName(functionName) {
  return `${functionName.charAt(0).toUpperCase()}${functionName.slice(1)}`
    .replace(/-/g, 'Dash')
    .replace(/_/g, 'Underscore');
}

const functionLogicalId = (functionName) => `${normalizeName(functionName)}LambdaFunction`;
const permissionLogicalId = (functionName) => `${normalizeName(functionName)}LambdaPermissionApiGateway`;

/** `arn:<partition>:execute-api:<region>:<account>:<RestApi>/*\/*`, as Serverless writes it. */
const executeApiSourceArn = () => ({
  'Fn::Join': [
    '',
    [
      'arn:',
      { Ref: 'AWS::Partition' },
      ':execute-api:',
      { Ref: 'AWS::Region' },
      ':',
      { Ref: 'AWS::AccountId' },
      ':',
      { Ref: 'ApiGatewayRestApi' },
      '/*/*',
    ],
  ],
});

/** The API Gateway invoke permission Serverless generated for an http function. */
function apiGatewayPermission(functionName) {
  return {
    Type: 'AWS::Lambda::Permission',
    Properties: {
      FunctionName: { 'Fn::GetAtt': [functionLogicalId(functionName), 'Arn'] },
      Action: 'lambda:InvokeFunction',
      Principal: 'apigateway.amazonaws.com',
      SourceArn: executeApiSourceArn(),
    },
  };
}

/** The TOKEN authorizer Serverless generated for `authorizer: adminAuthorizer`. */
function adminAuthorizer() {
  return {
    Type: 'AWS::ApiGateway::Authorizer',
    // Live has an empty DependsOn (Serverless's `DependsOn: authorizer.logicalId`,
    // emptied by split-stacks). Kept so the resource is byte-identical.
    DependsOn: [],
    Properties: {
      IdentitySource: 'method.request.header.Authorization',
      Name: AUTHORIZER_FUNCTION,
      RestApiId: { Ref: 'ApiGatewayRestApi' },
      AuthorizerUri: {
        'Fn::Join': [
          '',
          [
            'arn:',
            { Ref: 'AWS::Partition' },
            ':apigateway:',
            { Ref: 'AWS::Region' },
            ':lambda:path/2015-03-31/functions/',
            { 'Fn::GetAtt': [functionLogicalId(AUTHORIZER_FUNCTION), 'Arn'] },
            '/invocations',
          ],
        ],
      },
      Type: 'TOKEN',
    },
  };
}

/** The `Resources` fragment merged into serverless.yml `resources:`. */
function buildLegacyBridge() {
  const resources = {};
  for (const functionName of LEGACY_HTTP_FUNCTIONS) {
    resources[permissionLogicalId(functionName)] = apiGatewayPermission(functionName);
  }
  resources[AUTHORIZER_LOGICAL_ID] = adminAuthorizer();
  resources[permissionLogicalId(AUTHORIZER_FUNCTION)] = apiGatewayPermission(AUTHORIZER_FUNCTION);
  return { Resources: resources };
}

// Serverless's ${file(...)} calls an exported function and merges its result,
// so the helpers below ride on the function instead of the merged object.
module.exports = () => buildLegacyBridge();
module.exports.LEGACY_HTTP_FUNCTIONS = LEGACY_HTTP_FUNCTIONS;
module.exports.AUTHORIZER_FUNCTION = AUTHORIZER_FUNCTION;
module.exports.AUTHORIZER_LOGICAL_ID = AUTHORIZER_LOGICAL_ID;
module.exports.buildLegacyBridge = buildLegacyBridge;
module.exports.permissionLogicalId = permissionLogicalId;
