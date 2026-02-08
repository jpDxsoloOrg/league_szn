import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { forbidden } from './response';

export type UserRole = 'Admin' | 'Moderator' | 'Wrestler' | 'Fantasy';

export interface AuthContext {
  username: string;
  email: string;
  groups: UserRole[];
  sub: string;
}

/**
 * Extract auth context from the API Gateway event.
 * The authorizer passes groups, username, email, and sub via requestContext.authorizer.
 */
export function getAuthContext(event: APIGatewayProxyEvent): AuthContext {
  const authorizer = event.requestContext.authorizer || {};
  const groupsStr = (authorizer.groups as string) || '';
  const groups = groupsStr
    ? (groupsStr.split(',').map((g: string) => g.trim()) as UserRole[])
    : [];

  return {
    username: (authorizer.username as string) || '',
    email: (authorizer.email as string) || '',
    sub: (authorizer.principalId as string) || event.requestContext.authorizer?.principalId || '',
    groups,
  };
}

/**
 * Check if user has at least one of the required roles.
 * Admin and Moderator have access to all standard admin features.
 */
export function hasRole(context: AuthContext, ...requiredRoles: UserRole[]): boolean {
  if (context.groups.includes('Admin')) return true;
  if (context.groups.includes('Moderator')) return true;
  return requiredRoles.some((role) => context.groups.includes(role));
}

/**
 * Check if user is a super admin (full Admin role, not Moderator).
 * Used for restricted operations like deleting all data or managing Admin/Moderator roles.
 */
export function isSuperAdmin(context: AuthContext): boolean {
  return context.groups.includes('Admin');
}

/**
 * Middleware-style role check. Returns a 403 response if the user lacks the required role.
 * Returns null if authorized (caller should proceed).
 */
export function requireRole(
  event: APIGatewayProxyEvent,
  ...requiredRoles: UserRole[]
): APIGatewayProxyResult | null {
  const context = getAuthContext(event);
  if (!hasRole(context, ...requiredRoles)) {
    return forbidden('You do not have permission to perform this action');
  }
  return null;
}

/**
 * Middleware-style check that requires full Admin role (not Moderator).
 * Returns a 403 response if the user is not a super admin.
 */
export function requireSuperAdmin(
  event: APIGatewayProxyEvent,
): APIGatewayProxyResult | null {
  const context = getAuthContext(event);
  if (!isSuperAdmin(context)) {
    return forbidden('This action requires full Admin privileges');
  }
  return null;
}
