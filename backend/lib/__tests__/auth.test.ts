import { describe, it, expect } from 'vitest';
import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  getAuthContext,
  hasRole,
  isSuperAdmin,
  requireRole,
  requireSuperAdmin,
  AuthContext,
} from '../auth';

/** Helper to build a minimal APIGatewayProxyEvent with authorizer context */
function makeEvent(authorizer: Record<string, string> = {}): APIGatewayProxyEvent {
  return {
    requestContext: { authorizer } as any,
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
  };
}

// ─── getAuthContext ──────────────────────────────────────────────────────────

describe('getAuthContext', () => {
  it('extracts username, email, sub, and groups from authorizer', () => {
    const event = makeEvent({
      username: 'john',
      email: 'john@example.com',
      principalId: 'sub-123',
      groups: 'Admin,Wrestler',
    });

    const ctx = getAuthContext(event);

    expect(ctx.username).toBe('john');
    expect(ctx.email).toBe('john@example.com');
    expect(ctx.sub).toBe('sub-123');
    expect(ctx.groups).toEqual(['Admin', 'Wrestler']);
  });

  it('returns empty strings and empty groups when authorizer is missing', () => {
    const event = makeEvent();

    const ctx = getAuthContext(event);

    expect(ctx.username).toBe('');
    expect(ctx.email).toBe('');
    expect(ctx.sub).toBe('');
    expect(ctx.groups).toEqual([]);
  });

  it('handles groups with whitespace between entries', () => {
    const event = makeEvent({ groups: ' Admin , Wrestler ' });

    const ctx = getAuthContext(event);

    expect(ctx.groups).toEqual(['Admin', 'Wrestler']);
  });

  it('returns empty groups when groups string is empty', () => {
    const event = makeEvent({ groups: '' });

    const ctx = getAuthContext(event);

    expect(ctx.groups).toEqual([]);
  });
});

// ─── hasRole ─────────────────────────────────────────────────────────────────

describe('hasRole', () => {
  it('returns true when user has the exact required role', () => {
    const ctx: AuthContext = { username: 'u', email: 'e', sub: 's', groups: ['Wrestler'] };

    expect(hasRole(ctx, 'Wrestler')).toBe(true);
  });

  it('returns false when user lacks the required role', () => {
    const ctx: AuthContext = { username: 'u', email: 'e', sub: 's', groups: ['Fantasy'] };

    expect(hasRole(ctx, 'Wrestler')).toBe(false);
  });

  it('Admin has access to every role', () => {
    const ctx: AuthContext = { username: 'u', email: 'e', sub: 's', groups: ['Admin'] };

    expect(hasRole(ctx, 'Wrestler')).toBe(true);
    expect(hasRole(ctx, 'Moderator')).toBe(true);
    expect(hasRole(ctx, 'Fantasy')).toBe(true);
    expect(hasRole(ctx, 'Admin')).toBe(true);
  });

  it('Moderator has access to non-Admin roles', () => {
    const ctx: AuthContext = { username: 'u', email: 'e', sub: 's', groups: ['Moderator'] };

    expect(hasRole(ctx, 'Wrestler')).toBe(true);
    expect(hasRole(ctx, 'Fantasy')).toBe(true);
    expect(hasRole(ctx, 'Moderator')).toBe(true);
  });

  it('Moderator does NOT have access to Admin-only operations', () => {
    const ctx: AuthContext = { username: 'u', email: 'e', sub: 's', groups: ['Moderator'] };

    expect(hasRole(ctx, 'Admin')).toBe(false);
  });

  it('returns true when user has any one of multiple required roles', () => {
    const ctx: AuthContext = { username: 'u', email: 'e', sub: 's', groups: ['Wrestler'] };

    expect(hasRole(ctx, 'Fantasy', 'Wrestler')).toBe(true);
  });

  it('returns false for empty groups', () => {
    const ctx: AuthContext = { username: 'u', email: 'e', sub: 's', groups: [] };

    expect(hasRole(ctx, 'Fantasy')).toBe(false);
  });
});

// ─── isSuperAdmin ────────────────────────────────────────────────────────────

describe('isSuperAdmin', () => {
  it('returns true for Admin group', () => {
    const ctx: AuthContext = { username: 'u', email: 'e', sub: 's', groups: ['Admin'] };

    expect(isSuperAdmin(ctx)).toBe(true);
  });

  it('returns false for Moderator group', () => {
    const ctx: AuthContext = { username: 'u', email: 'e', sub: 's', groups: ['Moderator'] };

    expect(isSuperAdmin(ctx)).toBe(false);
  });

  it('returns false for non-admin roles', () => {
    const ctx: AuthContext = { username: 'u', email: 'e', sub: 's', groups: ['Wrestler', 'Fantasy'] };

    expect(isSuperAdmin(ctx)).toBe(false);
  });
});

// ─── requireRole ─────────────────────────────────────────────────────────────

describe('requireRole', () => {
  it('returns null (authorized) when user has the required role', () => {
    const event = makeEvent({
      username: 'admin',
      email: 'a@b.com',
      principalId: 'sub-1',
      groups: 'Admin',
    });

    expect(requireRole(event, 'Admin')).toBeNull();
  });

  it('returns 403 response when user lacks the required role', () => {
    const event = makeEvent({
      username: 'player',
      email: 'p@b.com',
      principalId: 'sub-2',
      groups: 'Fantasy',
    });

    const result = requireRole(event, 'Admin');

    expect(result).not.toBeNull();
    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body)).toEqual({
      message: 'You do not have permission to perform this action',
    });
  });

  it('returns null for Moderator accessing non-Admin role', () => {
    const event = makeEvent({
      username: 'mod',
      email: 'm@b.com',
      principalId: 'sub-3',
      groups: 'Moderator',
    });

    expect(requireRole(event, 'Wrestler')).toBeNull();
  });
});

// ─── requireSuperAdmin ──────────────────────────────────────────────────────

describe('requireSuperAdmin', () => {
  it('returns null (authorized) for Admin', () => {
    const event = makeEvent({
      username: 'admin',
      email: 'a@b.com',
      principalId: 'sub-1',
      groups: 'Admin',
    });

    expect(requireSuperAdmin(event)).toBeNull();
  });

  it('returns 403 for Moderator', () => {
    const event = makeEvent({
      username: 'mod',
      email: 'm@b.com',
      principalId: 'sub-3',
      groups: 'Moderator',
    });

    const result = requireSuperAdmin(event);

    expect(result).not.toBeNull();
    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body)).toEqual({
      message: 'This action requires full Admin privileges',
    });
  });

  it('returns 403 for Wrestler', () => {
    const event = makeEvent({
      username: 'wrestler',
      email: 'w@b.com',
      principalId: 'sub-4',
      groups: 'Wrestler',
    });

    const result = requireSuperAdmin(event);

    expect(result).not.toBeNull();
    expect(result!.statusCode).toBe(403);
  });
});
