import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { StorylineRequest, StorylineRequestStatus } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { createReviewerNameLookup } from '../../lib/reviewerName';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const statusFilter = event.queryStringParameters?.status;
    const { content: { storylineRequests }, roster: { players } } = getRepositories();

    let requests: StorylineRequest[];

    if (statusFilter) {
      requests = await storylineRequests.listByStatus(statusFilter as StorylineRequestStatus);
    } else {
      requests = await storylineRequests.list();
    }

    // Collect unique player IDs (requester + targets)
    const playerIds = new Set<string>();
    for (const req of requests) {
      playerIds.add(req.requesterId);
      for (const pid of req.targetPlayerIds || []) playerIds.add(pid);
    }

    const allPlayers = await players.list();
    const playersMap = new Map<string, string>(
      allPlayers
        .filter((p) => playerIds.has(p.playerId))
        .map((p) => [p.playerId, p.name])
    );

    const reviewerName = createReviewerNameLookup(allPlayers);

    // reviewedBy is display-only on this admin list, so it carries the name.
    const enriched = requests.map((req) => ({
      ...req,
      reviewedBy: reviewerName(req.reviewedBy),
      requesterName: playersMap.get(req.requesterId) ?? 'Unknown Player',
      targetPlayerNames: (req.targetPlayerIds || []).map(
        (pid) => playersMap.get(pid) ?? 'Unknown Player'
      ),
    }));

    enriched.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return success(enriched);
  } catch (err) {
    console.error('Error fetching storyline requests:', err);
    return serverError('Failed to fetch storyline requests');
  }
};
