import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

// Configure DynamoDB client for local use
const client = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:8000',
  credentials: {
    accessKeyId: 'dummy',
    secretAccessKey: 'dummy',
  },
});

const docClient = DynamoDBDocumentClient.from(client);

const TABLES = {
  PLAYERS: 'wwe-2k-league-api-players-dev',
  MATCHES: 'wwe-2k-league-api-matches-dev',
  CHAMPIONSHIPS: 'wwe-2k-league-api-championships-dev',
  CHAMPIONSHIP_HISTORY: 'wwe-2k-league-api-championship-history-dev',
  TOURNAMENTS: 'wwe-2k-league-api-tournaments-dev',
};

async function seedData() {
  console.log('Starting to seed data...\n');

  // Create players
  console.log('Creating players...');
  const players = [
    {
      playerId: uuidv4(),
      name: 'John Stone',
      currentWrestler: 'Stone Cold Steve Austin',
      wins: 12,
      losses: 5,
      draws: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      playerId: uuidv4(),
      name: 'Mike Rock',
      currentWrestler: 'The Rock',
      wins: 11,
      losses: 6,
      draws: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      playerId: uuidv4(),
      name: 'Jake Undertaker',
      currentWrestler: 'The Undertaker',
      wins: 10,
      losses: 7,
      draws: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      playerId: uuidv4(),
      name: 'Chris Helmsley',
      currentWrestler: 'Triple H',
      wins: 9,
      losses: 8,
      draws: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      playerId: uuidv4(),
      name: 'Alex Michaels',
      currentWrestler: 'Shawn Michaels',
      wins: 8,
      losses: 9,
      draws: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      playerId: uuidv4(),
      name: 'Sam Hart',
      currentWrestler: 'Bret Hart',
      wins: 7,
      losses: 10,
      draws: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  for (const player of players) {
    await docClient.send(new PutCommand({
      TableName: TABLES.PLAYERS,
      Item: player,
    }));
    console.log(`✓ Created player: ${player.name}`);
  }

  // Create championships
  console.log('\nCreating championships...');
  const championships = [
    {
      championshipId: uuidv4(),
      name: 'World Heavyweight Championship',
      type: 'singles',
      currentChampion: players[0].playerId,
      createdAt: new Date().toISOString(),
      isActive: true,
    },
    {
      championshipId: uuidv4(),
      name: 'Intercontinental Championship',
      type: 'singles',
      currentChampion: players[1].playerId,
      createdAt: new Date().toISOString(),
      isActive: true,
    },
    {
      championshipId: uuidv4(),
      name: 'Tag Team Championship',
      type: 'tag',
      currentChampion: [players[2].playerId, players[3].playerId],
      createdAt: new Date().toISOString(),
      isActive: true,
    },
  ];

  for (const championship of championships) {
    await docClient.send(new PutCommand({
      TableName: TABLES.CHAMPIONSHIPS,
      Item: championship,
    }));
    console.log(`✓ Created championship: ${championship.name}`);
  }

  // Create championship history
  console.log('\nCreating championship history...');
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  await docClient.send(new PutCommand({
    TableName: TABLES.CHAMPIONSHIP_HISTORY,
    Item: {
      championshipId: championships[0].championshipId,
      wonDate: thirtyDaysAgo.toISOString(),
      champion: players[0].playerId,
      matchId: uuidv4(),
    },
  }));
  console.log('✓ Created championship history for World Heavyweight Championship');

  await docClient.send(new PutCommand({
    TableName: TABLES.CHAMPIONSHIP_HISTORY,
    Item: {
      championshipId: championships[1].championshipId,
      wonDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      champion: players[1].playerId,
      matchId: uuidv4(),
    },
  }));
  console.log('✓ Created championship history for Intercontinental Championship');

  // Create some matches
  console.log('\nCreating matches...');
  const matches = [
    {
      matchId: uuidv4(),
      date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      matchType: 'singles',
      stipulation: 'No DQ',
      participants: [players[0].playerId, players[1].playerId],
      winners: [players[0].playerId],
      losers: [players[1].playerId],
      isChampionship: false,
      status: 'completed',
      createdAt: new Date().toISOString(),
    },
    {
      matchId: uuidv4(),
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      matchType: 'triple-threat',
      stipulation: 'Ladder Match',
      participants: [players[2].playerId, players[3].playerId, players[4].playerId],
      winners: [players[2].playerId],
      losers: [players[3].playerId, players[4].playerId],
      isChampionship: false,
      status: 'completed',
      createdAt: new Date().toISOString(),
    },
    {
      matchId: uuidv4(),
      date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      matchType: 'singles',
      stipulation: 'Steel Cage',
      participants: [players[0].playerId, players[2].playerId],
      isChampionship: true,
      championshipId: championships[0].championshipId,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    },
    {
      matchId: uuidv4(),
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      matchType: 'tag',
      participants: [players[2].playerId, players[3].playerId, players[4].playerId, players[5].playerId],
      isChampionship: true,
      championshipId: championships[2].championshipId,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    },
  ];

  for (const match of matches) {
    await docClient.send(new PutCommand({
      TableName: TABLES.MATCHES,
      Item: match,
    }));
    console.log(`✓ Created match: ${match.matchType} (${match.status})`);
  }

  // Create a tournament
  console.log('\nCreating tournament...');
  const tournament = {
    tournamentId: uuidv4(),
    name: 'King of the Ring 2024',
    type: 'single-elimination',
    status: 'in-progress',
    participants: [players[0].playerId, players[1].playerId, players[2].playerId, players[3].playerId],
    brackets: {
      rounds: [
        {
          roundNumber: 1,
          matches: [
            {
              participant1: players[0].playerId,
              participant2: players[1].playerId,
              winner: players[0].playerId,
            },
            {
              participant1: players[2].playerId,
              participant2: players[3].playerId,
              winner: players[2].playerId,
            },
          ],
        },
        {
          roundNumber: 2,
          matches: [
            {
              participant1: players[0].playerId,
              participant2: players[2].playerId,
            },
          ],
        },
      ],
    },
    createdAt: new Date().toISOString(),
  };

  await docClient.send(new PutCommand({
    TableName: TABLES.TOURNAMENTS,
    Item: tournament,
  }));
  console.log('✓ Created tournament: King of the Ring 2024');

  // Create a round-robin tournament
  const roundRobinTournament = {
    tournamentId: uuidv4(),
    name: 'G1 Climax 2024',
    type: 'round-robin',
    status: 'in-progress',
    participants: [players[0].playerId, players[1].playerId, players[2].playerId, players[3].playerId],
    standings: {
      [players[0].playerId]: { wins: 2, losses: 1, draws: 0, points: 4 },
      [players[1].playerId]: { wins: 2, losses: 1, draws: 0, points: 4 },
      [players[2].playerId]: { wins: 1, losses: 2, draws: 0, points: 2 },
      [players[3].playerId]: { wins: 1, losses: 2, draws: 0, points: 2 },
    },
    createdAt: new Date().toISOString(),
  };

  await docClient.send(new PutCommand({
    TableName: TABLES.TOURNAMENTS,
    Item: roundRobinTournament,
  }));
  console.log('✓ Created tournament: G1 Climax 2024');

  console.log('\n✅ Seed data created successfully!');
  console.log('\nSummary:');
  console.log(`- ${players.length} players`);
  console.log(`- ${championships.length} championships`);
  console.log(`- ${matches.length} matches`);
  console.log('- 2 tournaments');
}

seedData()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error seeding data:', error);
    process.exit(1);
  });
