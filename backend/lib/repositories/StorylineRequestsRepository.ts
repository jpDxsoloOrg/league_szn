import type { StorylineRequest, StorylineRequestStatus } from './types';

export interface StorylineRequestCreateInput {
  requesterId: string;
  targetPlayerIds: string[];
  requestType: 'storyline' | 'backstage_attack' | 'rivalry';
  description: string;
}

export interface StorylineRequestReviewInput {
  status: 'acknowledged' | 'declined';
  reviewedBy: string;
  gmNote?: string;
}

export interface StorylineRequestsRepository {
  findById(requestId: string): Promise<StorylineRequest | null>;
  list(): Promise<StorylineRequest[]>;
  listByStatus(status: StorylineRequestStatus): Promise<StorylineRequest[]>;
  listByRequester(requesterId: string): Promise<StorylineRequest[]>;
  create(input: StorylineRequestCreateInput): Promise<StorylineRequest>;
  review(requestId: string, input: StorylineRequestReviewInput): Promise<StorylineRequest>;
}
