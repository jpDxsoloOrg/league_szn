import type { Video } from './repositories/types';

/**
 * uploadedBy holds a staff uploader's Cognito id or a wrestler's playerId, and
 * no public page reads it. Admin lists use their own route.
 */
export function toPublicVideo(video: Video): Omit<Video, 'uploadedBy'> {
  const { uploadedBy, ...rest } = video;
  void uploadedBy;
  return rest;
}
