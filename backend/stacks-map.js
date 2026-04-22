'use strict';

// Custom migration rules for serverless-plugin-split-stacks.
//
// Runs BEFORE the plugin's built-in `perType` strategy and takes precedence.
// See plugin README: node_modules/serverless-plugin-split-stacks/README.md.
//
// Why this file exists:
//   The root CloudFormation template hit 512 resources — above AWS's 500-per-stack
//   hard limit. The plugin's default `perType` map moves ApiGateway Resources,
//   Lambda Permissions, and Lambda Versions into nested stacks, but leaves
//   ApiGateway Methods (306 of them here) in root. This file extends that map
//   so Methods also migrate into the existing APINestedStack, freeing enough
//   slots to land this feature and absorb several more before the next rework.
//
// About `force: true`:
//   Required to migrate resources that already exist in the deployed stack.
//   Without force, only future (net-new) resources would move; existing ones
//   remain in root and the 500-limit problem stays unsolved. Force triggers a
//   CloudFormation delete-and-recreate of each matched resource on the first
//   deploy after this change lands.
//
//   For `AWS::ApiGateway::Method`, the delete→create cycle is purely
//   CloudFormation-managed — no external system auto-recreates a Method with a
//   conflicting name, so the migration is deterministic (unlike LogGroups,
//   which Lambda auto-creates on any invocation and therefore cannot be moved
//   safely in a live service). The cost is a brief window during the deploy
//   where individual endpoints may 404 while their Method is being replaced.
//   Acceptable in devtest; schedule as a low-traffic window in prod.
//
//   After the first successful deploy on each stage, Methods live in
//   APINestedStack and subsequent deploys are normal. The `force: true` flag
//   only triggers migration for resources that are already in a *different*
//   stack than their intended destination, so it is effectively a one-shot.

module.exports = {
  'AWS::ApiGateway::Method': {
    destination: 'API',
    force: true,
  },
};
