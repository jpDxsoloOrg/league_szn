/**
 * Faction-channel message — visible to every active member of a faction.
 * `messageType` distinguishes user posts from system events (e.g. member joined).
 */
export interface FactionMessage {
  messageId: string;
  factionId: string;
  authorPlayerId: string;
  body: string;
  messageType: 'user' | 'system';
  createdAt: string;
}

/**
 * 1:1 direct message between two members of the same faction.
 * `threadKey` is the deterministic sort of [senderPlayerId, recipientPlayerId]
 * joined by `#`, so both sides see the same thread regardless of who posted.
 */
export interface FactionDirectMessage {
  messageId: string;
  factionId: string;
  threadKey: string;
  senderPlayerId: string;
  recipientPlayerId: string;
  body: string;
  createdAt: string;
}

export interface FactionMessagePostInput {
  factionId: string;
  authorPlayerId: string;
  body: string;
  messageType?: 'user' | 'system';
}

export interface FactionDirectMessagePostInput {
  factionId: string;
  senderPlayerId: string;
  recipientPlayerId: string;
  body: string;
}
