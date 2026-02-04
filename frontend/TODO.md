# Frontend Code Review - Action Items

This document tracks issues identified during the comprehensive frontend code review.

---

## Critical Issues (Must Fix Before Production)

### 1. ESLint Configuration Broken
- **Location:** `eslint.config.js`
- **Issue:** Cannot find package `typescript-eslint` - no linting is currently running
- **Fix:**
  ```bash
  npm install
  # Verify typescript-eslint is properly installed
  ```
- [ ] Verify ESLint runs without errors
- [ ] Run `npm run lint` and fix any reported issues

### 2. Sensitive Tokens Stored in sessionStorage (XSS Risk)
- **Location:** `src/services/cognito.ts` (Lines 59-60, 163-164), `src/services/api.ts` (Lines 229, 234)
- **Issue:** Access tokens stored in sessionStorage are vulnerable to XSS attacks
- **Fix Options:**
  - [ ] Implement HttpOnly cookies for token storage (requires backend changes)
  - [ ] Add Content Security Policy (CSP) headers to mitigate XSS
  - [ ] At minimum, implement strict CSP in `index.html`:
    ```html
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'">
    ```

### 3. Missing Input Sanitization
- **Location:** `src/components/Standings.tsx`, `src/components/Matches.tsx`, `src/components/Championships.tsx`, admin components
- **Issue:** No validation on maximum length limits or dangerous characters
- **Fix:**
  - [ ] Create `src/utils/sanitize.ts` utility:
    ```typescript
    export const sanitizeInput = (input: string, maxLength: number = 100): string => {
      return input.trim().slice(0, maxLength).replace(/[<>]/g, '');
    };
    ```
  - [ ] Apply sanitization to all form inputs in `ManagePlayers.tsx`
  - [ ] Apply sanitization to all form inputs in `ManageChampionships.tsx`
  - [ ] Apply sanitization to all form inputs in `ScheduleMatch.tsx`
  - [ ] Apply sanitization to all form inputs in `CreateTournament.tsx`

---

## High Priority Issues

### 4. ~~Use of `any` Type~~ ✅ COMPLETED
- **Location:** `src/services/cognito.ts` (Line 80), `src/components/Tournaments.tsx` (Line 58)
- **Issue:** Defeats TypeScript type safety
- **Fix:**
  - [x] Replace `error: any` with `error: unknown` in cognito.ts and use type narrowing
  - [x] Fix Tournament.standings type from `RoundRobinStanding[]` to `Record<string, Omit<RoundRobinStanding, 'playerId'>>` to match backend API
  - [x] Update Tournaments.tsx to use proper type instead of `any`

  *Note: RoundRobinStanding interface already existed in types/index.ts - fixed the Tournament.standings type to match backend*

### 5. ~~Missing Error Boundaries~~ ✅ COMPLETED
- **Location:** `src/App.tsx`
- **Issue:** If any component throws an error, the entire app crashes with white screen
- **Fix:**
  - [x] Create `src/components/ErrorBoundary.tsx` with proper error handling and reload button
  - [x] Wrap `<Router>` in App.tsx with `<ErrorBoundary>`
  - [x] Add error boundary CSS styles to App.css

### 6. Console Statements Exposing Sensitive Data
- **Location:** `src/services/cognito.ts` (Lines 34-36, 45, 81, 105, 173), `src/components/Championships.tsx` (Line 45), admin components
- **Issue:** Exposes User Pool IDs, Client IDs, usernames in browser console
- **Fix:**
  - [ ] Create `src/utils/logger.ts`:
    ```typescript
    const isDevelopment = import.meta.env.DEV;

    export const logger = {
      info: (message: string, ...args: unknown[]) => {
        if (isDevelopment) console.log(`[INFO] ${message}`, ...args);
      },
      error: (message: string, ...args: unknown[]) => {
        console.error(`[ERROR] ${message}`, ...args);
      },
    };
    ```
  - [ ] Replace all `console.log` in `cognito.ts` with logger (remove sensitive data)
  - [ ] Replace all `console.log` in `Championships.tsx`
  - [ ] Replace all `console.log` in `ManageChampionships.tsx`
  - [ ] Replace all `console.log` in `ManagePlayers.tsx`
  - [ ] Configure Vite to strip console in production (see vite.config.ts task below)

---

## Medium Priority Issues

### 7. Missing Loading States (Race Conditions)
- **Location:** `src/components/admin/ManagePlayers.tsx`, other admin forms
- **Issue:** Forms not disabled during submission, users can submit multiple times
- **Fix:**
  - [ ] Add `submitting` state to `ManagePlayers.tsx`
  - [ ] Add `submitting` state to `ManageChampionships.tsx`
  - [ ] Add `submitting` state to `ScheduleMatch.tsx`
  - [ ] Add `submitting` state to `RecordResult.tsx`
  - [ ] Add `submitting` state to `CreateTournament.tsx`
  - [ ] Disable submit buttons while `submitting || uploading`

### 8. useEffect Dependency Array Issues
- **Location:** `src/components/Standings.tsx` (Lines 17-23), other components
- **Issue:** Missing dependencies in useEffect arrays
- **Fix:**
  - [ ] Wrap data loading functions in `useCallback` or move logic inside `useEffect`
  - [ ] Review and fix dependencies in `Standings.tsx`
  - [ ] Review and fix dependencies in `Matches.tsx`
  - [ ] Review and fix dependencies in `Championships.tsx`
  - [ ] Review and fix dependencies in `Tournaments.tsx`

