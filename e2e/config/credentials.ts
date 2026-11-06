// Admin credentials for E2E tests. They come from the environment and are never
// committed. The password is read on first use, so specs that do not sign in can
// run without it.
export const adminCredentials = {
  username: process.env.E2E_ADMIN_USERNAME || 'admin',
  get password(): string {
    const password = process.env.E2E_ADMIN_PASSWORD;
    if (!password) {
      throw new Error('E2E_ADMIN_PASSWORD must be set to sign in. See e2e/README.md.');
    }
    return password;
  },
};
