import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Callback, Context } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import {
  badRequest,
  conflict,
  created,
  noContent,
  notFound,
  serverError,
  success,
} from './response';
import { parseBody } from './parseBody';
import { dynamoDb, TableNames } from './dynamodb';
import { ConcurrencyError, ConflictError, NotFoundError } from './repositories/errors';

// ─── Legacy factory (direct DynamoDB; kept for backward compat during migration) ────

export interface CreateHandlerOptions {
  tableName: (typeof TableNames)[keyof typeof TableNames];
  idField: string;
  entityName: string;
  requiredFields: string[];
  optionalFields?: string[];
  defaults?: Record<string, unknown>;
  nullableFields?: string[];
  validate?: (body: Record<string, unknown>, event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult | null>;
  buildItem?: (body: Record<string, unknown>, baseItem: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

/**
 * @deprecated Use the repository-backed `createHandlerFactory` instead. Kept for
 * handlers not yet migrated to the repository layer (Issue #212 partial migration).
 * Will be removed once all callers move to the new factory.
 */
export function handlerFactory(options: CreateHandlerOptions): APIGatewayProxyHandler {
  return async function (event: APIGatewayProxyEvent, _context: Context, _callback: Callback): Promise<APIGatewayProxyResult> {
    try {
      const { data: body, error: parseError } = parseBody(event);
      if (parseError) return parseError;
      const requiredFieldsMissing = options.requiredFields.filter((field) => !body[field]);
      if (requiredFieldsMissing.length === 1) {
        return badRequest(`${requiredFieldsMissing[0]} is required`);
      }
      if (requiredFieldsMissing.length > 0) return badRequest(`${requiredFieldsMissing.join(', ')} are required`);

      if (options.validate) {
        const validateError = await options.validate(body, event);
        if (validateError) return validateError;
      }

      const requiredFields = options.requiredFields.reduce((acc, field) => {
        acc[field] = body[field];
        return acc;
      }, {} as Record<string, unknown>);

      const optionalFields = options.optionalFields?.reduce((acc, field) => {
        if (body[field]) {
          acc[field] = body[field];
        }
        return acc;
      }, {} as Record<string, unknown>);

      const nullableFields = options.nullableFields?.reduce((acc, field) => {
        acc[field] = body[field] ?? null;
        return acc;
      }, {} as Record<string, unknown>);

      const baseItem: Record<string, unknown> = {
        [options.idField]: uuidv4(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...requiredFields,
        ...(options.defaults ?? {}),
        ...(optionalFields ?? {}),
        ...(nullableFields ?? {}),
      };
      const item = (await options.buildItem?.(body, baseItem)) ?? baseItem;
      await dynamoDb.put({
        TableName: options.tableName,
        Item: item,
      });
      return created(item);
    } catch (error) {
      console.error('Error creating item: ', options.entityName, error);
      return serverError(`Failed to create ${options.entityName}`);
    }
  };
}

// ─── Shared helpers for repository-backed factories ─────────────────

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function requireId(
  event: APIGatewayProxyEvent,
  idParam: string,
  entityLabel: string,
): { id: string; error?: never } | { id?: never; error: APIGatewayProxyResult } {
  const id = event.pathParameters?.[idParam];
  if (!id) return { error: badRequest(`${entityLabel} ID is required`) };
  return { id };
}

// ─── CREATE (repo-backed) ───────────────────────────────────────────

export interface RepoCreateHandlerOptions<TInput extends object, TEntity> {
  repo: () => { create: (input: TInput) => Promise<TEntity> };
  entityName: string;
  requiredFields: (keyof TInput & string)[];
  optionalFields?: (keyof TInput & string)[];
  validate?: (body: Record<string, unknown>, event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult | null>;
}

export function createHandlerFactory<TInput extends object, TEntity>(
  options: RepoCreateHandlerOptions<TInput, TEntity>,
): APIGatewayProxyHandler {
  return async (event): Promise<APIGatewayProxyResult> => {
    try {
      const { data: body, error: parseError } = parseBody(event);
      if (parseError) return parseError;

      const raw = body as Record<string, unknown>;
      const missing = options.requiredFields.filter((f) => !raw[f]);
      if (missing.length === 1) return badRequest(`${missing[0]} is required`);
      if (missing.length > 0) return badRequest(`${missing.join(', ')} are required`);

      if (options.validate) {
        const validateError = await options.validate(raw, event);
        if (validateError) return validateError;
      }

      const input: Record<string, unknown> = {};
      for (const f of options.requiredFields) input[f] = raw[f];
      for (const f of options.optionalFields ?? []) {
        if (raw[f] !== undefined) input[f] = raw[f];
      }

      const item = await options.repo().create(input as TInput);
      return created(item);
    } catch (err) {
      if (err instanceof ConflictError) return conflict(err.message);
      if (err instanceof ConcurrencyError) return conflict(err.message);
      console.error(`Error creating ${options.entityName}:`, err);
      return serverError(`Failed to create ${options.entityName}`);
    }
  };
}

// ─── GET ────────────────────────────────────────────────────────────

export interface GetHandlerOptions<TEntity> {
  repo: () => { findById: (id: string) => Promise<TEntity | null> };
  entityName: string;
  idParam: string;
  entityLabel?: string;
}

export function getHandlerFactory<TEntity>(options: GetHandlerOptions<TEntity>): APIGatewayProxyHandler {
  const entityLabel = options.entityLabel ?? capitalize(options.entityName);
  return async (event): Promise<APIGatewayProxyResult> => {
    try {
      const { id, error } = requireId(event, options.idParam, entityLabel);
      if (error) return error;
      const item = await options.repo().findById(id);
      if (!item) return notFound(`${entityLabel} not found`);
      return success(item);
    } catch (err) {
      console.error(`Error fetching ${options.entityName}:`, err);
      return serverError(`Failed to fetch ${options.entityName}`);
    }
  };
}

// ─── LIST ───────────────────────────────────────────────────────────

export interface ListHandlerOptions<TEntity> {
  repo: () => { list: () => Promise<TEntity[]> };
  entityName: string;
}

export function listHandlerFactory<TEntity>(options: ListHandlerOptions<TEntity>): APIGatewayProxyHandler {
  return async (): Promise<APIGatewayProxyResult> => {
    try {
      const items = await options.repo().list();
      return success(items);
    } catch (err) {
      console.error(`Error fetching ${options.entityName} list:`, err);
      return serverError(`Failed to fetch ${options.entityName} list`);
    }
  };
}

// ─── UPDATE ─────────────────────────────────────────────────────────

export interface UpdateHandlerOptions<TPatch extends object, TEntity> {
  repo: () => { update: (id: string, patch: TPatch) => Promise<TEntity> };
  entityName: string;
  idParam: string;
  patchFields: (keyof TPatch & string)[];
  entityLabel?: string;
}

export function updateHandlerFactory<TPatch extends object, TEntity>(
  options: UpdateHandlerOptions<TPatch, TEntity>,
): APIGatewayProxyHandler {
  const entityLabel = options.entityLabel ?? capitalize(options.entityName);
  return async (event): Promise<APIGatewayProxyResult> => {
    try {
      const { id, error } = requireId(event, options.idParam, entityLabel);
      if (error) return error;

      const { data: body, error: parseError } = parseBody(event);
      if (parseError) return parseError;

      const raw = body as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      let hasChanges = false;
      for (const f of options.patchFields) {
        if (raw[f] !== undefined) {
          patch[f] = raw[f];
          hasChanges = true;
        }
      }
      if (!hasChanges) return badRequest('No valid fields to update');

      const item = await options.repo().update(id, patch as TPatch);
      return success(item);
    } catch (err) {
      if (err instanceof NotFoundError) return notFound(err.message);
      if (err instanceof ConflictError) return conflict(err.message);
      if (err instanceof ConcurrencyError) return conflict(err.message);
      console.error(`Error updating ${options.entityName}:`, err);
      return serverError(`Failed to update ${options.entityName}`);
    }
  };
}

// ─── DELETE ─────────────────────────────────────────────────────────

export interface DeleteHandlerOptions<TEntity> {
  repo: () => {
    findById: (id: string) => Promise<TEntity | null>;
    delete: (id: string) => Promise<void>;
  };
  entityName: string;
  idParam: string;
  entityLabel?: string;
  preDelete?: (id: string, item: TEntity) => Promise<void>;
}

export function deleteHandlerFactory<TEntity>(options: DeleteHandlerOptions<TEntity>): APIGatewayProxyHandler {
  const entityLabel = options.entityLabel ?? capitalize(options.entityName);
  return async (event): Promise<APIGatewayProxyResult> => {
    try {
      const { id, error } = requireId(event, options.idParam, entityLabel);
      if (error) return error;

      const repo = options.repo();
      const existing = await repo.findById(id);
      if (!existing) return notFound(`${entityLabel} not found`);

      if (options.preDelete) await options.preDelete(id, existing);

      await repo.delete(id);
      return noContent();
    } catch (err) {
      if (err instanceof ConflictError) return conflict(err.message);
      if (err instanceof ConcurrencyError) return conflict(err.message);
      console.error(`Error deleting ${options.entityName}:`, err);
      return serverError(`Failed to delete ${options.entityName}`);
    }
  };
}
