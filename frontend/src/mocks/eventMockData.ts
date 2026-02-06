import type {
  LeagueEvent,
  EventWithMatches,
  EventCalendarEntry,
  EnrichedMatchData,
  MatchCardEntry,
} from '../types/event';

// ── Mock Events ──────────────────────────────────────────────────────────────

export const mockEvents: LeagueEvent[] = [
  // PPV: WrestleMania 40 (completed)
  {
    eventId: 'evt-001',
    name: 'WrestleMania 40',
    eventType: 'ppv',
    date: '2026-04-05T19:00:00.000Z',
    venue: 'MetLife Stadium, East Rutherford, NJ',
    description: 'The grandest stage of them all! WrestleMania 40 features the biggest matches of the season with championship gold on the line.',
    themeColor: '#d4af37',
    status: 'completed',
    seasonId: 'season-002',
    matchCards: [
      { position: 1, matchId: 'match-wm-001', designation: 'pre-show', notes: 'Pre-show kickoff match' },
      { position: 2, matchId: 'match-wm-002', designation: 'opener' },
      { position: 3, matchId: 'match-wm-003', designation: 'midcard' },
      { position: 4, matchId: 'match-wm-004', designation: 'midcard', notes: 'Championship match' },
      { position: 5, matchId: 'match-wm-005', designation: 'co-main', notes: 'Championship match' },
      { position: 6, matchId: 'match-wm-006', designation: 'main-event', notes: 'Championship match - Main Event' },
    ],
    attendance: 82500,
    rating: 4.5,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-04-06T02:00:00.000Z',
  },
  // PPV: Royal Rumble (completed)
  {
    eventId: 'evt-002',
    name: 'Royal Rumble 2026',
    eventType: 'ppv',
    date: '2026-01-25T19:00:00.000Z',
    venue: 'Lucas Oil Stadium, Indianapolis, IN',
    description: 'The road to WrestleMania begins here! 30 superstars compete in the annual Royal Rumble match.',
    themeColor: '#1e40af',
    status: 'completed',
    seasonId: 'season-002',
    matchCards: [
      { position: 1, matchId: 'match-rr-001', designation: 'pre-show' },
      { position: 2, matchId: 'match-rr-002', designation: 'opener', notes: 'Championship match' },
      { position: 3, matchId: 'match-rr-003', designation: 'midcard' },
      { position: 4, matchId: 'match-rr-004', designation: 'co-main' },
      { position: 5, matchId: 'match-rr-005', designation: 'main-event', notes: 'Royal Rumble Match' },
    ],
    attendance: 55000,
    rating: 4.0,
    createdAt: '2025-12-01T00:00:00.000Z',
    updatedAt: '2026-01-26T02:00:00.000Z',
  },
  // Weekly: Raw Episode 1 (completed)
  {
    eventId: 'evt-003',
    name: 'Monday Night Raw #1',
    eventType: 'weekly',
    date: '2026-04-07T20:00:00.000Z',
    venue: 'Barclays Center, Brooklyn, NY',
    description: 'The Raw after WrestleMania! New rivalries begin.',
    themeColor: '#dc2626',
    status: 'completed',
    seasonId: 'season-002',
    matchCards: [
      { position: 1, matchId: 'match-raw1-001', designation: 'opener' },
      { position: 2, matchId: 'match-raw1-002', designation: 'midcard' },
      { position: 3, matchId: 'match-raw1-003', designation: 'main-event' },
    ],
    attendance: 18500,
    rating: 3.5,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-08T01:00:00.000Z',
  },
  // Weekly: Raw Episode 2 (completed)
  {
    eventId: 'evt-004',
    name: 'Monday Night Raw #2',
    eventType: 'weekly',
    date: '2026-04-14T20:00:00.000Z',
    venue: 'Wells Fargo Center, Philadelphia, PA',
    description: 'Rivalries heat up as superstars vie for championship opportunities.',
    themeColor: '#dc2626',
    status: 'completed',
    seasonId: 'season-002',
    matchCards: [
      { position: 1, matchId: 'match-raw2-001', designation: 'opener' },
      { position: 2, matchId: 'match-raw2-002', designation: 'midcard' },
      { position: 3, matchId: 'match-raw2-003', designation: 'main-event' },
    ],
    attendance: 17200,
    rating: 3.0,
    createdAt: '2026-04-08T00:00:00.000Z',
    updatedAt: '2026-04-15T01:00:00.000Z',
  },
  // Weekly: Raw Episode 3 (upcoming)
  {
    eventId: 'evt-005',
    name: 'Monday Night Raw #3',
    eventType: 'weekly',
    date: '2026-04-21T20:00:00.000Z',
    venue: 'TD Garden, Boston, MA',
    description: 'The build to Backlash continues with high-stakes matches.',
    themeColor: '#dc2626',
    status: 'upcoming',
    seasonId: 'season-002',
    matchCards: [
      { position: 1, matchId: 'match-raw3-001', designation: 'opener' },
      { position: 2, matchId: 'match-raw3-002', designation: 'midcard' },
      { position: 3, matchId: 'match-raw3-003', designation: 'main-event' },
    ],
    createdAt: '2026-04-15T00:00:00.000Z',
    updatedAt: '2026-04-15T00:00:00.000Z',
  },
  // Weekly: Raw Episode 4 (upcoming)
  {
    eventId: 'evt-006',
    name: 'Monday Night Raw #4',
    eventType: 'weekly',
    date: '2026-04-28T20:00:00.000Z',
    venue: 'United Center, Chicago, IL',
    description: 'The go-home show before Backlash. Tensions reach a boiling point.',
    themeColor: '#dc2626',
    status: 'upcoming',
    seasonId: 'season-002',
    matchCards: [],
    createdAt: '2026-04-15T00:00:00.000Z',
    updatedAt: '2026-04-15T00:00:00.000Z',
  },
  // Special: NXT TakeOver (upcoming)
  {
    eventId: 'evt-007',
    name: 'NXT TakeOver: Spring Breakout',
    eventType: 'special',
    date: '2026-04-18T20:00:00.000Z',
    venue: 'Capitol Wrestling Center, Orlando, FL',
    description: 'NXT presents its premier special event featuring the best up-and-coming talent.',
    themeColor: '#a78bfa',
    status: 'upcoming',
    seasonId: 'season-002',
    matchCards: [
      { position: 1, matchId: 'match-nxt-001', designation: 'opener' },
      { position: 2, matchId: 'match-nxt-002', designation: 'midcard' },
      { position: 3, matchId: 'match-nxt-003', designation: 'co-main', notes: 'Championship match' },
      { position: 4, matchId: 'match-nxt-004', designation: 'main-event', notes: 'Championship match' },
    ],
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-04-10T00:00:00.000Z',
  },
  // House Show (upcoming)
  {
    eventId: 'evt-008',
    name: 'Live Event - Atlanta',
    eventType: 'house',
    date: '2026-04-19T19:30:00.000Z',
    venue: 'State Farm Arena, Atlanta, GA',
    description: 'WWE Live Event featuring your favorite superstars in non-televised action.',
    themeColor: '#6b7280',
    status: 'upcoming',
    seasonId: 'season-002',
    matchCards: [
      { position: 1, matchId: 'match-house-001', designation: 'opener' },
      { position: 2, matchId: 'match-house-002', designation: 'midcard' },
      { position: 3, matchId: 'match-house-003', designation: 'main-event' },
    ],
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  },
];

