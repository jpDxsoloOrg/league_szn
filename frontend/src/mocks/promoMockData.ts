import { PromoWithContext, ReactionType } from '../types/promo';

export const REACTION_EMOJI: Record<ReactionType, string> = {
  fire: '\u{1F525}',
  mic: '\u{1F3A4}',
  trash: '\u{1F5D1}\uFE0F',
  'mind-blown': '\u{1F92F}',
  clap: '\u{1F44F}',
};

export const REACTION_LABELS: Record<ReactionType, string> = {
  fire: 'Fire',
  mic: 'Mic',
  trash: 'Trash',
  'mind-blown': 'Mind-Blown',
  clap: 'Clap',
};

export interface MockPlayer {
  playerId: string;
  playerName: string;
  wrestlerName: string;
  avatarColor: string;
}

export const mockPlayers: MockPlayer[] = [
  { playerId: 'p1', playerName: 'John', wrestlerName: 'Stone Cold', avatarColor: '#3b82f6' },
  { playerId: 'p2', playerName: 'Mike', wrestlerName: 'The Rock', avatarColor: '#ef4444' },
  { playerId: 'p3', playerName: 'Chris', wrestlerName: 'Triple H', avatarColor: '#d4af37' },
  { playerId: 'p4', playerName: 'Dave', wrestlerName: 'Undertaker', avatarColor: '#7c3aed' },
  { playerId: 'p5', playerName: 'Alex', wrestlerName: 'CM Punk', avatarColor: '#10b981' },
  { playerId: 'p6', playerName: 'Ryan', wrestlerName: 'John Cena', avatarColor: '#f59e0b' },
  { playerId: 'p7', playerName: 'Sam', wrestlerName: 'Randy Orton', avatarColor: '#6366f1' },
  { playerId: 'p8', playerName: 'Tom', wrestlerName: 'Edge', avatarColor: '#ec4899' },
];

export const mockMatches = [
  { matchId: 'm1', matchName: 'WrestleMania Main Event - Stone Cold vs The Rock' },
  { matchId: 'm2', matchName: 'SummerSlam - Triple H vs CM Punk' },
  { matchId: 'm3', matchName: 'Royal Rumble - 6-Man Battle Royal' },
];

export const mockChampionships = [
  { championshipId: 'c1', championshipName: 'WWE World Heavyweight Championship' },
  { championshipId: 'c2', championshipName: 'Intercontinental Championship' },
];

