import { APIGatewayProxyResult } from 'aws-lambda';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://leagueszn.jpdxsolo.com',
  'Access-Control-Allow-Credentials': true,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

export const success = (data: any): APIGatewayProxyResult => {
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(data),
  };
};

export const created = (data: any): APIGatewayProxyResult => {
  return {
    statusCode: 201,
    headers,
    body: JSON.stringify(data),
  };
};

export const error = (statusCode: number, message: string): APIGatewayProxyResult => {
  return {
    statusCode,
    headers,
    body: JSON.stringify({ message }),
  };
};

export const badRequest = (message: string): APIGatewayProxyResult => {
  return error(400, message);
};

export const notFound = (message: string = 'Resource not found'): APIGatewayProxyResult => {
  return error(404, message);
};

export const serverError = (message: string = 'Internal server error'): APIGatewayProxyResult => {
  return error(500, message);
};

export const unauthorized = (message: string = 'Unauthorized'): APIGatewayProxyResult => {
  return error(401, message);
};

export const forbidden = (message: string = 'Forbidden'): APIGatewayProxyResult => {
  return error(403, message);
};

export const conflict = (message: string = 'Conflict'): APIGatewayProxyResult => {
  return error(409, message);
};

export const noContent = (): APIGatewayProxyResult => {
  return {
    statusCode: 204,
    headers,
    body: '',
  };
};