// ── Enriched Match Data for Completed Events ──────────────────────────────────

const wrestleManiaMatches: Record<string, EnrichedMatchData> = {
  'match-wm-001': {
    matchId: 'match-wm-001',
    matchType: 'singles',
    participants: [
      { playerId: 'p-alex', playerName: 'Alex', wrestlerName: 'CM Punk' },
      { playerId: 'p-ryan', playerName: 'Ryan', wrestlerName: 'John Cena' },
    ],
    winners: ['p-alex'],
    losers: ['p-ryan'],
    isChampionship: false,
    status: 'completed',
  },
  'match-wm-002': {
    matchId: 'match-wm-002',
    matchType: 'tag',
    participants: [
      { playerId: 'p-john', playerName: 'John', wrestlerName: 'Stone Cold' },
      { playerId: 'p-dave', playerName: 'Dave', wrestlerName: 'Undertaker' },
      { playerId: 'p-alex', playerName: 'Alex', wrestlerName: 'CM Punk' },
      { playerId: 'p-ryan', playerName: 'Ryan', wrestlerName: 'John Cena' },
    ],
    winners: ['p-john', 'p-dave'],
    losers: ['p-alex', 'p-ryan'],
    isChampionship: false,
    status: 'completed',
  },
  'match-wm-003': {
    matchId: 'match-wm-003',
    matchType: 'triple-threat',
    stipulation: 'Ladder Match',
    participants: [
      { playerId: 'p-chris', playerName: 'Chris', wrestlerName: 'Triple H' },
      { playerId: 'p-alex', playerName: 'Alex', wrestlerName: 'CM Punk' },
      { playerId: 'p-ryan', playerName: 'Ryan', wrestlerName: 'John Cena' },
    ],
    winners: ['p-chris'],
    losers: ['p-alex', 'p-ryan'],
    isChampionship: false,
    status: 'completed',
  },
  'match-wm-004': {
    matchId: 'match-wm-004',
    matchType: 'singles',
    participants: [
      { playerId: 'p-dave', playerName: 'Dave', wrestlerName: 'Undertaker' },
      { playerId: 'p-mike', playerName: 'Mike', wrestlerName: 'The Rock' },
    ],
    winners: ['p-dave'],
    losers: ['p-mike'],
    isChampionship: true,
    championshipName: 'Intercontinental Championship',
    status: 'completed',
  },
  'match-wm-005': {
    matchId: 'match-wm-005',
    matchType: 'singles',
    stipulation: 'Hell in a Cell',
    participants: [
      { playerId: 'p-mike', playerName: 'Mike', wrestlerName: 'The Rock' },
      { playerId: 'p-chris', playerName: 'Chris', wrestlerName: 'Triple H' },
    ],
    winners: ['p-mike'],
    losers: ['p-chris'],
    isChampionship: true,
    championshipName: 'World Heavyweight Championship',
    status: 'completed',
  },
  'match-wm-006': {
    matchId: 'match-wm-006',
    matchType: 'singles',
    participants: [
      { playerId: 'p-john', playerName: 'John', wrestlerName: 'Stone Cold' },
      { playerId: 'p-mike', playerName: 'Mike', wrestlerName: 'The Rock' },
    ],
    winners: ['p-john'],
    losers: ['p-mike'],
    isChampionship: true,
    championshipName: 'WWE Championship',
    status: 'completed',
  },
};

