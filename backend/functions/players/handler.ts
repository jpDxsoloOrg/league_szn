import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';

// Mock database
const playersDB = new Map<string, any>();

export const handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Player ID is required' }),
      };
    }

    let playerData: any;

    switch (event.httpMethod) {
      case 'GET':
        playerData = playersDB.get(playerId);
        if (!playerData) {
          return {
            statusCode: 404,
            body: JSON.stringify({ error: 'Player not found' }),
          };
        }
        break;
      case 'POST':
        const newPlayer = JSON.parse(event.body || '{}');
        if (newPlayer.bio && newPlayer.bio.length > 255) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Bio must be 255 characters or less' }),
          };
        }
        newPlayer.playerId = uuidv4();
        playersDB.set(newPlayer.playerId, newPlayer);
        playerData = newPlayer;
        break;
      case 'PUT':
        const updatedPlayer = JSON.parse(event.body || '{}');
        if (updatedPlayer.bio && updatedPlayer.bio.length > 255) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Bio must be 255 characters or less' }),
          };
        }
        // Placeholder for actual database update logic
        playersDB.set(playerId, { ...playersDB.get(playerId), ...updatedPlayer });
        playerData = updatedPlayer;
        break;
      case 'DELETE':
        if (playersDB.has(playerId)) {
          playersDB.delete(playerId);
          return {
            statusCode: 204,
            body: JSON.stringify({ message: 'Player deleted' }),
          };
        } else {
          return {
            statusCode: 404,
            body: JSON.stringify({ error: 'Player not found' }),
          };
        }
      default:
        return {
          statusCode: 405,
          body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(playerData),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }
};