export const mockPromos: PromoWithContext[] = [
  // Call-out #1: Stone Cold calls out The Rock
  {
    promoId: 'promo-1',
    playerId: 'p1',
    promoType: 'call-out',
    title: 'The Rock Has Gone Soft!',
    content:
      'Hey @The Rock, you think you can waltz in here and claim to be the best in this league? You haven\'t beaten anyone worth mentioning in weeks. I\'m calling you out right here, right now. If you\'ve got any guts left, accept my challenge for next week. Austin 3:16 says I just whooped your candy ass!',
    targetPlayerId: 'p2',
    reactions: { u1: 'fire', u2: 'fire', u3: 'mic', u4: 'clap', u5: 'fire' },
    reactionCounts: { fire: 3, mic: 1, trash: 0, 'mind-blown': 0, clap: 1 },
    isPinned: false,
    isHidden: false,
    createdAt: '2026-02-05T14:30:00Z',
    updatedAt: '2026-02-05T14:30:00Z',
    playerName: 'John',
    wrestlerName: 'Stone Cold',
    targetPlayerName: 'Mike',
    targetWrestlerName: 'The Rock',
    responseCount: 1,
  },
  // Response #1: The Rock responds to Stone Cold
  {
    promoId: 'promo-2',
    playerId: 'p2',
    promoType: 'response',
    title: 'Know Your Role, Stone Cold!',
    content:
      'Finally... @Stone Cold has come back to running his mouth! You want to call The Rock out? The Rock says this: it doesn\'t matter what you think! You talk about guts? The Rock has more charisma in his eyebrow than you have in your entire bald head. You\'re on for next week, and The Rock is going to layeth the smacketh down on your candy ass!',
    targetPlayerId: 'p1',
    targetPromoId: 'promo-1',
    reactions: { u1: 'fire', u2: 'mic', u3: 'mic', u4: 'fire', u5: 'clap', u6: 'mind-blown' },
    reactionCounts: { fire: 2, mic: 2, trash: 0, 'mind-blown': 1, clap: 1 },
    isPinned: false,
    isHidden: false,
    createdAt: '2026-02-05T15:00:00Z',
    updatedAt: '2026-02-05T15:00:00Z',
    playerName: 'Mike',
    wrestlerName: 'The Rock',
    targetPlayerName: 'John',
    targetWrestlerName: 'Stone Cold',
    targetPromo: {
      promoId: 'promo-1',
      playerId: 'p1',
      promoType: 'call-out',
      title: 'The Rock Has Gone Soft!',
      content: '',
      reactions: {},
      reactionCounts: { fire: 3, mic: 1, trash: 0, 'mind-blown': 0, clap: 1 },
      isPinned: false,
      isHidden: false,
      createdAt: '2026-02-05T14:30:00Z',
      updatedAt: '2026-02-05T14:30:00Z',
    },
    responseCount: 0,
  },
  // Call-out #2: CM Punk calls out Triple H
  {
    promoId: 'promo-3',
    playerId: 'p5',
    promoType: 'call-out',
    title: 'Best in the World vs The King of Kings',
    content:
      'Hey @Triple H, you sit there on your throne thinking you run this place. Newsflash: the best in the world is right here, and I\'m tired of being overlooked. You want to play the game? Fine. But this time, I\'m changing the rules. I want you, one on one, no excuses. Prove you earned that spot or step aside for someone who actually deserves it.',
    targetPlayerId: 'p3',
    reactions: { u1: 'fire', u2: 'fire', u3: 'fire', u4: 'mic', u5: 'mind-blown' },
    reactionCounts: { fire: 3, mic: 1, trash: 0, 'mind-blown': 1, clap: 0 },
    isPinned: false,
    isHidden: false,
    createdAt: '2026-02-04T20:00:00Z',
    updatedAt: '2026-02-04T20:00:00Z',
    playerName: 'Alex',
    wrestlerName: 'CM Punk',
    targetPlayerName: 'Chris',
    targetWrestlerName: 'Triple H',
    responseCount: 1,
  },
  // Response #2: Triple H responds to CM Punk
  {
    promoId: 'promo-4',
    playerId: 'p3',
    promoType: 'response',
    title: 'Time to Play the Game',
    content:
      '@CM Punk, you want to talk about deserving? I\'ve been carrying this league since day one. You think a pipe bomb promo makes you special? In this ring, the only thing that matters is results. And my results speak for themselves. You want your shot? You got it. But be careful what you wish for, because I am the Game, and I am THAT. DAMN. GOOD.',
    targetPlayerId: 'p5',
    targetPromoId: 'promo-3',
    reactions: { u1: 'fire', u2: 'clap', u3: 'clap', u4: 'mic' },
    reactionCounts: { fire: 1, mic: 1, trash: 0, 'mind-blown': 0, clap: 2 },
    isPinned: false,
    isHidden: false,
    createdAt: '2026-02-04T21:30:00Z',
    updatedAt: '2026-02-04T21:30:00Z',
    playerName: 'Chris',
    wrestlerName: 'Triple H',
    targetPlayerName: 'Alex',
    targetWrestlerName: 'CM Punk',
    targetPromo: {
      promoId: 'promo-3',
      playerId: 'p5',
      promoType: 'call-out',
      title: 'Best in the World vs The King of Kings',
      content: '',
      reactions: {},
      reactionCounts: { fire: 3, mic: 1, trash: 0, 'mind-blown': 1, clap: 0 },
      isPinned: false,
      isHidden: false,
      createdAt: '2026-02-04T20:00:00Z',
      updatedAt: '2026-02-04T20:00:00Z',
    },
    responseCount: 0,
  },
  // Pre-match promo
  {
    promoId: 'promo-5',
    playerId: 'p1',
    promoType: 'pre-match',
    title: 'WrestleMania Is Coming',
    content:
      'WrestleMania is around the corner and Stone Cold Steve Austin is ready to raise hell! @The Rock, I hope you\'ve been training because this Sunday, you\'re stepping into the ring with the toughest SOB in this league. There will be no running, no hiding. Just you, me, and a can of whoop-ass with your name on it. And that\'s the bottom line!',
    matchId: 'm1',
    targetPlayerId: 'p2',
    reactions: { u1: 'fire', u2: 'fire', u3: 'clap', u4: 'clap', u5: 'clap', u6: 'mic' },
    reactionCounts: { fire: 2, mic: 1, trash: 0, 'mind-blown': 0, clap: 3 },
    isPinned: false,
    isHidden: false,
    createdAt: '2026-02-03T18:00:00Z',
    updatedAt: '2026-02-03T18:00:00Z',
    playerName: 'John',
    wrestlerName: 'Stone Cold',
    matchName: 'WrestleMania Main Event - Stone Cold vs The Rock',
    targetPlayerName: 'Mike',
    targetWrestlerName: 'The Rock',
    responseCount: 0,
  },
  // Post-match promo
  {
    promoId: 'promo-6',
    playerId: 'p6',
    promoType: 'post-match',
    title: 'The Champ Is Here!',
    content:
      'Just like I promised, John Cena came, saw, and conquered at SummerSlam! @Randy Orton gave it everything he had, but in the end, hustle, loyalty, and respect prevailed. You can\'t see me? Well tonight the whole world saw me stand tall in the center of that ring. The champ is HERE and he\'s not going anywhere!',
    matchId: 'm2',
    targetPlayerId: 'p7',
    reactions: { u1: 'clap', u2: 'clap', u3: 'trash', u4: 'fire' },
    reactionCounts: { fire: 1, mic: 0, trash: 1, 'mind-blown': 0, clap: 2 },
    isPinned: false,
    isHidden: false,
    createdAt: '2026-02-02T22:00:00Z',
    updatedAt: '2026-02-02T22:00:00Z',
    playerName: 'Ryan',
    wrestlerName: 'John Cena',
    matchName: 'SummerSlam - Triple H vs CM Punk',
    targetPlayerName: 'Sam',
    targetWrestlerName: 'Randy Orton',
    responseCount: 0,
  },
  // Championship promo
  {
    promoId: 'promo-7',
    playerId: 'p4',
    promoType: 'championship',
    title: 'Rest In Peace, Championship Division',
    content:
      'The Undertaker stands before you as the most dominant force in WWE 2K League history. This championship belt is not just gold \u2014 it is a symbol of the darkness that consumes all who dare challenge me. The streak lives on. The Deadman walks among you. And to anyone who thinks they can take this title from me: you will rest... in... peace.',
    championshipId: 'c1',
    reactions: { u1: 'fire', u2: 'fire', u3: 'fire', u4: 'mind-blown', u5: 'mind-blown', u6: 'mic', u7: 'clap' },
    reactionCounts: { fire: 3, mic: 1, trash: 0, 'mind-blown': 2, clap: 1 },
    isPinned: false,
    isHidden: false,
    createdAt: '2026-02-01T20:00:00Z',
    updatedAt: '2026-02-01T20:00:00Z',
    playerName: 'Dave',
    wrestlerName: 'Undertaker',
    championshipName: 'WWE World Heavyweight Championship',
    responseCount: 2,
  },
  // Return promo
  {
    promoId: 'promo-8',
    playerId: 'p8',
    promoType: 'return',
    title: 'You Think You Know Me?',
    content:
      'After months on the sidelines, the Rated-R Superstar is BACK! I\'ve been watching from home, seeing all of you pretend to run this league. @Undertaker, nice belt you got there. @CM Punk, cute speeches. @Stone Cold, same old act. But none of you saw this coming. Edge is back, and this time, I\'m taking everything. On this day, I see clearly \u2014 the opportunist has returned!',
    reactions: { u1: 'mind-blown', u2: 'mind-blown', u3: 'mind-blown', u4: 'fire', u5: 'fire', u6: 'clap', u7: 'clap', u8: 'mic' },
    reactionCounts: { fire: 2, mic: 1, trash: 0, 'mind-blown': 3, clap: 2 },
    isPinned: false,
    isHidden: false,
    createdAt: '2026-01-30T19:00:00Z',
    updatedAt: '2026-01-30T19:00:00Z',
    playerName: 'Tom',
    wrestlerName: 'Edge',
    responseCount: 0,
  },
  // Open mic promo
  {
    promoId: 'promo-9',
    playerId: 'p7',
    promoType: 'open-mic',
    title: 'The Viper Speaks',
    content:
      'They say the most dangerous creature is one that strikes without warning. That\'s exactly what The Viper does. I don\'t need to call anyone out. I don\'t need a championship to prove my worth. I\'ve been RKO\'ing fools left and right, and nobody is safe. Every single person in this league should be watching their back, because when you least expect it \u2014 BAM \u2014 RKO outta nowhere!',
    reactions: { u1: 'fire', u2: 'mic', u3: 'clap', u4: 'fire' },
    reactionCounts: { fire: 2, mic: 1, trash: 0, 'mind-blown': 0, clap: 1 },
    isPinned: false,
    isHidden: false,
    createdAt: '2026-01-29T16:00:00Z',
    updatedAt: '2026-01-29T16:00:00Z',
    playerName: 'Sam',
    wrestlerName: 'Randy Orton',
    responseCount: 0,
  },
  // Pinned promo (announcement style)
  {
    promoId: 'promo-10',
    playerId: 'p3',
    promoType: 'open-mic',
    title: 'The State of the League Address',
    content:
      'Welcome to a new era in WWE 2K League. As the longest-reigning competitor in this league, I\'m here to set the record straight. The competition has never been fiercer. @Stone Cold and @The Rock are at each other\'s throats. @CM Punk is on a warpath. @Undertaker holds the gold. And now @Edge is back. This is going to be the most explosive season yet. May the best wrestler win.',
    reactions: { u1: 'clap', u2: 'clap', u3: 'clap', u4: 'fire', u5: 'fire', u6: 'mic', u7: 'mic' },
    reactionCounts: { fire: 2, mic: 2, trash: 0, 'mind-blown': 0, clap: 3 },
    isPinned: true,
    isHidden: false,
    createdAt: '2026-02-06T10:00:00Z',
    updatedAt: '2026-02-06T10:00:00Z',
    playerName: 'Chris',
    wrestlerName: 'Triple H',
    responseCount: 0,
  },
  // Additional championship promo response to Undertaker
  {
    promoId: 'promo-11',
    playerId: 'p5',
    promoType: 'response',
    content:
      '@Undertaker, you talk about darkness and streaks, but the only streak I see is a streak of luck. The Best in the World is coming for that championship, and no amount of mind games will stop me. Your time is up, Deadman. It\'s time for a living, breathing champion who actually shows up every week.',
    targetPlayerId: 'p4',
    targetPromoId: 'promo-7',
    reactions: { u1: 'fire', u2: 'fire', u3: 'mic' },
    reactionCounts: { fire: 2, mic: 1, trash: 0, 'mind-blown': 0, clap: 0 },
    isPinned: false,
    isHidden: false,
    createdAt: '2026-02-02T10:00:00Z',
    updatedAt: '2026-02-02T10:00:00Z',
    playerName: 'Alex',
    wrestlerName: 'CM Punk',
    targetPlayerName: 'Dave',
    targetWrestlerName: 'Undertaker',
    targetPromo: {
      promoId: 'promo-7',
      playerId: 'p4',
      promoType: 'championship',
      title: 'Rest In Peace, Championship Division',
      content: '',
      reactions: {},
      reactionCounts: { fire: 3, mic: 1, trash: 0, 'mind-blown': 2, clap: 1 },
      isPinned: false,
      isHidden: false,
      createdAt: '2026-02-01T20:00:00Z',
      updatedAt: '2026-02-01T20:00:00Z',
    },
    responseCount: 0,
  },
];

export function getPromoById(promoId: string): PromoWithContext | undefined {
  return mockPromos.find((p) => p.promoId === promoId);
}

export function getResponsesForPromo(promoId: string): PromoWithContext[] {
  return mockPromos.filter((p) => p.targetPromoId === promoId);
}

export function getPinnedPromos(): PromoWithContext[] {
  return mockPromos.filter((p) => p.isPinned && !p.isHidden);
}

export function getVisiblePromos(): PromoWithContext[] {
  return mockPromos.filter((p) => !p.isHidden);
}
