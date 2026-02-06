import type { ChallengeWithPlayers } from '../types/challenge';

// Mock players for opponent selector and challenge data
export const mockChallengePlayers = [
  {
    playerId: 'player-001',
    playerName: 'John',
    wrestlerName: 'Stone Cold Steve Austin',
    imageUrl: undefined,
  },
  {
    playerId: 'player-002',
    playerName: 'Mike',
    wrestlerName: 'The Rock',
    imageUrl: undefined,
  },
  {
    playerId: 'player-003',
    playerName: 'Chris',
    wrestlerName: 'Triple H',
    imageUrl: undefined,
  },
  {
    playerId: 'player-004',
    playerName: 'Dave',
    wrestlerName: 'Undertaker',
    imageUrl: undefined,
  },
  {
    playerId: 'player-005',
    playerName: 'Alex',
    wrestlerName: 'CM Punk',
    imageUrl: undefined,
  },
  {
    playerId: 'player-006',
    playerName: 'Ryan',
    wrestlerName: 'John Cena',
    imageUrl: undefined,
  },
  {
    playerId: 'player-007',
    playerName: 'Sam',
    wrestlerName: 'Roman Reigns',
    imageUrl: undefined,
  },
  {
    playerId: 'player-008',
    playerName: 'Tyler',
    wrestlerName: 'Seth Rollins',
    imageUrl: undefined,
  },
];

// Current user is player-001 (John / Stone Cold)
export const mockCurrentPlayerId = 'player-001';

