import { describe, it, expect } from 'vitest';
import {
  success,
  created,
  badRequest,
  notFound,
  serverError,
  unauthorized,
  forbidden,
  conflict,
  noContent,
  methodNotAllowed,
  error,
} from '../response';

const expectedHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': expect.any(String),
  'Access-Control-Allow-Credentials': true,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

describe('response helpers', () => {
  describe('success', () => {
    it('returns 200 with JSON body and security headers', () => {
      const result = success({ id: 1, name: 'Test' });

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({ id: 1, name: 'Test' });
      expect(result.headers).toMatchObject(expectedHeaders);
    });
  });

  describe('created', () => {
    it('returns 201 with JSON body', () => {
      const result = created({ id: 2 });

      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body)).toEqual({ id: 2 });
      expect(result.headers).toMatchObject(expectedHeaders);
    });
  });

  describe('error', () => {
    it('returns the given status code with message object', () => {
      const result = error(422, 'Unprocessable');

      expect(result.statusCode).toBe(422);
      expect(JSON.parse(result.body)).toEqual({ message: 'Unprocessable' });
    });
  });

  describe('badRequest', () => {
    it('returns 400 with error message', () => {
      const result = badRequest('Missing field');

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ message: 'Missing field' });
    });
  });

  describe('notFound', () => {
    it('returns 404 with custom message', () => {
      const result = notFound('Player not found');

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toEqual({ message: 'Player not found' });
    });

    it('returns 404 with default message when none provided', () => {
      const result = notFound();

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toEqual({ message: 'Resource not found' });
    });
  });

  describe('serverError', () => {
    it('returns 500 with custom message', () => {
      const result = serverError('Something broke');

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({ message: 'Something broke' });
    });

    it('returns 500 with default message when none provided', () => {
      const result = serverError();

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({ message: 'Internal server error' });
    });
  });

  describe('unauthorized', () => {
    it('returns 401 with message', () => {
      const result = unauthorized('Bad token');

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body)).toEqual({ message: 'Bad token' });
    });

    it('returns 401 with default message', () => {
      expect(unauthorized().statusCode).toBe(401);
      expect(JSON.parse(unauthorized().body)).toEqual({ message: 'Unauthorized' });
    });
  });

  describe('forbidden', () => {
    it('returns 403 with message', () => {
      const result = forbidden('Not allowed');

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body)).toEqual({ message: 'Not allowed' });
    });

    it('returns 403 with default message', () => {
      expect(JSON.parse(forbidden().body)).toEqual({ message: 'Forbidden' });
    });
  });

  describe('conflict', () => {
    it('returns 409 with message', () => {
      const result = conflict('Already exists');

      expect(result.statusCode).toBe(409);
      expect(JSON.parse(result.body)).toEqual({ message: 'Already exists' });
    });

    it('returns 409 with default message', () => {
      expect(JSON.parse(conflict().body)).toEqual({ message: 'Conflict' });
    });
  });

  describe('noContent', () => {
    it('returns 204 with empty body', () => {
      const result = noContent();

      expect(result.statusCode).toBe(204);
      expect(result.body).toBe('');
      expect(result.headers).toMatchObject(expectedHeaders);
    });
  });

  describe('methodNotAllowed', () => {
    it('returns 405 with custom message', () => {
      const result = methodNotAllowed('Use GET or POST');

      expect(result.statusCode).toBe(405);
      expect(JSON.parse(result.body)).toEqual({ message: 'Use GET or POST' });
      expect(result.headers).toMatchObject(expectedHeaders);
    });

    it('returns 405 with default message when none provided', () => {
      const result = methodNotAllowed();

      expect(result.statusCode).toBe(405);
      expect(JSON.parse(result.body)).toEqual({ message: 'Method Not Allowed' });
    });
  });
});
