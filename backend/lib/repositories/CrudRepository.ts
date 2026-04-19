export interface CrudRepository<T, TCreate, TPatch> {
  findById(id: string): Promise<T | null>;
  list(): Promise<T[]>;
  create(input: TCreate): Promise<T>;
  update(id: string, patch: TPatch): Promise<T>;
  delete(id: string): Promise<void>;
}
