import type {
  MatchmakingRepository,
  PresenceRecord,
  QueueRecord,
  InvitationRecord,
} from '../MatchmakingRepository';

export class InMemoryMatchmakingRepository implements MatchmakingRepository {
  readonly presenceStore = new Map<string, PresenceRecord>();
  readonly queueStore = new Map<string, QueueRecord>();
  readonly invitationStore = new Map<string, InvitationRecord>();

  // ── Presence ──────────────────────────────────────────────────────────

  async putPresence(record: PresenceRecord): Promise<void> {
    this.presenceStore.set(record.playerId, record);
  }

  async getPresence(playerId: string): Promise<PresenceRecord | null> {
    return this.presenceStore.get(playerId) ?? null;
  }

  async listPresence(): Promise<PresenceRecord[]> {
    return Array.from(this.presenceStore.values());
  }

  async deletePresence(playerId: string): Promise<void> {
    this.presenceStore.delete(playerId);
  }

  // ── Queue ─────────────────────────────────────────────────────────────

  async putQueue(record: QueueRecord): Promise<void> {
    this.queueStore.set(record.playerId, record);
  }

  async listQueue(): Promise<QueueRecord[]> {
    return Array.from(this.queueStore.values());
  }

  async deleteQueue(playerId: string): Promise<void> {
    this.queueStore.delete(playerId);
  }

  // ── Invitations ───────────────────────────────────────────────────────

  async putInvitation(record: InvitationRecord): Promise<void> {
    this.invitationStore.set(record.invitationId, record);
  }

  async getInvitation(invitationId: string): Promise<InvitationRecord | null> {
    return this.invitationStore.get(invitationId) ?? null;
  }

  async listInvitationsByToPlayer(toPlayerId: string): Promise<InvitationRecord[]> {
    return Array.from(this.invitationStore.values()).filter(
      (inv) => inv.toPlayerId === toPlayerId,
    );
  }

  async listInvitationsByFromPlayer(fromPlayerId: string): Promise<InvitationRecord[]> {
    return Array.from(this.invitationStore.values()).filter(
      (inv) => inv.fromPlayerId === fromPlayerId,
    );
  }

  async updateInvitation(
    invitationId: string,
    patch: Record<string, unknown>,
    conditionStatus?: string,
  ): Promise<InvitationRecord> {
    const existing = this.invitationStore.get(invitationId);
    if (!existing) throw new Error('Invitation not found');
    if (conditionStatus && existing.status !== conditionStatus) {
      const err = new Error('Condition not met');
      (err as unknown as Record<string, string>).name = 'ConditionalCheckFailedException';
      throw err;
    }
    const updated: InvitationRecord = { ...existing, ...patch } as InvitationRecord;
    this.invitationStore.set(invitationId, updated);
    return updated;
  }
}
