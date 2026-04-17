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