const royalRumbleMatches: Record<string, EnrichedMatchData> = {
  'match-rr-001': {
    matchId: 'match-rr-001',
    matchType: 'singles',
    participants: [
      { playerId: 'p-alex', playerName: 'Alex', wrestlerName: 'CM Punk' },
      { playerId: 'p-dave', playerName: 'Dave', wrestlerName: 'Undertaker' },
    ],
    winners: ['p-alex'],
    losers: ['p-dave'],
    isChampionship: false,
    status: 'completed',
  },
  'match-rr-002': {
    matchId: 'match-rr-002',
    matchType: 'singles',
    participants: [
      { playerId: 'p-chris', playerName: 'Chris', wrestlerName: 'Triple H' },
      { playerId: 'p-ryan', playerName: 'Ryan', wrestlerName: 'John Cena' },
    ],
    winners: ['p-chris'],
    losers: ['p-ryan'],
    isChampionship: true,
    championshipName: 'United States Championship',
    status: 'completed',
  },
  'match-rr-003': {
    matchId: 'match-rr-003',
    matchType: 'tag',
    participants: [
      { playerId: 'p-john', playerName: 'John', wrestlerName: 'Stone Cold' },
      { playerId: 'p-mike', playerName: 'Mike', wrestlerName: 'The Rock' },
      { playerId: 'p-alex', playerName: 'Alex', wrestlerName: 'CM Punk' },
      { playerId: 'p-chris', playerName: 'Chris', wrestlerName: 'Triple H' },
    ],
    winners: ['p-john', 'p-mike'],
    losers: ['p-alex', 'p-chris'],
    isChampionship: false,
    status: 'completed',
  },
  'match-rr-004': {
    matchId: 'match-rr-004',
    matchType: 'singles',
    stipulation: 'Steel Cage',
    participants: [
      { playerId: 'p-mike', playerName: 'Mike', wrestlerName: 'The Rock' },
      { playerId: 'p-dave', playerName: 'Dave', wrestlerName: 'Undertaker' },
    ],
    winners: ['p-mike'],
    losers: ['p-dave'],
    isChampionship: false,
    status: 'completed',
  },
  'match-rr-005': {
    matchId: 'match-rr-005',
    matchType: 'battle-royal',
    stipulation: 'Royal Rumble Match',
    participants: [
      { playerId: 'p-john', playerName: 'John', wrestlerName: 'Stone Cold' },
      { playerId: 'p-mike', playerName: 'Mike', wrestlerName: 'The Rock' },
      { playerId: 'p-chris', playerName: 'Chris', wrestlerName: 'Triple H' },
      { playerId: 'p-dave', playerName: 'Dave', wrestlerName: 'Undertaker' },
      { playerId: 'p-alex', playerName: 'Alex', wrestlerName: 'CM Punk' },
      { playerId: 'p-ryan', playerName: 'Ryan', wrestlerName: 'John Cena' },
    ],
    winners: ['p-john'],
    losers: ['p-mike', 'p-chris', 'p-dave', 'p-alex', 'p-ryan'],
    isChampionship: false,
    status: 'completed',
  },
};

