import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { created, badRequest, conflict, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import type { RivalryHeat, RivalryParticipantRole } from '../../lib/repositories';

interface CreateRivalryBody {
  title?: string;
  description?: string;
  heat?: RivalryHeat;
  participants?: Array<{ playerId?: string; role?: RivalryParticipantRole }>;
}

const VALID_HEAT: ReadonlyArray<RivalryHeat> = ['cold', 'warm', 'hot'];
const VALID_ROLE: ReadonlyArray<RivalryParticipantRole> = ['instigator', 'rival'];

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can request a rivalry');
    }

    const parsed = parseBody<CreateRivalryBody>(event);
    if (parsed.error) return parsed.error;
    const { title, description, heat, participants } = parsed.data;

    if (!title || title.trim().length === 0) {
      return badRequest('title is required');
    }
    if (heat !== undefined && !VALID_HEAT.includes(heat)) {
      return badRequest(`heat must be one of: ${VALID_HEAT.join(', ')}`);
    }
    if (!Array.isArray(participants) || participants.length < 2) {
      return badRequest('At least two participants are required');
    }

    const seen = new Set<string>();
    const normalizedParticipants: Array<{ playerId: string; role: RivalryParticipantRole }> = [];
    for (const p of participants) {
      if (!p || typeof p.playerId !== 'string' || !p.playerId) {
        return badRequest('Every participant entry needs a playerId');
      }
      if (seen.has(p.playerId)) {
        return badRequest('Duplicate participant playerIds are not allowed');
      }
      seen.add(p.playerId);
      if (p.role !== undefined && !VALID_ROLE.includes(p.role)) {
        return badRequest(`participant role must be one of: ${VALID_ROLE.join(', ')}`);
      }
      normalizedParticipants.push({ playerId: p.playerId, role: p.role ?? 'rival' });
    }

    const { roster: { players }, rivalries } = getRepositories();

    const requester = await players.findByUserId(auth.sub);
    if (!requester) {
      return badRequest('No player profile linked to your account');
    }
    if (!seen.has(requester.playerId)) {
      return badRequest('Requester must be one of the participants');
    }

    // Verify every participant exists.
    const playerLookups = await Promise.all(
      normalizedParticipants.map((p) => players.findById(p.playerId)),
    );
    const missing = normalizedParticipants.find((_, idx) => !playerLookups[idx]);
    if (missing) {
      return badRequest(`Participant not found: ${missing.playerId}`);
    }

    // Duplicate-active check (read-then-write; race-window noted in ticket).
    const existingForRequester = await rivalries.listByParticipant(requester.playerId, {
      limit: 200,
    });
    const wantedSet = new Set(normalizedParticipants.map((p) => p.playerId));
    const duplicate = existingForRequester.items.find((r) => {
      if (r.status !== 'pending' && r.status !== 'active') return false;
      if (r.participants.length !== wantedSet.size) return false;
      return r.participants.every((p) => wantedSet.has(p.playerId));
    });
    if (duplicate) {
      return conflict(
        `An ${duplicate.status} rivalry already exists between these participants`,
      );
    }

    // Mark the requester as the instigator unless they explicitly set their own role.
    const rivalry = await rivalries.create({
      title: title.trim(),
      description: description?.trim() || undefined,
      heat: heat ?? 'warm',
      requestedBy: requester.playerId,
      participants: normalizedParticipants.map((p) => ({
        playerId: p.playerId,
        role:
          p.playerId === requester.playerId && participants.find(
            (orig) => orig.playerId === requester.playerId,
          )?.role === undefined
            ? 'instigator'
            : p.role,
      })),
    });

    return created(rivalry);
  } catch (err) {
    console.error('Error creating rivalry:', err);
    return serverError('Failed to create rivalry');
  }
};
