import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';
import { v4 as uuidv4 } from 'uuid';

const wrestlers = [
  'Stone Cold Steve Austin',
  'The Rock',
  'The Undertaker',
  'Triple H',
  'Shawn Michaels',
  'Bret Hart',
  'John Cena',
  'Randy Orton',
  'Edge',
  'CM Punk',
  'Roman Reigns',
  'Seth Rollins',
];

const playerNames = [
  'John Stone',
  'Mike Rock',
  'Jake Undertaker',
  'Chris Helmsley',
  'Alex Michaels',
  'Sam Hart',
  'Dave Cena',
  'Randy Legend',
  'Adam Copeland',
  'Phil Brooks',
  'Joe Anoa\'i',
  'Colby Lopez',
];

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const createdCounts: Record<string, number> = {};
    const now = new Date().toISOString();

    // Create divisions first
    console.log('Creating divisions...');
    const divisions = [
      {
        divisionId: uuidv4(),
        name: 'Raw',
        description: 'The flagship Monday Night Raw roster',
        createdAt: now,
        updatedAt: now,
      },
      {
        divisionId: uuidv4(),
        name: 'SmackDown',
        description: 'The Friday Night SmackDown roster',
        createdAt: now,
        updatedAt: now,
      },
      {
        divisionId: uuidv4(),
        name: 'NXT',
        description: 'The developmental brand for rising stars',
        createdAt: now,
        updatedAt: now,
      },
    ];

    for (const division of divisions) {
      await dynamoDb.put({
        TableName: TableNames.DIVISIONS,
        Item: division,
      });
    }
    createdCounts.divisions = divisions.length;

    // Create players with division assignments
    console.log('Creating players...');
    const players = playerNames.map((name, index) => ({
      playerId: uuidv4(),
      name,
      currentWrestler: wrestlers[index],
      wins: Math.floor(Math.random() * 15) + 3,
      losses: Math.floor(Math.random() * 12) + 2,
      draws: Math.floor(Math.random() * 3),
      divisionId: divisions[index % divisions.length].divisionId,
      createdAt: now,
      updatedAt: now,
    }));

    for (const player of players) {
      await dynamoDb.put({
        TableName: TableNames.PLAYERS,
        Item: player,
      });
    }
    createdCounts.players = players.length;

    // Create a season
    console.log('Creating seasons...');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const seasons = [
      {
        seasonId: uuidv4(),
        name: 'Season 1',
        startDate: thirtyDaysAgo.toISOString(),
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ];

    for (const season of seasons) {
      await dynamoDb.put({
        TableName: TableNames.SEASONS,
        Item: season,
      });
    }
    createdCounts.seasons = seasons.length;

    // Create season standings for all players
    console.log('Creating season standings...');
    let standingsCount = 0;
    for (const player of players) {
      const standing = {
        seasonId: seasons[0].seasonId,
        playerId: player.playerId,
        wins: Math.floor(Math.random() * 8) + 1,
        losses: Math.floor(Math.random() * 6) + 1,
        draws: Math.floor(Math.random() * 2),
      };
      await dynamoDb.put({
        TableName: TableNames.SEASON_STANDINGS,
        Item: standing,
      });
      standingsCount++;
    }
    createdCounts.seasonStandings = standingsCount;

    // Create championships
    console.log('Creating championships...');
    const championships = [
      {
        championshipId: uuidv4(),
        name: 'World Heavyweight Championship',
        type: 'singles',
        currentChampion: players[0].playerId,
        isActive: true,
        createdAt: now,
      },
      {
        championshipId: uuidv4(),
        name: 'Intercontinental Championship',
        type: 'singles',
        currentChampion: players[1].playerId,
        isActive: true,
        createdAt: now,
      },
      {
        championshipId: uuidv4(),
        name: 'Tag Team Championship',
        type: 'tag',
        currentChampion: [players[2].playerId, players[3].playerId],
        isActive: true,
        createdAt: now,
      },
      {
        championshipId: uuidv4(),
        name: 'United States Championship',
        type: 'singles',
        currentChampion: players[4].playerId,
        isActive: true,
        createdAt: now,
      },
    ];

    for (const championship of championships) {
      await dynamoDb.put({
        TableName: TableNames.CHAMPIONSHIPS,
        Item: championship,
      });
    }
    createdCounts.championships = championships.length;

    // Create championship history
    console.log('Creating championship history...');
    let historyCount = 0;
    for (let i = 0; i < championships.length; i++) {
      const wonDate = new Date();
      wonDate.setDate(wonDate.getDate() - (30 - i * 5));

      await dynamoDb.put({
        TableName: TableNames.CHAMPIONSHIP_HISTORY,
        Item: {
          championshipId: championships[i].championshipId,
          wonDate: wonDate.toISOString(),
          champion: Array.isArray(championships[i].currentChampion)
            ? championships[i].currentChampion
            : championships[i].currentChampion,
          matchId: uuidv4(),
        },
      });
      historyCount++;
    }
    createdCounts.championshipHistory = historyCount;

    // Create matches
    console.log('Creating matches...');
    const matchTypes = ['singles', 'tag', 'triple-threat', 'fatal-4-way'];
    const stipulations = ['Standard', 'No DQ', 'Steel Cage', 'Ladder Match', 'Hell in a Cell', 'Tables Match'];
    const matches = [];

    // Past completed matches
    for (let i = 0; i < 8; i++) {
      const daysAgo = Math.floor(Math.random() * 25) + 5;
      const matchDate = new Date();
      matchDate.setDate(matchDate.getDate() - daysAgo);

      const participant1 = players[Math.floor(Math.random() * players.length)];
      let participant2 = players[Math.floor(Math.random() * players.length)];
      while (participant2.playerId === participant1.playerId) {
        participant2 = players[Math.floor(Math.random() * players.length)];
      }

      const winner = Math.random() > 0.5 ? participant1 : participant2;
      const loser = winner === participant1 ? participant2 : participant1;

      matches.push({
        matchId: uuidv4(),
        date: matchDate.toISOString(),
        matchType: 'singles',
        stipulation: stipulations[Math.floor(Math.random() * stipulations.length)],
        participants: [participant1.playerId, participant2.playerId],
        winners: [winner.playerId],
        losers: [loser.playerId],
        isChampionship: false,
        seasonId: seasons[0].seasonId,
        status: 'completed',
        createdAt: now,
      });
    }

    // Future scheduled matches
    for (let i = 0; i < 4; i++) {
      const daysAhead = Math.floor(Math.random() * 14) + 1;
      const matchDate = new Date();
      matchDate.setDate(matchDate.getDate() + daysAhead);

      const participant1 = players[Math.floor(Math.random() * players.length)];
      let participant2 = players[Math.floor(Math.random() * players.length)];
      while (participant2.playerId === participant1.playerId) {
        participant2 = players[Math.floor(Math.random() * players.length)];
      }

      matches.push({
        matchId: uuidv4(),
        date: matchDate.toISOString(),
        matchType: matchTypes[Math.floor(Math.random() * 2)],
        stipulation: stipulations[Math.floor(Math.random() * stipulations.length)],
        participants: [participant1.playerId, participant2.playerId],
        isChampionship: i === 0,
        championshipId: i === 0 ? championships[0].championshipId : undefined,
        seasonId: seasons[0].seasonId,
        status: 'scheduled',
        createdAt: now,
      });
    }

    for (const match of matches) {
      await dynamoDb.put({
        TableName: TableNames.MATCHES,
        Item: match,
      });
    }
    createdCounts.matches = matches.length;

    // Create tournaments
    console.log('Creating tournaments...');
    const tournaments = [
      {
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
        createdAt: now,
      },
      {
        tournamentId: uuidv4(),
        name: 'G1 Climax 2024',
        type: 'round-robin',
        status: 'in-progress',
        participants: [players[4].playerId, players[5].playerId, players[6].playerId, players[7].playerId],
        standings: {
          [players[4].playerId]: { wins: 2, losses: 1, draws: 0, points: 4 },
          [players[5].playerId]: { wins: 2, losses: 1, draws: 0, points: 4 },
          [players[6].playerId]: { wins: 1, losses: 2, draws: 0, points: 2 },
          [players[7].playerId]: { wins: 1, losses: 2, draws: 0, points: 2 },
        },
        createdAt: now,
      },
    ];

    for (const tournament of tournaments) {
      await dynamoDb.put({
        TableName: TableNames.TOURNAMENTS,
        Item: tournament,
      });
    }
    createdCounts.tournaments = tournaments.length;

    return success({
      message: 'Sample data seeded successfully!',
      createdCounts,
    });
  } catch (err) {
    console.error('Error seeding data:', err);
    return serverError('Failed to seed data');
  }
};
