/**
 * Writes functions/api/__tests__/legacyGatewayRoutes.json: every `http` event
 * in serverless.yml as { method, path, hasAuthorizer } (INFRA-207, plan 5.10).
 *
 * The fixture was generated once, before PR 2a deleted the per-function
 * events, so the parity test can prove no pre-migration gateway route
 * disappears and no formerly gateway-authorized route turns public. Do not
 * regenerate it after 2a: it would capture only the `api` proxy.
 *
 * Usage: npx ts-node scripts/dump-gateway-routes.ts
 * (js-yaml is a dependency of the Serverless Framework.)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface YamlType {
  readonly tag: string;
}
interface JsYaml {
  Type: new (tag: string, options: { kind: 'scalar' | 'sequence' | 'mapping'; construct: (data: unknown) => unknown }) => YamlType;
  DEFAULT_SCHEMA: { extend: (types: YamlType[]) => unknown };
  load: (text: string, options: { schema: unknown }) => unknown;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const yaml = require('js-yaml') as JsYaml;

export interface LegacyGatewayRoute {
  method: string;
  path: string;
  hasAuthorizer: boolean;
}

const CLOUDFORMATION_TAGS = [
  'Ref', 'GetAtt', 'Sub', 'Join', 'Select', 'Split', 'If', 'Equals', 'Not', 'And', 'Or',
  'FindInMap', 'ImportValue', 'Base64', 'GetAZs', 'Condition', 'Cidr',
];

/** CloudFormation short-form tags, kept as their long form so the file parses. */
const cloudFormationSchema = yaml.DEFAULT_SCHEMA.extend(
  CLOUDFORMATION_TAGS.flatMap((name) => (['scalar', 'sequence', 'mapping'] as const).map(
    (kind) => new yaml.Type(`!${name}`, {
      kind,
      construct: (data: unknown) => ({ [name === 'Ref' || name === 'Condition' ? name : `Fn::${name}`]: data }),
    }),
  )),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractGatewayRoutes(serverlessYaml: string): LegacyGatewayRoute[] {
  const doc = yaml.load(serverlessYaml, { schema: cloudFormationSchema });
  if (!isRecord(doc) || !isRecord(doc.functions)) throw new Error('serverless.yml has no functions section');

  const routes: LegacyGatewayRoute[] = [];
  for (const [name, fn] of Object.entries(doc.functions)) {
    if (!isRecord(fn) || !Array.isArray(fn.events)) continue;
    for (const event of fn.events) {
      if (!isRecord(event) || !isRecord(event.http)) continue;
      const { path, method, authorizer } = event.http;
      if (typeof path !== 'string' || typeof method !== 'string') {
        throw new Error(`Function ${name} has an http event without a path or method`);
      }
      routes.push({
        method: method.toUpperCase(),
        path: `/${path.replace(/^\/+/, '')}`,
        hasAuthorizer: authorizer !== undefined,
      });
    }
  }
  return routes;
}

function main(): void {
  const backendRoot = join(__dirname, '..');
  const routes = extractGatewayRoutes(readFileSync(join(backendRoot, 'serverless.yml'), 'utf8'))
    // The api proxy is the new route, not a legacy one.
    .filter((route) => route.path !== '/{proxy+}');
  const outPath = join(backendRoot, 'functions', 'api', '__tests__', 'legacyGatewayRoutes.json');
  writeFileSync(outPath, `${JSON.stringify(routes, null, 2)}\n`);
  console.log(`Wrote ${routes.length} gateway routes to ${outPath}`);
}

if (require.main === module) main();
