import { APIGatewayProxyResult } from 'aws-lambda';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
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
