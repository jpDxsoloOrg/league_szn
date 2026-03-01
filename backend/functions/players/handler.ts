import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createRouter, httpPost, httpGet, httpPut, httpDelete } from '../../lib/router';

interface Player {
  id: string;
  name: string;
  position: string;
  bio?: string; // Added bio field
}

const router = createRouter();

// Example handler for creating a player
router.use(httpPost('/players', async (event) => {
  const body = JSON.parse(event.body || '{}') as Player;

  // Validate the bio field
  if (body.bio && typeof body.bio !== 'string' && body.bio.length > 255) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid bio. It must be a string with a maximum of 255 characters.' }),
    };
  }

  // Simulate saving the player to a database
  const savedPlayer = { ...body, id: Date.now().toString() }; // In a real application, you would save this to a database

  return {
    statusCode: 201,
    body: JSON.stringify(savedPlayer),
  };
}));

// Example handler for getting a player by ID
router.use(httpGet('/players/:id', async (event) => {
  const id = event.pathParameters?.id;

  if (!id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Player ID is required.' }),
    };
  }

  // Simulate fetching the player from a database
  const players: Player[] = [
    { id: '1', name: 'John Doe', position: 'Forward' },
    { id: '2', name: 'Jane Smith', position: 'Defender', bio: 'Outstanding defender with over 10 years of experience.' }
  ];

  const player = players.find(p => p.id === id);

  if (!player) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Player not found.' }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify(player),
  };
}));

// Example handler for updating a player
router.use(httpPut('/players/:id', async (event) => {
  const id = event.pathParameters?.id;
  const body = JSON.parse(event.body || '{}') as Player;

  if (!id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Player ID is required.' }),
    };
  }

  // Validate the bio field
  if (body.bio && typeof body.bio !== 'string' && body.bio.length > 255) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid bio. It must be a string with a maximum of 255 characters.' }),
    };
  }

  // Simulate updating the player in the database
  const players: Player[] = [
    { id: '1', name: 'John Doe', position: 'Forward' },
    { id: '2', name: 'Jane Smith', position: 'Defender', bio: 'Outstanding defender with over 10 years of experience.' }
  ];

  const playerIndex = players.findIndex(p => p.id === id);

  if (playerIndex === -1) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Player not found.' }),
    };
  }

  players[playerIndex] = { ...players[playerIndex], ...body };

  return {
    statusCode: 200,
    body: JSON.stringify(players[playerIndex]),
  };
}));

// Example handler for deleting a player
router.use(httpDelete('/players/:id', async (event) => {
  const id = event.pathParameters?.id;

  if (!id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Player ID is required.' }),
    };
  }

  // Simulate deleting the player from a database
  const players: Player[] = [
    { id: '1', name: 'John Doe', position: 'Forward' },
    { id: '2', name: 'Jane Smith', position: 'Defender', bio: 'Outstanding defender with over 10 years of experience.' }
  ];

  const playerIndex = players.findIndex(p => p.id === id);

  if (playerIndex === -1) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Player not found.' }),
    };
  }

  players.splice(playerIndex, 1);

  return {
    statusCode: 204,
  };
}));

export const handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  return router.handle(event);
};

<<<< CONFLICT: multiple tasks modified this file >>>>
# From task: 01f1e155-d486-4bb7-aa18-c0a5ec473ead
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { validateBioLength } from './utils';

const MAX_BIO_LENGTH = 255;

export const createPlayerHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    try {
        const requestBody = JSON.parse(event.body || '{}');
        const bio = requestBody.bio;

        if (bio && bio.length > MAX_BIO_LENGTH) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Bio length exceeds the maximum limit of 255 characters.' }),
            };
        }

        // Existing player creation logic here

        return {
            statusCode: 201,
            body: JSON.stringify({ message: 'Player created successfully' }),
        };
    } catch (error) {
        console.error('Error creating player:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' }),
        };
    }
};

export const updateMyProfileHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    try {
        const requestBody = JSON.parse(event.body || '{}');
        const bio = requestBody.bio;

        if (bio && bio.length > MAX_BIO_LENGTH) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Bio length exceeds the maximum limit of 255 characters.' }),
            };
        }

        // Existing profile update logic here

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Profile updated successfully' }),
        };
    } catch (error) {
        console.error('Error updating profile:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' }),
        };
    }
};

export const updatePlayerHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    try {
        const requestBody = JSON.parse(event.body || '{}');
        const bio = requestBody.bio;

        if (bio && bio.length > MAX_BIO_LENGTH) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Bio length exceeds the maximum limit of 255 characters.' }),
            };
        }

        // Existing player update logic here

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Player updated successfully' }),
        };
    } catch (error) {
        console.error('Error updating player:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' }),
        };
    }
};

export const getMyProfileHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    try {
        // Existing profile retrieval logic here

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Profile retrieved successfully' }),
        };
    } catch (error) {
        console.error('Error retrieving profile:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' }),
        };
    }
};

// Extracted bio validation function
const validateBioLength = (bio: string | undefined): void => {
    if (bio && bio.length > MAX_BIO_LENGTH) {
        throw new Error('Bio length exceeds the maximum limit of 255 characters.');
    }
};