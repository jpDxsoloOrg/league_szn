import { APIGatewayProxyHandler } from 'aws-lambda';
import { success, badRequest, unauthorized, serverError } from '../../lib/response';
import { generateToken } from '../../lib/jwt';

// Admin credentials - in production, these should be stored securely
// and passwords should be hashed (e.g., using bcrypt)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'FireGreen48!';

interface LoginRequest {
  username: string;
  password: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }

    const { username, password }: LoginRequest = JSON.parse(event.body);

    if (!username || !password) {
      return badRequest('Username and password are required');
    }

    // Validate credentials
    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return unauthorized('Invalid username or password');
    }

    // Generate JWT token
    const token = generateToken(username);

    return success({
      message: 'Login successful',
      token,
      expiresIn: '24h',
    });
  } catch (error) {
    console.error('Login error:', error);
    return serverError('Login failed');
  }
};
