import { v4 as uuidv4 } from 'uuid';
import {
  buildContract,
  type ContractCreateInput,
  type ContractListFilter,
  type ContractsRepository,
} from '../contracts';
import type { Contract, ContractPatch, ContractStatus } from '../types';
import { ConcurrencyError, NotFoundError } from '../errors';

const newestFirst = (a: Contract, b: Contract): number => b.createdAt.localeCompare(a.createdAt);

/** Same semantics as the Dynamo update: `null` removes, `undefined` is skipped. */
export function applyContractPatch(existing: Contract, patch: ContractPatch, nowIso: string): Contract {
  const next: Record<string, unknown> = { ...existing };
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) delete next[field];
    else next[field] = value;
  }
  next.updatedAt = nowIso;
  return next as unknown as Contract;
}

export class InMemoryContractsRepository implements ContractsRepository {
  readonly store = new Map<string, Contract>();

  async findById(contractId: string): Promise<Contract | null> {
    const contract = this.store.get(contractId);
    return contract ? { ...contract } : null;
  }

  async listByPlayer(playerId: string): Promise<Contract[]> {
    return Array.from(this.store.values())
      .filter((contract) => contract.playerId === playerId)
      .sort(newestFirst)
      .map((contract) => ({ ...contract }));
  }

  async list(filter: ContractListFilter = {}): Promise<Contract[]> {
    return Array.from(this.store.values())
      .filter((contract) =>
        (filter.status === undefined || contract.status === filter.status)
        && (filter.seasonId === undefined || contract.seasonId === filter.seasonId)
        && (filter.type === undefined || contract.type === filter.type))
      .sort(newestFirst)
      .map((contract) => ({ ...contract }));
  }

  async create(input: ContractCreateInput): Promise<Contract> {
    const contract = buildContract(uuidv4(), input, new Date().toISOString());
    this.store.set(contract.contractId, contract);
    return { ...contract };
  }

  async update(contractId: string, patch: ContractPatch, expectedStatus?: ContractStatus): Promise<Contract> {
    const existing = this.store.get(contractId);
    if (!existing) throw new NotFoundError('Contract', contractId);
    if (expectedStatus && existing.status !== expectedStatus) {
      throw new ConcurrencyError('Contract', contractId);
    }
    const next = applyContractPatch(existing, patch, new Date().toISOString());
    this.store.set(contractId, next);
    return { ...next };
  }
}
