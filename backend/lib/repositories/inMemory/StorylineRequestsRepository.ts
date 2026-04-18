import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type {
  StorylineRequestCreateInput,
  StorylineRequestReviewInput,
  StorylineRequestsRepository,
} from '../StorylineRequestsRepository';
import type { StorylineRequest, StorylineRequestStatus } from '../types';

export class InMemoryStorylineRequestsRepository
  implements StorylineRequestsRepository
{
  readonly store = new Map<string, StorylineRequest>();

  async findById(requestId: string): Promise<StorylineRequest | null> {
    return this.store.get(requestId) ?? null;
  }

  async list(): Promise<StorylineRequest[]> {
    const items = Array.from(this.store.values());
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  async listByStatus(
    status: StorylineRequestStatus,
  ): Promise<StorylineRequest[]> {
    const items = Array.from(this.store.values()).filter(
      (r) => r.status === status,
    );
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  async listByRequester(requesterId: string): Promise<StorylineRequest[]> {
    const items = Array.from(this.store.values()).filter(
      (r) => r.requesterId === requesterId,
    );
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  async create(
    input: StorylineRequestCreateInput,
  ): Promise<StorylineRequest> {
    const now = new Date().toISOString();
    const item: StorylineRequest = {
      requestId: uuidv4(),
      requesterId: input.requesterId,
      targetPlayerIds: input.targetPlayerIds,
      requestType: input.requestType,
      description: input.description,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(item.requestId, item);
    return item;
  }

  async review(
    requestId: string,
    input: StorylineRequestReviewInput,
  ): Promise<StorylineRequest> {
    const existing = this.store.get(requestId);
    if (!existing) throw new NotFoundError('StorylineRequest', requestId);

    const now = new Date().toISOString();
    const updated: StorylineRequest = {
      ...existing,
      status: input.status,
      reviewedBy: input.reviewedBy,
      updatedAt: now,
    };

    if (input.gmNote) {
      updated.gmNote = input.gmNote;
    }

    this.store.set(requestId, updated);
    return updated;
  }
}
