export interface UnitOfWork {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export type UnitOfWorkFactory = <T>(fn: (tx: UnitOfWork) => Promise<T>) => Promise<T>;
