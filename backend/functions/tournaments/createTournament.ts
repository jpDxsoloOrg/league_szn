import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

interface CreateTournamentBody {
  name: string;
  type: 'single-elimination' | 'round-robin';
  participants: string[];
}

interface BracketMatch {
  matchId?: string;
  participant1?: string;
  participant2?: string;
  winner?: string;
}

interface BracketRound {
  roundNumber: number;
  matches: BracketMatch[];
}

const isPowerOfTwo = (value: number): boolean => value > 0 && (value & (value - 1)) === 0;

const generateSingleEliminationBracket = (participants: string[]): { rounds: BracketRound[] } => {
  const numParticipants = participants.length;
  const numRounds = Math.ceil(Math.log2(numParticipants));

  // Create first round
  const firstRound: BracketRound = {
    roundNumber: 1,
    matches: [],
  };

  const numFirstRoundMatches = Math.floor(numParticipants / 2);
  for (let i = 0; i < numFirstRoundMatches; i++) {
    firstRound.matches.push({
      participant1: participants[i * 2],
      participant2: participants[i * 2 + 1],
    });
  }

  // Create placeholder rounds
  const rounds: BracketRound[] = [firstRound];
  let matchesInPreviousRound = firstRound.matches.length;

  for (let i = 2; i <= numRounds; i++) {
    const round: BracketRound = {
      roundNumber: i,
      matches: [],
    };

    const matchesInRound = Math.ceil(matchesInPreviousRound / 2);
    for (let j = 0; j < matchesInRound; j++) {
      round.matches.push({});
    }

    rounds.push(round);
    matchesInPreviousRound = matchesInRound;
  }

  return { rounds };
};

const initializeRoundRobinStandings = (participants: string[]): Record<string, any> => {
  const standings: Record<string, any> = {};

  for (const playerId of participants) {
    standings[playerId] = {
      wins: 0,
      losses: 0,
      draws: 0,
      points: 0,
    };
  }

  return standings;
};

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { data: body, error: parseError } = parseBody<CreateTournamentBody>(event);
    if (parseError) return parseError;

    if (!body.name || !body.type || !body.participants || body.participants.length < 2) {
      return badRequest('Name, type, and at least 2 participants are required');
    }

    if (!['single-elimination', 'round-robin'].includes(body.type)) {
      return badRequest('Type must be either "single-elimination" or "round-robin"');
    }

    const now = new Date().toISOString();
    if (body.type === 'single-elimination') {
      if (body.participants.length < 4) {
        return badRequest('Single elimination tournaments require at least 4 participants');
      }
      if (!isPowerOfTwo(body.participants.length)) {
        return badRequest('Single elimination tournaments require a power-of-two participant count (4, 8, 16, ...)');
      }
    }

    const tournament: Record<string, unknown> = {
      tournamentId: uuidv4(),
      name: body.name,
      type: body.type,
      status: 'upcoming',
      participants: body.participants,
      createdAt: now,
      updatedAt: now,
    };

    if (body.type === 'single-elimination') {
      tournament.brackets = generateSingleEliminationBracket(body.participants);
    } else {
      tournament.standings = initializeRoundRobinStandings(body.participants);
    }

    await dynamoDb.put({
      TableName: TableNames.TOURNAMENTS,
      Item: tournament,
    });

    return created(tournament);
  } catch (err) {
    console.error('Error creating tournament:', err);
    return serverError('Failed to create tournament');
  }
};
