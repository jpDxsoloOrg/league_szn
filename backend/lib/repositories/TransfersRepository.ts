import type { TransferRequest } from './types';

export interface TransferCreateInput {
  playerId: string;
  fromDivisionId: string;
  toDivisionId: string;
  reason: string;
}

export interface TransferReviewInput {
  status: 'approved' | 'rejected';
  reviewedBy: string;
  reviewNote?: string;
}

export interface TransfersRepository {
  findById(requestId: string): Promise<TransferRequest | null>;
  list(): Promise<TransferRequest[]>;
  listByStatus(status: string): Promise<TransferRequest[]>;
  listByPlayer(playerId: string): Promise<TransferRequest[]>;
  listPendingByPlayer(playerId: string): Promise<TransferRequest[]>;
  create(input: TransferCreateInput): Promise<TransferRequest>;
  review(requestId: string, input: TransferReviewInput): Promise<TransferRequest>;
}
