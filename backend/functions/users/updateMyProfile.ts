import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireRole, parseBody, respondWithJson } from '../../lib/router';
import { getUserFromToken } from '../../lib/handlers';

export const handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const user = await getUserFromToken(event.headers['Authorization']);
  
  if (!user) {
    return respondWithJson(401, { message: 'Unauthorized' });
  }

  requireRole(user.role, ['admin', 'user']);

  const body = parseBody(event.body);
  
  if (!body.bio || typeof body.bio !== 'string' || body.bio.length > 255) {
    return respondWithJson(400, { message: 'Invalid bio' });
  }

  // Assuming updateProfile is a function that updates the user's profile
  const success = await updateProfile(user.id, { bio: body.bio });

  if (success) {
    return respondWithJson(200, { message: 'Profile updated successfully' });
  } else {
    return respondWithJson(500, { message: 'Failed to update profile' });
  }
};