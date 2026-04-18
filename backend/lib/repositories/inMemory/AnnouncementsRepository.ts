import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type {
  AnnouncementCreateInput,
  AnnouncementPatch,
  AnnouncementsRepository,
} from '../AnnouncementsRepository';
import type { Announcement } from '../types';

export class InMemoryAnnouncementsRepository implements AnnouncementsRepository {
  readonly store = new Map<string, Announcement>();

  async findById(announcementId: string): Promise<Announcement | null> {
    return this.store.get(announcementId) ?? null;
  }

  async list(): Promise<Announcement[]> {
    const items = Array.from(this.store.values());
    items.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return items;
  }

  async listActive(): Promise<Announcement[]> {
    const now = new Date().toISOString();
    return Array.from(this.store.values())
      .filter((a) => a.isActive === 'true' && (!a.expiresAt || a.expiresAt > now))
      .sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1));
  }

  async create(input: AnnouncementCreateInput): Promise<Announcement> {
    const now = new Date().toISOString();
    const item: Announcement = {
      announcementId: uuidv4(),
      title: input.title.trim(),
      body: input.body.trim(),
      priority: typeof input.priority === 'number' ? input.priority : 1,
      isActive: input.isActive === false ? 'false' : 'true',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    if (input.expiresAt) item.expiresAt = input.expiresAt;
    if (input.videoUrl && input.videoUrl.trim().length > 0) item.videoUrl = input.videoUrl.trim();

    this.store.set(item.announcementId, item);
    return item;
  }

  async update(announcementId: string, patch: AnnouncementPatch): Promise<Announcement> {
    const existing = this.store.get(announcementId);
    if (!existing) throw new NotFoundError('Announcement', announcementId);

    const now = new Date().toISOString();
    const updated: Announcement = { ...existing, updatedAt: now };

    if (patch.title !== undefined) updated.title = patch.title;
    if (patch.body !== undefined) updated.body = patch.body;
    if (patch.priority !== undefined) updated.priority = patch.priority;
    if (patch.isActive !== undefined) updated.isActive = patch.isActive ? 'true' : 'false';
    if (patch.expiresAt === null) {
      delete updated.expiresAt;
    } else if (patch.expiresAt !== undefined) {
      updated.expiresAt = patch.expiresAt;
    }

    this.store.set(announcementId, updated);
    return updated;
  }

  async delete(announcementId: string): Promise<void> {
    this.store.delete(announcementId);
  }
}
