import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type {
  VideoCreateInput,
  VideoPatch,
  VideosRepository,
} from '../VideosRepository';
import type { Video } from '../types';

export class InMemoryVideosRepository implements VideosRepository {
  readonly store = new Map<string, Video>();

  async findById(videoId: string): Promise<Video | null> {
    return this.store.get(videoId) ?? null;
  }

  async list(): Promise<Video[]> {
    const videos = Array.from(this.store.values());
    videos.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return videos;
  }

  async listPublished(category?: string): Promise<Video[]> {
    let videos = Array.from(this.store.values()).filter((v) => v.isPublished === 'true');
    if (category) videos = videos.filter((v) => v.category === category);
    videos.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return videos;
  }

  async create(input: VideoCreateInput): Promise<Video> {
    const now = new Date().toISOString();
    const item: Video = {
      videoId: uuidv4(),
      title: input.title.trim(),
      description: input.description?.trim() || '',
      videoUrl: input.videoUrl.trim(),
      thumbnailUrl: input.thumbnailUrl?.trim() || '',
      category: input.category,
      tags: input.tags || [],
      isPublished: input.isPublished === false ? 'false' : 'true',
      uploadedBy: input.uploadedBy,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(item.videoId, item);
    return item;
  }

  async update(videoId: string, patch: VideoPatch): Promise<Video> {
    const existing = this.store.get(videoId);
    if (!existing) throw new NotFoundError('Video', videoId);

    const fields: Partial<Video> = {};
    if (patch.title !== undefined) fields.title = patch.title.trim();
    if (patch.description !== undefined) fields.description = patch.description.trim();
    if (patch.videoUrl !== undefined) fields.videoUrl = patch.videoUrl.trim();
    if (patch.thumbnailUrl !== undefined) fields.thumbnailUrl = patch.thumbnailUrl.trim();
    if (patch.category !== undefined) fields.category = patch.category;
    if (patch.tags !== undefined) fields.tags = patch.tags;
    if (patch.isPublished !== undefined) fields.isPublished = patch.isPublished ? 'true' : 'false';

    const updated: Video = { ...existing, ...fields, updatedAt: new Date().toISOString() };
    this.store.set(videoId, updated);
    return updated;
  }

  async delete(videoId: string): Promise<void> {
    this.store.delete(videoId);
  }
}
