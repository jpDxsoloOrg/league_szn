import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { created, badRequest, conflict, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import type { RivalryHeat, RivalryParticipantRole, WrestlerVariant } from '../../lib/repositories';

interface CreateRivalryBody {
  title?: string;
  description?: string;
  heat?: RivalryHeat;
  participants?: Array<{
    playerId?: string;
    role?: RivalryParticipantRole;
    wrestlerVariant?: WrestlerVariant;
  }>;
}

const VALID_HEAT: ReadonlyArray<RivalryHeat> = ['cold', 'warm', 'hot'];
const VALID_ROLE: ReadonlyArray<RivalryParticipantRole> = ['instigator', 'rival'];
const VALID_VARIANT: ReadonlyArray<WrestlerVariant> = ['primary', 'alternate'];

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    // Initial rollout: only GMs may open a rivalry. The UI hides the
    // CTA for everyone else; this is the matching back-end gate.
    if (!hasRole(auth, 'Admin', 'Moderator')) {
      return forbidden('Only GMs can open a rivalry');
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
    const normalizedParticipants: Array<{
      playerId: string;
      role: RivalryParticipantRole;
      wrestlerVariant?: WrestlerVariant;
    }> = [];
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
      if (p.wrestlerVariant !== undefined && !VALID_VARIANT.includes(p.wrestlerVariant)) {
        return badRequest(`wrestlerVariant must be one of: ${VALID_VARIANT.join(', ')}`);
      }
      // First participant in the payload becomes the instigator by
      // default; explicit roles still win.
      const defaultRole: RivalryParticipantRole =
        normalizedParticipants.length === 0 ? 'instigator' : 'rival';
      normalizedParticipants.push({
        playerId: p.playerId,
        role: p.role ?? defaultRole,
        wrestlerVariant: p.wrestlerVariant,
      });
    }

    const { roster: { players }, rivalries } = getRepositories();

    // Verify every participant exists.
    const playerLookups = await Promise.all(
      normalizedParticipants.map((p) => players.findById(p.playerId)),
    );
    const missing = normalizedParticipants.find((_, idx) => !playerLookups[idx]);
    if (missing) {
      return badRequest(`Participant not found: ${missing.playerId}`);
    }

    // Duplicate-active check — keyed off the first participant so the
    // GM gets a 409 if either of these two wrestlers is already in
    // another pending/active rivalry with the same opponent.
    const probeId = normalizedParticipants[0]?.playerId;
    if (!probeId) {
      return badRequest('At least one participant is required');
    }
    const existingForProbe = await rivalries.listByParticipant(probeId, { limit: 200 });
    const wantedSet = new Set(normalizedParticipants.map((p) => p.playerId));
    const duplicate = existingForProbe.items.find((r) => {
      if (r.status !== 'pending' && r.status !== 'active') return false;
      if (r.participants.length !== wantedSet.size) return false;
      return r.participants.every((p) => wantedSet.has(p.playerId));
    });
    if (duplicate) {
      return conflict(
        `An ${duplicate.status} rivalry already exists between these participants`,
      );
    }

    // Pick the recorded requester: the GM's linked player if they have
    // one, otherwise the first participant. The bookerName field will
    // hold the GM's display identity separately.
    const callerPlayer = auth.sub
      ? await players.findByUserId(auth.sub).catch(() => null)
      : null;
    const requestedBy = callerPlayer?.playerId ?? normalizedParticipants[0].playerId;
    const bookerName = auth.username || auth.email?.split('@')[0] || '';

    const rivalry = await rivalries.create({
      title: title.trim(),
      description: description?.trim() || undefined,
      heat: heat ?? 'warm',
      requestedBy,
      participants: normalizedParticipants.map((p) => ({
        playerId: p.playerId,
        role: p.role,
        wrestlerVariant: p.wrestlerVariant,
      })),
    });

    // Admin-created rivalries skip the pending queue — the GM is already
    // the moderator. Flip to active + tag the booker. Best-effort; the
    // rivalry exists either way.
    if (rivalry.status === 'pending') {
      try {
        const activated = await rivalries.update(rivalry.rivalryId, {
          status: 'active',
          startedAt: new Date().toISOString(),
          moderatedBy: bookerName || 'admin',
          bookerName: bookerName || undefined,
        });
        return created(activated);
      } catch {
        // Fall through with the pending record.
      }
    }

    return created(rivalry);
  } catch (err) {
    console.error('Error creating rivalry:', err);
    return serverError('Failed to create rivalry');
  }
};
