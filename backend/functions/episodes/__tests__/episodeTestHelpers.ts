import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import type { Repositories, EpisodeCreateInput } from '../../../lib/repositories';
import type { Episode, Video } from '../../../lib/repositories/types';
import { ctx, cb, makeEvent, withAuth } from '../../rivalries/__tests__/testHelpers';

export const VIDEO_ID = 'dQw4w9WgXcQ';
export const OTHER_VIDEO_ID = 'aBcDeFgHiJk';

export function seedEpisode(
  repos: Repositories,
  overrides: Partial<EpisodeCreateInput> = {},
): Promise<Episode> {
  return repos.content.episodes.create({
    youtubeVideoId: VIDEO_ID,
    title: 'Night 1',
    thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
    airDate: '2026-11-01',
    createdBy: 'gm-sub-secret',
    ...overrides,
  });
}

export function seedVideo(
  repos: Repositories,
  overrides: { episodeId?: string; isPublished?: boolean; title?: string } = {},
): Promise<Video> {
  return repos.content.videos.create({
    title: overrides.title ?? 'Clip',
    videoUrl: 'https://example.com/clip.mp4',
    category: 'highlight',
    uploadedBy: 'uploader-secret',
    isPublished: overrides.isPublished ?? true,
    episodeId: overrides.episodeId,
  });
}

export async function seedEvent(repos: Repositories): Promise<string> {
  const leagueEvent = await repos.leagueOps.events.create({
    name: 'Night of Champions',
    eventType: 'ppv',
    date: '2026-11-01',
  });
  return leagueEvent.eventId;
}

export interface Called<T> {
  statusCode: number;
  body: T;
}

/** Call a staff handler as a Moderator (or `groups`). */
export async function callStaff<T>(
  handler: APIGatewayProxyHandler,
  options: { body?: unknown; pathParameters?: Record<string, string>; method?: string; groups?: string },
): Promise<Called<T>> {
  const event = withAuth(
    makeEvent({
      httpMethod: options.method ?? 'POST',
      body: options.body === undefined ? null : JSON.stringify(options.body),
      pathParameters: options.pathParameters ?? null,
    }),
    options.groups ?? 'Moderator',
    'mod-sub',
    'moderator',
  );
  const result = (await handler(event, ctx, cb)) as APIGatewayProxyResult;
  return { statusCode: result.statusCode, body: (result.body ? JSON.parse(result.body) : null) as T };
}
