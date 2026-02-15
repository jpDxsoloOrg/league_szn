import { APIGatewayProxyHandler } from 'aws-lambda';
import { OPENAPI_YAML, SWAGGER_HTML } from './docsEmbed.generated';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://leagueszn.jpdxsolo.com',
  'Access-Control-Allow-Credentials': 'true',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestPath = event.path || '';
  const isSpec = requestPath.endsWith('/spec') || requestPath.includes('/api-docs/spec');

  const body = isSpec ? OPENAPI_YAML : SWAGGER_HTML;
  const contentType = isSpec ? 'application/x-yaml' : 'text/html';

  return {
    statusCode: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': contentType,
    },
    body,
  };
};