const rawEp1Matches: Record<string, EnrichedMatchData> = {
  'match-raw1-001': {
    matchId: 'match-raw1-001',
    matchType: 'singles',
    participants: [
      { playerId: 'p-alex', playerName: 'Alex', wrestlerName: 'CM Punk' },
      { playerId: 'p-chris', playerName: 'Chris', wrestlerName: 'Triple H' },
    ],
    winners: ['p-alex'],
    losers: ['p-chris'],
    isChampionship: false,
    status: 'completed',
  },
  'match-raw1-002': {
    matchId: 'match-raw1-002',
    matchType: 'singles',
    participants: [
      { playerId: 'p-dave', playerName: 'Dave', wrestlerName: 'Undertaker' },
      { playerId: 'p-ryan', playerName: 'Ryan', wrestlerName: 'John Cena' },
    ],
    winners: ['p-dave'],
    losers: ['p-ryan'],
    isChampionship: false,
    status: 'completed',
  },
  'match-raw1-003': {
    matchId: 'match-raw1-003',
    matchType: 'singles',
    stipulation: 'No Disqualification',
    participants: [
      { playerId: 'p-john', playerName: 'John', wrestlerName: 'Stone Cold' },
      { playerId: 'p-mike', playerName: 'Mike', wrestlerName: 'The Rock' },
    ],
    winners: ['p-john'],
    losers: ['p-mike'],
    isChampionship: true,
    championshipName: 'WWE Championship',
    status: 'completed',
  },
};

const rawEp2Matches: Record<string, EnrichedMatchData> = {
  'match-raw2-001': {
    matchId: 'match-raw2-001',
    matchType: 'tag',
    participants: [
      { playerId: 'p-john', playerName: 'John', wrestlerName: 'Stone Cold' },
      { playerId: 'p-alex', playerName: 'Alex', wrestlerName: 'CM Punk' },
      { playerId: 'p-mike', playerName: 'Mike', wrestlerName: 'The Rock' },
      { playerId: 'p-chris', playerName: 'Chris', wrestlerName: 'Triple H' },
    ],
    winners: ['p-mike', 'p-chris'],
    losers: ['p-john', 'p-alex'],
    isChampionship: false,
    status: 'completed',
  },
  'match-raw2-002': {
    matchId: 'match-raw2-002',
    matchType: 'singles',
    participants: [
      { playerId: 'p-ryan', playerName: 'Ryan', wrestlerName: 'John Cena' },
      { playerId: 'p-dave', playerName: 'Dave', wrestlerName: 'Undertaker' },
    ],
    winners: ['p-ryan'],
    losers: ['p-dave'],
    isChampionship: false,
    status: 'completed',
  },
  'match-raw2-003': {
    matchId: 'match-raw2-003',
    matchType: 'singles',
    participants: [
      { playerId: 'p-john', playerName: 'John', wrestlerName: 'Stone Cold' },
      { playerId: 'p-chris', playerName: 'Chris', wrestlerName: 'Triple H' },
    ],
    winners: ['p-chris'],
    losers: ['p-john'],
    isChampionship: true,
    championshipName: 'WWE Championship',
    status: 'completed',
  },
};

