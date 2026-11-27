import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories, type LiveStreamSettings } from '../../lib/repositories';
import { success, badRequest, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import {
  isLiveStreamActive,
  LIVE_STREAM_TITLE_MAX_LENGTH,
  toPublicLiveStream,
  TWITCH_CHANNEL_RE,
  type PublicLiveStream,
} from '../../lib/liveStream';

interface UpdateLiveStreamBody {
  channel?: unknown;
  isLive?: unknown;
  /** null or '' clears it. */
  title?: unknown;
}

export interface LiveStreamUpdateResponse extends PublicLiveStream {
  updatedBy?: string;
  updatedAt?: string;
}

/**
 * PUT /admin/live-stream (staff, so GMs can toggle it without the
 * Admin-only site-config route). Going live stamps liveSince = now unless
 * the stream is already live inside the 8-hour window, in which case the
 * existing liveSince is kept. Going offline clears liveSince.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const { data: body, error: parseError } = parseBody<UpdateLiveStreamBody>(event);
    if (parseError) return parseError;
    if (typeof body !== 'object' || Array.isArray(body)) return badRequest('Request body must be an object');
    if (body.channel === undefined && body.isLive === undefined && body.title === undefined) {
      return badRequest('No fields to update');
    }

    const { siteConfig } = getRepositories().user;
    const current = await siteConfig.getLiveStream();
    const now = new Date();
    const currentlyLive = isLiveStreamActive(current, now);

    let channel = current.channel;
    if (body.channel !== undefined) {
      if (typeof body.channel !== 'string') return badRequest('channel must be a string');
      const trimmed = body.channel.trim();
      if (trimmed !== '' && !TWITCH_CHANNEL_RE.test(trimmed)) {
        return badRequest('channel must be a Twitch login: 4-25 letters, digits or underscores');
      }
      channel = trimmed.toLowerCase();
    }

    let title = current.title;
    if (body.title !== undefined) {
      if (body.title !== null && typeof body.title !== 'string') return badRequest('title must be a string');
      const trimmed = typeof body.title === 'string' ? body.title.trim() : '';
      if (trimmed.length > LIVE_STREAM_TITLE_MAX_LENGTH) {
        return badRequest(`title must be at most ${LIVE_STREAM_TITLE_MAX_LENGTH} characters`);
      }
      title = trimmed || undefined;
    }

    let isLive = currentlyLive;
    if (body.isLive !== undefined) {
      if (typeof body.isLive !== 'boolean') return badRequest('isLive must be a boolean');
      isLive = body.isLive;
    }
    if (isLive && !channel) return badRequest('Set a channel before going live');

    const auth = getAuthContext(event);
    const next: LiveStreamSettings = {
      channel,
      isLive,
      updatedBy: auth.sub || auth.username,
      updatedAt: now.toISOString(),
    };
    if (title) next.title = title;
    // Keep liveSince only while the stream is still live inside the window;
    // otherwise (first go-live, or after the auto-off) start a new one.
    if (isLive) next.liveSince = currentlyLive && current.liveSince ? current.liveSince : now.toISOString();

    const saved = await siteConfig.setLiveStream(next);
    const response: LiveStreamUpdateResponse = {
      ...toPublicLiveStream(saved, now),
      updatedBy: saved.updatedBy,
      updatedAt: saved.updatedAt,
    };
    return success(response);
  } catch (err) {
    console.error('Error updating live stream:', err);
    return serverError('Failed to update live stream');
  }
};
