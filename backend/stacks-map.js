'use strict';

// Custom migration rules for serverless-plugin-split-stacks.
//
// Runs BEFORE the plugin's built-in `perType` strategy and takes precedence.
// See plugin README: node_modules/serverless-plugin-split-stacks/README.md.
//
// Why this file exists:
//   The root CloudFormation template hit 512 resources — above AWS's 500-per-stack
//   hard limit. The plugin's default perType map moves ApiGateway methods, Lambda
//   permissions, and Lambda versions into nested stacks, but CloudWatch LogGroups
//   stay in root. With ~50 Lambda functions, that's 50 slots we can reclaim by
//   grouping LogGroups into a dedicated nested stack.
//
// About `force: true`:
//   Required to migrate resources that already exist in the root stack. Without
//   force, only future (net-new) LogGroups would move; the existing 50 would
//   remain in root and we'd still be over the limit. Force triggers a
//   CloudFormation delete-and-recreate for each LogGroup on the first deploy
//   after this change lands. The physical log group names stay the same (they
//   follow the `/aws/lambda/{service}-{stage}-{function}` convention), but log
//   events prior to that deploy are dropped. Acceptable for devtest; the same
//   one-time reset applies to prod on its first deploy after merge.

module.exports = {
  'AWS::Logs::LogGroup': {
    destination: 'Logs',
    force: true,
  },
};
