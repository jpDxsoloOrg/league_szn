# Plan: i18n — Auth pages, TopNav links, and ErrorBoundary

**GitHub issue:** #158 — [i18n: Auth pages, TopNav links, and ErrorBoundary not translated](https://github.com/jpDxsolo/league_szn/issues/158)

## Context

Several UI areas use hardcoded English while the app supports i18n (EN/DE): auth pages (Login, Signup), TopNav auth links, and ErrorBoundary fallback. This plan adds translation keys and replaces all hardcoded strings so German-speaking users get a consistent experience.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| Before commit | git-commit-helper | Conventional commit message |

## Agents and parallel work

- **Suggested order**: Step 1 (locale keys) -> Steps 2+3+4+5 (components in parallel).
- **Agent types**: general-purpose for all steps (frontend i18n and components).

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/i18n/locales/en.json` | Modify | Add `auth.*` and `common.signIn` / `common.signUp` |
| `frontend/src/i18n/locales/de.json` | Modify | Same keys with German translations |
| `frontend/src/components/auth/Login.tsx` | Modify | Use `useTranslation`, replace all strings with `t('auth.*')` |
| `frontend/src/components/auth/Signup.tsx` | Modify | Use `useTranslation`, replace all strings with `t('auth.*')` |
| `frontend/src/components/TopNav.tsx` | Modify | Use `t('common.signIn')` and `t('common.signUp')` for auth links |
| `frontend/src/components/ErrorBoundary.tsx` | Modify | Use `i18n.t()` for fallback UI (class component) |

## Implementation steps

### Step 1: Add i18n keys (en.json and de.json)

- In **en.json**:
  - Add to `common`: `"signIn": "Sign In"`, `"signUp": "Sign Up"`.
  - Add top-level section `"auth": { ... }` with keys for Login and Signup and ErrorBoundary:
    - Login: title, subtitle, email, password, placeholders (email, password), signingIn, loginFailed, noAccount, signUpLink.
    - Signup: createAccount, joinSubtitle, email, password, confirmPassword, placeholders (email, password, confirmPassword, wrestlerName), wrestlerLabel, wrestlerOptional, wrestlerHint, createAccountBtn, creatingAccount, alreadyHaveAccount, signInLink, passwordsDoNotMatch, signUpFailed, verifyTitle, verifySubtitle, verificationCode, codePlaceholder, verifyEmail, verifying, backToSignUp, verificationFailed.
    - ErrorBoundary: somethingWentWrong, unexpectedError, reloadPage.
  - Dev-only strings for Login (DevLogin): devLoginTitle, devLoginSubtitle, signInAsAdmin, loadingPlayers, noPlayersFound, etc. (can stay in auth.dev.*).
- In **de.json**: Add the same key structure with German translations.

Suggested auth key set (minimal set that covers all UI text):

- `auth.signInTitle`, `auth.signInSubtitle`, `auth.email`, `auth.password`, `auth.enterEmail`, `auth.enterPassword`, `auth.signingIn`, `auth.loginFailed`, `auth.noAccount`, `auth.signUpLink` (for Login footer).
- `auth.createAccount`, `auth.joinSubtitle`, `auth.confirmPassword`, `auth.enterConfirmPassword`, `auth.wrestlerName`, `auth.wrestlerOptional`, `auth.wrestlerPlaceholder`, `auth.wrestlerHint`, `auth.createAccountBtn`, `auth.creatingAccount`, `auth.alreadyHaveAccount`, `auth.signInLink`, `auth.passwordsDoNotMatch`, `auth.signUpFailed`, `auth.verifyTitle`, `auth.verifySubtitle`, `auth.verificationCode`, `auth.codePlaceholder`, `auth.verifyEmail`, `auth.verifying`, `auth.backToSignUp`, `auth.verificationFailed`.
- `auth.devLoginTitle`, `auth.devLoginSubtitle`, `auth.signInAsAdmin`, `auth.loadingPlayers`, `auth.noPlayersFound` (for DevLogin).
- `errorBoundary.somethingWentWrong`, `errorBoundary.unexpectedError`, `errorBoundary.reloadPage` (or under common/notFound-style; using `errorBoundary.*` keeps namespace clear).

### Step 2: Login.tsx — use useTranslation and t()

- Import `useTranslation` from `react-i18next`.
- In the default `Login` component, call `const { t } = useTranslation();`.
- Replace: "Sign In" -> `t('auth.signInTitle')` or `t('common.signIn')` for button; use auth.* for page-specific strings.
- Replace: "Sign in to access League SZN" -> `t('auth.signInSubtitle')`.
- Replace: "Email", "Password", placeholders "Enter your email", "Enter your password", "Signing in...", "Sign In", "Don't have an account?", "Sign Up" with t() calls.
- For the catch block message "Login failed. Please try again." use `t('auth.loginFailed')` (and keep dynamic err.message when appropriate; for generic message use key).
- In DevLogin: replace "Dev Login", "Pick a role...", "Sign in as Admin", "Loading players...", "No players found..." with t('auth.dev.*') keys.

### Step 3: Signup.tsx — use useTranslation and t()

- Import `useTranslation`, call `const { t } = useTranslation();`.
- Replace all hardcoded strings: "Create Account", "Join League SZN", "Email", "Password", "Confirm Password", placeholders, "Wrestler Name", "(optional)", hint text, "Create Account", "Creating Account...", "Already have an account?", "Sign In", "Passwords do not match", "Sign up failed. Please try again.", "Verify Your Email", "We sent a verification code to...", "Verification Code", "Enter 6-digit code", "Verify Email", "Verifying...", "Back to sign up", "Verification failed. Please try again." with corresponding auth.* keys.

### Step 4: TopNav.tsx — translate Sign In and Sign Up links

- Replace the two hardcoded "Sign In" strings with `t('common.signIn')` and "Sign Up" with `t('common.signUp')` (TopNav already uses `useTranslation` and `t`). Locations: mobile dropdown (~lines 258–259) and desktop bar (~lines 383–384).

### Step 5: ErrorBoundary.tsx — translate fallback UI

- ErrorBoundary is a class component so it cannot use `useTranslation()`. Use the i18n instance directly: `import i18n from '../i18n';` (or from the app’s i18n setup) and in render use `i18n.t('errorBoundary.somethingWentWrong')`, `i18n.t('errorBoundary.unexpectedError')`, `i18n.t('errorBoundary.reloadPage')`. Ensure the i18n module is the same one used by the app (e.g. from `../i18n` or `../../i18n` depending on frontend structure).

## Dependencies and order

- Step 1 must complete first so keys exist for all components.
- Steps 2, 3, 4, 5 can run in parallel after Step 1.
- **Suggested order**: Step 1 -> Steps 2+3+4+5.

## Testing and verification

- Run frontend lint and tests (`npm run lint`, `npm run test` in frontend).
- Manually: Switch locale to DE and open Login, Signup, TopNav (unauthenticated), and trigger ErrorBoundary; confirm all previously hardcoded strings appear in German.
- Existing tests: Login.test.tsx, Signup.test.tsx, ErrorBoundary.test.tsx may assert on English text; update assertions to use translation keys or rendered default language if needed.

## Risks and edge cases

- ErrorBoundary may render before i18n is fully initialized; using `i18n.t()` is safe as long as i18n is loaded before any error is thrown. If needed, fallback to English for missing keys.
- Duplicate key "loading" in common (en.json lines 3 and 31); leave as-is to avoid scope creep; only add new keys.
