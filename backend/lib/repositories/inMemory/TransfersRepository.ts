import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type {
  TransferCreateInput,
  TransferReviewInput,
  TransfersRepository,
} from '../TransfersRepository';
import type { TransferRequest } from '../types';

export class InMemoryTransfersRepository implements TransfersRepository {
  readonly store = new Map<string, TransferRequest>();

  async findById(requestId: string): Promise<TransferRequest | null> {
    return this.store.get(requestId) ?? null;
  }

  async list(): Promise<TransferRequest[]> {
    const items = Array.from(this.store.values());
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  async listByStatus(status: string): Promise<TransferRequest[]> {
    const items = Array.from(this.store.values()).filter(
      (r) => r.status === status,
    );
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  async listByPlayer(playerId: string): Promise<TransferRequest[]> {
    const items = Array.from(this.store.values()).filter(
      (r) => r.playerId === playerId,
    );
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  async listPendingByPlayer(playerId: string): Promise<TransferRequest[]> {
    return Array.from(this.store.values()).filter(
      (r) => r.playerId === playerId && r.status === 'pending',
    );
  }

  async create(input: TransferCreateInput): Promise<TransferRequest> {
    const now = new Date().toISOString();
    const item: TransferRequest = {
      requestId: uuidv4(),
      playerId: input.playerId,
      fromDivisionId: input.fromDivisionId,
      toDivisionId: input.toDivisionId,
      reason: input.reason,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(item.requestId, item);
    return item;
  }

  async review(
    requestId: string,
    input: TransferReviewInput,
  ): Promise<TransferRequest> {
    const existing = this.store.get(requestId);
    if (!existing) throw new NotFoundError('TransferRequest', requestId);

    const now = new Date().toISOString();
    const updated: TransferRequest = {
      ...existing,
      status: input.status,
      reviewedBy: input.reviewedBy,
      updatedAt: now,
    };

    if (input.reviewNote) {
      updated.reviewNote = input.reviewNote;
    }

    this.store.set(requestId, updated);
    return updated;
  }
}
