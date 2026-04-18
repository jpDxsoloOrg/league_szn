import type { Announcement } from './types';

export interface AnnouncementCreateInput {
  title: string;
  body: string;
  priority?: number;
  isActive?: boolean;
  expiresAt?: string;
  videoUrl?: string;
  createdBy: string;
}

export interface AnnouncementPatch {
  title?: string;
  body?: string;
  priority?: number;
  isActive?: boolean;
  expiresAt?: string | null;
}

export interface AnnouncementsRepository {
  findById(announcementId: string): Promise<Announcement | null>;
  list(): Promise<Announcement[]>;
  listActive(): Promise<Announcement[]>;
  create(input: AnnouncementCreateInput): Promise<Announcement>;
  update(announcementId: string, patch: AnnouncementPatch): Promise<Announcement>;
  delete(announcementId: string): Promise<void>;
}
