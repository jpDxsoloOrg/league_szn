import { APIGatewayProxyHandler } from 'aws-lambda';
import * as fs from 'fs';
import * as path from 'path';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://leagueszn.jpdxsolo.com',
  'Access-Control-Allow-Credentials': 'true',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

/** Resolve docs directory: Lambda package root is process.cwd(); fallback for local/build paths. */
function getDocsDir(): string {
  const cwdDocs = path.join(process.cwd(), 'docs');
  if (fs.existsSync(cwdDocs)) return cwdDocs;
  const dirnameDocs = path.join(__dirname, '..', '..', 'docs');
  if (fs.existsSync(dirnameDocs)) return dirnameDocs;
  return cwdDocs;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestPath = event.path || '';
  const isSpec = requestPath.endsWith('/spec') || requestPath.includes('/api-docs/spec');

  const docsDir = getDocsDir();
  let filePath: string;
  let contentType: string;

  if (isSpec) {
    filePath = path.join(docsDir, 'openapi.yaml');
    contentType = 'application/x-yaml';
  } else {
    filePath = path.join(docsDir, 'swagger.html');
    contentType = 'text/html';
  }

  try {
    const body = fs.readFileSync(filePath, 'utf8');
    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': contentType,
      },
      body,
    };
  } catch (err) {
    console.error('serveDocs read error:', err);
    return {
      statusCode: 404,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'Not found' }),
    };
  }
};