### 9. No Request Cancellation (Memory Leaks)
- **Location:** All components fetching data
- **Issue:** setState called on unmounted components causes memory leaks
- **Fix:**
  - [ ] Update `src/services/api.ts` to support AbortController signal
  - [ ] Add cleanup functions to useEffect in `Standings.tsx`
  - [ ] Add cleanup functions to useEffect in `Matches.tsx`
  - [ ] Add cleanup functions to useEffect in `Championships.tsx`
  - [ ] Add cleanup functions to useEffect in `Tournaments.tsx`
  - [ ] Add cleanup functions to useEffect in all admin components

### 10. Missing Accessibility Attributes
- **Location:** Modal dialogs, buttons, forms
- **Issue:** Missing ARIA attributes for screen readers
- **Fix:**
  - [ ] Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby` to modal in `Championships.tsx`
  - [ ] Add `aria-label="Close modal"` to close buttons
  - [ ] Add `role="alert"`, `aria-live="polite"` to error messages in `AdminLogin.tsx`
  - [ ] Review all modals in admin components for accessibility

### 11. Image Upload Error Handling
- **Location:** `src/components/admin/ManagePlayers.tsx` (Lines 89-111)
- **Issue:** Generic error messages, no retry mechanism
- **Fix:**
  - [ ] Improve error messages to be more specific
  - [ ] Add user-friendly error feedback for network failures

### 12. Unnecessary Re-renders in Lists
- **Location:** `src/components/Standings.tsx` (Lines 175-208)
- **Issue:** Calculations recalculated on every render
- **Fix:**
  - [ ] Wrap `filteredPlayers` mapping with `useMemo` in `Standings.tsx`
  - [ ] Review other list renderings for memoization opportunities

---

## Low Priority Issues

### 13. Inconsistent Date Formatting
- **Location:** `src/components/Matches.tsx`, `src/components/Championships.tsx`
- **Issue:** Different date formats across components
- **Fix:**
  - [ ] Create `src/utils/dateUtils.ts`:
    ```typescript
    export const formatDate = (dateString: string): string => {
      return new Date(dateString).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    };

    export const formatDateTime = (dateString: string): string => {
      return new Date(dateString).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    };
    ```
  - [ ] Replace inline date formatting in `Matches.tsx`
  - [ ] Replace inline date formatting in `Championships.tsx`

### 14. Magic Numbers and Strings
- **Location:** `src/components/admin/ManagePlayers.tsx`, `src/services/api.ts`
- **Issue:** Hardcoded values like `5 * 1024 * 1024` and `86400`
- **Fix:**
  - [ ] Create `src/constants/index.ts`:
    ```typescript
    export const FILE_UPLOAD_LIMITS = {
      MAX_SIZE: 5 * 1024 * 1024, // 5MB
      ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    } as const;

    export const TOKEN_EXPIRY = {
      ACCESS_TOKEN: 24 * 60 * 60, // 24 hours
    } as const;
    ```
  - [ ] Update `ManagePlayers.tsx` to use constants
  - [ ] Update `ManageChampionships.tsx` to use constants

### 15. TypeScript Config Improvements
- **Location:** `tsconfig.json`
- **Issue:** Additional strict flags could improve type safety
- **Fix:**
  - [ ] Add to compilerOptions:
    ```json
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true
    ```

### 16. Vite Configuration Optimizations
- **Location:** `vite.config.ts`
- **Issue:** Missing production optimizations
- **Fix:**
  - [ ] Add build configuration:
    ```typescript
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'i18n-vendor': ['i18next', 'react-i18next'],
            'aws-vendor': ['aws-amplify', 'amazon-cognito-identity-js'],
          },
        },
      },
      sourcemap: true,
    },
    ```
  - [ ] Add terser config to strip console in production:
    ```typescript
    build: {
      minify: 'terser',
      terserOptions: {
        compress: { drop_console: true, drop_debugger: true },
      },
    },
    ```

---

## Summary

| Priority | Total | Completed |
|----------|-------|-----------|
| Critical | 3 | 0 |
| High | 3 | 2 |
| Medium | 6 | 0 |
| Low | 4 | 0 |
| **Total** | **16** | **2** |

---

## Files to Create

- [ ] `src/utils/sanitize.ts` - Input sanitization utilities
- [ ] `src/utils/logger.ts` - Development-only logging
- [ ] `src/utils/dateUtils.ts` - Consistent date formatting
- [ ] `src/constants/index.ts` - Magic numbers and configuration
- [x] `src/components/ErrorBoundary.tsx` - Error boundary component ✅

---

## Files to Modify

- [ ] `eslint.config.js` - Fix configuration
- [ ] `tsconfig.json` - Add strict flags
- [ ] `vite.config.ts` - Add production optimizations
- [x] `src/App.tsx` - Add ErrorBoundary wrapper ✅
- [ ] `src/services/api.ts` - Add AbortController support
- [x] `src/services/cognito.ts` - Remove console.log, fix any types ✅ (any types fixed)
- [x] `src/types/index.ts` - Add RoundRobinStats interface ✅ (fixed Tournament.standings type)
- [ ] `src/components/Standings.tsx` - Add memoization, fix useEffect
- [ ] `src/components/Matches.tsx` - Use date utils, fix useEffect
- [ ] `src/components/Championships.tsx` - Add accessibility, use date utils
- [x] `src/components/Tournaments.tsx` - Fix any type, fix useEffect ✅ (any type fixed)
- [ ] `src/components/admin/AdminLogin.tsx` - Add accessibility attributes
- [ ] `src/components/admin/ManagePlayers.tsx` - Add loading states, sanitization
- [ ] `src/components/admin/ManageChampionships.tsx` - Add loading states, sanitization
- [ ] `src/components/admin/ScheduleMatch.tsx` - Add loading states, sanitization
- [ ] `src/components/admin/RecordResult.tsx` - Add loading states
- [ ] `src/components/admin/CreateTournament.tsx` - Add loading states, sanitization
