import type { Video } from './types';

export interface VideoCreateInput {
  title: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  category: 'match' | 'highlight' | 'promo' | 'other';
  tags?: string[];
  isPublished?: boolean;
  uploadedBy: string;
}

export interface VideoPatch {
  title?: string;
  description?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  category?: 'match' | 'highlight' | 'promo' | 'other';
  tags?: string[];
  isPublished?: boolean;
}

export interface VideosRepository {
  findById(videoId: string): Promise<Video | null>;
  list(): Promise<Video[]>;
  listPublished(category?: string): Promise<Video[]>;
  create(input: VideoCreateInput): Promise<Video>;
  update(videoId: string, patch: VideoPatch): Promise<Video>;
  delete(videoId: string): Promise<void>;
}