// Scheduled/upcoming match data
const rawEp3Matches: Record<string, EnrichedMatchData> = {
  'match-raw3-001': {
    matchId: 'match-raw3-001',
    matchType: 'singles',
    participants: [
      { playerId: 'p-alex', playerName: 'Alex', wrestlerName: 'CM Punk' },
      { playerId: 'p-ryan', playerName: 'Ryan', wrestlerName: 'John Cena' },
    ],
    isChampionship: false,
    status: 'scheduled',
  },
  'match-raw3-002': {
    matchId: 'match-raw3-002',
    matchType: 'triple-threat',
    participants: [
      { playerId: 'p-mike', playerName: 'Mike', wrestlerName: 'The Rock' },
      { playerId: 'p-dave', playerName: 'Dave', wrestlerName: 'Undertaker' },
      { playerId: 'p-ryan', playerName: 'Ryan', wrestlerName: 'John Cena' },
    ],
    isChampionship: false,
    status: 'scheduled',
  },
  'match-raw3-003': {
    matchId: 'match-raw3-003',
    matchType: 'singles',
    stipulation: 'Last Man Standing',
    participants: [
      { playerId: 'p-chris', playerName: 'Chris', wrestlerName: 'Triple H' },
      { playerId: 'p-john', playerName: 'John', wrestlerName: 'Stone Cold' },
    ],
    isChampionship: true,
    championshipName: 'WWE Championship',
    status: 'scheduled',
  },
};

const nxtMatches: Record<string, EnrichedMatchData> = {
  'match-nxt-001': {
    matchId: 'match-nxt-001',
    matchType: 'singles',
    participants: [
      { playerId: 'p-alex', playerName: 'Alex', wrestlerName: 'CM Punk' },
      { playerId: 'p-ryan', playerName: 'Ryan', wrestlerName: 'John Cena' },
    ],
    isChampionship: false,
    status: 'scheduled',
  },
  'match-nxt-002': {
    matchId: 'match-nxt-002',
    matchType: 'tag',
    participants: [
      { playerId: 'p-john', playerName: 'John', wrestlerName: 'Stone Cold' },
      { playerId: 'p-dave', playerName: 'Dave', wrestlerName: 'Undertaker' },
      { playerId: 'p-mike', playerName: 'Mike', wrestlerName: 'The Rock' },
      { playerId: 'p-chris', playerName: 'Chris', wrestlerName: 'Triple H' },
    ],
    isChampionship: false,
    status: 'scheduled',
  },
  'match-nxt-003': {
    matchId: 'match-nxt-003',
    matchType: 'singles',
    participants: [
      { playerId: 'p-dave', playerName: 'Dave', wrestlerName: 'Undertaker' },
      { playerId: 'p-chris', playerName: 'Chris', wrestlerName: 'Triple H' },
    ],
    isChampionship: true,
    championshipName: 'NXT Championship',
    status: 'scheduled',
  },
  'match-nxt-004': {
    matchId: 'match-nxt-004',
    matchType: 'singles',
    stipulation: 'Iron Man Match (30 min)',
    participants: [
      { playerId: 'p-john', playerName: 'John', wrestlerName: 'Stone Cold' },
      { playerId: 'p-mike', playerName: 'Mike', wrestlerName: 'The Rock' },
    ],
    isChampionship: true,
    championshipName: 'NXT North American Championship',
    status: 'scheduled',
  },
};

