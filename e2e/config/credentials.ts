// Admin credentials for E2E tests
// In production, these should be loaded from environment variables
export const adminCredentials = {
  username: process.env.E2E_ADMIN_USERNAME || 'admin',
  password: process.env.E2E_ADMIN_PASSWORD || 'FireGreen48!',
};
