import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.PLAYERS_TABLE || '';

interface Player {
  playerId: string;
  name: string;
  bio?: string; // Optional bio field
}

function validatePlayerBio(bio: string): boolean {
  return typeof bio === 'string' && bio.length <= 255;
}

export const updatePlayer = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { playerId, name, bio } = JSON.parse(event.body || '{}');

    if (!playerId || !name) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Player ID and Name are required' }),
      };
    }

    if (bio && !validatePlayerBio(bio)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Bio must be a string with max 255 characters' }),
      };
    }

    const playerData: Player = {
      playerId,
      name,
      bio, // Include bio in the player data
    };

    await dynamoDb.put({
      TableName: TABLE_NAME,
      Item: playerData,
    }).promise();

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