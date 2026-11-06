export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export class NotFoundError extends RepositoryError {
  constructor(entityName: string, id: string) {
    super(`${entityName} with id ${id} not found`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends RepositoryError {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ConcurrencyError extends RepositoryError {
  constructor(entityName: string, id: string) {
    super(`${entityName} with id ${id} was modified by another request`);
    this.name = 'ConcurrencyError';
  }
}

/**
 * True when a unit of work failed because another write got there first: a
 * guarded item changed (`ConcurrencyError`), or DynamoDB cancelled the
 * transaction for a reason the UoW does not map to a typed error, such as an
 * overlapping transaction.
 */
export function isConcurrentWriteError(err: unknown): boolean {
  if (err instanceof ConcurrencyError) return true;
  return (err as { name?: unknown } | null | undefined)?.name === 'TransactionCanceledException';
}
