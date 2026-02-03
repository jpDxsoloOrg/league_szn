import * as jwt from 'jsonwebtoken';

// JWT secret - in production, this should be stored in AWS Secrets Manager or SSM Parameter Store
const JWT_SECRET = process.env.JWT_SECRET || 'league-szn-admin-secret-key-change-in-production';
const JWT_EXPIRATION = '24h';

export interface AdminTokenPayload {
  username: string;
  role: 'admin';
  iat?: number;
  exp?: number;
}

export const generateToken = (username: string): string => {
  const payload: AdminTokenPayload = {
    username,
    role: 'admin',
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRATION,
  });
};

export const verifyToken = (token: string): AdminTokenPayload => {
  return jwt.verify(token, JWT_SECRET) as AdminTokenPayload;
};

export const decodeToken = (token: string): AdminTokenPayload | null => {
  try {
    return jwt.decode(token) as AdminTokenPayload;
  } catch {
    return null;
  }
};