// Helper to get future date
function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export const mockChallenges: ChallengeWithPlayers[] = [
  // 1. Pending - received by current user, 3 days left
  {
    challengeId: 'challenge-001',
    challengerId: 'player-002',
    challengedId: 'player-001',
    matchType: 'Singles',
    stipulation: 'Steel Cage',
    message:
      "Stone Cold, I'm calling you out! Let's settle this once and for all inside the Steel Cage. No running, no hiding. Just you and me.",
    status: 'pending',
    expiresAt: daysFromNow(3),
    createdAt: daysAgo(4),
    updatedAt: daysAgo(4),
    challenger: {
      playerName: 'Mike',
      wrestlerName: 'The Rock',
    },
    challenged: {
      playerName: 'John',
      wrestlerName: 'Stone Cold Steve Austin',
    },
  },
  // 2. Pending - sent by current user, 5 days left
  {
    challengeId: 'challenge-002',
    challengerId: 'player-001',
    challengedId: 'player-003',
    matchType: 'Singles',
    stipulation: 'Last Man Standing',
    message:
      'Triple H, your reign of terror ends now. I challenge you to a Last Man Standing match. Bring everything you got.',
    status: 'pending',
    expiresAt: daysFromNow(5),
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
    challenger: {
      playerName: 'John',
      wrestlerName: 'Stone Cold Steve Austin',
    },
    challenged: {
      playerName: 'Chris',
      wrestlerName: 'Triple H',
    },
  },
  // 3. Accepted - awaiting scheduling
  {
    challengeId: 'challenge-003',
    challengerId: 'player-004',
    challengedId: 'player-005',
    matchType: 'Singles',
    stipulation: 'Hell in a Cell',
    message: 'CM Punk, you talk too much. Time to back it up inside Hell in a Cell.',
    responseMessage: "You're on, Undertaker. I'll show the world the Best in the World can survive Hell in a Cell.",
    status: 'accepted',
    expiresAt: daysAgo(1),
    createdAt: daysAgo(10),
    updatedAt: daysAgo(5),
    challenger: {
      playerName: 'Dave',
      wrestlerName: 'Undertaker',
    },
    challenged: {
      playerName: 'Alex',
      wrestlerName: 'CM Punk',
    },
  },
  // 4. Accepted - awaiting scheduling, current user involved
  {
    challengeId: 'challenge-004',
    challengerId: 'player-006',
    challengedId: 'player-001',
    matchType: 'Singles',
    message: "Stone Cold, you can't see me coming. Let's do this!",
    responseMessage: "Oh I'll see you alright. And that's the bottom line.",
    status: 'accepted',
    expiresAt: daysAgo(2),
    createdAt: daysAgo(12),
    updatedAt: daysAgo(6),
    challenger: {
      playerName: 'Ryan',
      wrestlerName: 'John Cena',
    },
    challenged: {
      playerName: 'John',
      wrestlerName: 'Stone Cold Steve Austin',
    },
  },
  // 5. Declined with response message
  {
    challengeId: 'challenge-005',
    challengerId: 'player-007',
    challengedId: 'player-008',
    matchType: 'Triple Threat',
    stipulation: 'Ladder',
    message: 'Seth Rollins, you claim to be the architect? Prove it in a Ladder match.',
    responseMessage:
      "Not interested in a Triple Threat. Challenge me to a straight-up singles match and maybe I'll consider it.",
    status: 'declined',
    expiresAt: daysAgo(3),
    createdAt: daysAgo(14),
    updatedAt: daysAgo(8),
    challenger: {
      playerName: 'Sam',
      wrestlerName: 'Roman Reigns',
    },
    challenged: {
      playerName: 'Tyler',
      wrestlerName: 'Seth Rollins',
    },
  },
  // 6. Countered - original challenge countered with different stipulation
  {
    challengeId: 'challenge-006',
    challengerId: 'player-003',
    challengedId: 'player-004',
    matchType: 'Singles',
    stipulation: 'Tables',
    message: 'Undertaker, I challenge you to a Tables match. The Game always wins.',
    responseMessage: "Tables? That's child's play. I counter with Iron Man rules. 60 minutes. Let's see who the real survivor is.",
    status: 'countered',
    counteredChallengeId: 'challenge-006-counter',
    expiresAt: daysAgo(1),
    createdAt: daysAgo(9),
    updatedAt: daysAgo(4),
    challenger: {
      playerName: 'Chris',
      wrestlerName: 'Triple H',
    },
    challenged: {
      playerName: 'Dave',
      wrestlerName: 'Undertaker',
    },
  },
  // 6b. The counter-challenge
  {
    challengeId: 'challenge-006-counter',
    challengerId: 'player-004',
    challengedId: 'player-003',
    matchType: 'Singles',
    stipulation: 'Iron Man',
    message: '60-minute Iron Man match. No shortcuts, no excuses. Pure endurance.',
    status: 'pending',
    expiresAt: daysFromNow(4),
    createdAt: daysAgo(4),
    updatedAt: daysAgo(4),
    challenger: {
      playerName: 'Dave',
      wrestlerName: 'Undertaker',
    },
    challenged: {
      playerName: 'Chris',
      wrestlerName: 'Triple H',
    },
  },
  // 7. Scheduled - linked to a mock match
  {
    challengeId: 'challenge-007',
    challengerId: 'player-005',
    challengedId: 'player-006',
    matchType: 'Singles',
    stipulation: 'Steel Cage',
    championshipId: 'champ-001',
    message: "John Cena, I'm the Best in the World and I'm coming for your championship!",
    responseMessage: 'Hustle, Loyalty, Respect. Bring it on, Punk.',
    status: 'scheduled',
    matchId: 'match-challenge-007',
    expiresAt: daysAgo(10),
    createdAt: daysAgo(20),
    updatedAt: daysAgo(3),
    challenger: {
      playerName: 'Alex',
      wrestlerName: 'CM Punk',
    },
    challenged: {
      playerName: 'Ryan',
      wrestlerName: 'John Cena',
    },
  },
  // 8. Expired
  {
    challengeId: 'challenge-008',
    challengerId: 'player-008',
    challengedId: 'player-007',
    matchType: 'Tag Team',
    message: 'Roman, find a partner. Tag team action. What do you say?',
    status: 'expired',
    expiresAt: daysAgo(7),
    createdAt: daysAgo(21),
    updatedAt: daysAgo(7),
    challenger: {
      playerName: 'Tyler',
      wrestlerName: 'Seth Rollins',
    },
    challenged: {
      playerName: 'Sam',
      wrestlerName: 'Roman Reigns',
    },
  },
];

export const matchTypes = [
  'Singles',
  'Tag Team',
  'Triple Threat',
  'Fatal 4-Way',
  'Six Pack Challenge',
  'Battle Royal',
];

export const stipulations = [
  'None',
  'Steel Cage',
  'Ladder',
  'Hell in a Cell',
  'Last Man Standing',
  'Iron Man',
  'Tables',
];