const houseShowMatches: Record<string, EnrichedMatchData> = {
  'match-house-001': {
    matchId: 'match-house-001',
    matchType: 'singles',
    participants: [
      { playerId: 'p-alex', playerName: 'Alex', wrestlerName: 'CM Punk' },
      { playerId: 'p-dave', playerName: 'Dave', wrestlerName: 'Undertaker' },
    ],
    isChampionship: false,
    status: 'scheduled',
  },
  'match-house-002': {
    matchId: 'match-house-002',
    matchType: 'tag',
    participants: [
      { playerId: 'p-john', playerName: 'John', wrestlerName: 'Stone Cold' },
      { playerId: 'p-ryan', playerName: 'Ryan', wrestlerName: 'John Cena' },
      { playerId: 'p-mike', playerName: 'Mike', wrestlerName: 'The Rock' },
      { playerId: 'p-chris', playerName: 'Chris', wrestlerName: 'Triple H' },
    ],
    isChampionship: false,
    status: 'scheduled',
  },
  'match-house-003': {
    matchId: 'match-house-003',
    matchType: 'singles',
    participants: [
      { playerId: 'p-john', playerName: 'John', wrestlerName: 'Stone Cold' },
      { playerId: 'p-mike', playerName: 'Mike', wrestlerName: 'The Rock' },
    ],
    isChampionship: false,
    status: 'scheduled',
  },
};

// All match data organized by event
export const mockMatchDataByEvent: Record<string, Record<string, EnrichedMatchData>> = {
  'evt-001': wrestleManiaMatches,
  'evt-002': royalRumbleMatches,
  'evt-003': rawEp1Matches,
  'evt-004': rawEp2Matches,
  'evt-005': rawEp3Matches,
  'evt-007': nxtMatches,
  'evt-008': houseShowMatches,
};

// ── Helper: Build EventWithMatches ────────────────────────────────────────────

export function getEventWithMatches(eventId: string): EventWithMatches | null {
  const event = mockEvents.find((e) => e.eventId === eventId);
  if (!event) return null;

  const matchDataMap = mockMatchDataByEvent[eventId] || {};

  const enrichedMatches = event.matchCards
    .map((card: MatchCardEntry) => {
      const matchData = matchDataMap[card.matchId];
      if (!matchData) return null;
      return { ...card, matchData };
    })
    .filter((m): m is MatchCardEntry & { matchData: EnrichedMatchData } => m !== null);

  return { ...event, enrichedMatches };
}

// ── Calendar Entries ──────────────────────────────────────────────────────────

export const mockCalendarEntries: EventCalendarEntry[] = mockEvents.map((event) => {
  const matchDataMap = mockMatchDataByEvent[event.eventId] || {};
  const matchDataValues = Object.values(matchDataMap);
  const championshipMatchCount = matchDataValues.filter((m) => m.isChampionship).length;

  return {
    eventId: event.eventId,
    name: event.name,
    eventType: event.eventType,
    date: event.date,
    status: event.status,
    matchCount: event.matchCards.length,
    championshipMatchCount,
    imageUrl: event.imageUrl,
  };
});

// ── Mock available matches for MatchCardBuilder ───────────────────────────────

export const mockAvailableMatches = [
  {
    matchId: 'avail-match-001',
    label: 'Stone Cold vs The Rock (Singles)',
    matchType: 'singles',
    isChampionship: false,
  },
  {
    matchId: 'avail-match-002',
    label: 'Triple H vs CM Punk (Singles - IC Title)',
    matchType: 'singles',
    isChampionship: true,
  },
  {
    matchId: 'avail-match-003',
    label: 'Undertaker vs John Cena (Singles)',
    matchType: 'singles',
    isChampionship: false,
  },
  {
    matchId: 'avail-match-004',
    label: 'Stone Cold & Undertaker vs Rock & Triple H (Tag)',
    matchType: 'tag',
    isChampionship: false,
  },
  {
    matchId: 'avail-match-005',
    label: 'CM Punk vs John Cena vs Triple H (Triple Threat - WWE Title)',
    matchType: 'triple-threat',
    isChampionship: true,
  },
  {
    matchId: 'avail-match-006',
    label: 'Undertaker vs The Rock (Singles - World Title)',
    matchType: 'singles',
    isChampionship: true,
  },
];

// ── Mock seasons for admin dropdowns ──────────────────────────────────────────

export const mockEventSeasons = [
  { seasonId: 'season-001', name: 'Season 1' },
  { seasonId: 'season-002', name: 'Season 2' },
  { seasonId: 'season-003', name: 'Season 3' },
];
