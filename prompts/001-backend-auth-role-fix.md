<objective>
Fix the backend hasRole() function in auth.ts so that Moderators are NOT granted Admin-level access. This is a CRITICAL security vulnerability — Moderators can currently bypass frontend restrictions via direct API calls to perform Admin-only operations (update site config, manage fantasy config, toggle user accounts, list users).
</objective>

<context>
This is a WWE 2K League Management serverless backend (Node.js + TypeScript + DynamoDB on AWS Lambda).

The role hierarchy is: Fantasy < Wrestler < Moderator < Admin, where Moderator is NOT equal to Admin.

The frontend `hasRole()` in `frontend/src/contexts/AuthContext.tsx:154` was already fixed to prevent Moderators from being treated as Admin (`&& role !== 'Admin'`), but the backend was NOT fixed — creating a security gap where Moderators can call Admin-only API endpoints directly.

There is already a `isSuperAdmin()` function and `requireSuperAdmin()` middleware that correctly checks for Admin-only. The issue is solely in `hasRole()`.

File to modify: `backend/lib/auth.ts`
</context>

<requirements>
1. Read `backend/lib/auth.ts` to confirm current state
2. Modify `hasRole()` so that Moderators get access to all roles EXCEPT Admin:
   - If user is Admin → return true (unchanged)
   - If user is Moderator AND the required roles do NOT include 'Admin' → return true
   - If user is Moderator AND the required roles include 'Admin' → fall through to normal check (will return false since Moderator !== Admin)
   - Otherwise → check if user has any of the required roles (unchanged)
3. The fix should be: change line 38 from `if (context.groups.includes('Moderator')) return true;` to `if (context.groups.includes('Moderator') && !requiredRoles.includes('Admin')) return true;`
4. Update the JSDoc comment on `hasRole()` to accurately describe the new behavior
5. Do NOT modify `isSuperAdmin()`, `requireSuperAdmin()`, or `requireRole()` — they are correct
6. Do NOT touch any other files
</requirements>

<implementation>
The change is surgical — one line modification plus a comment update:

```typescript
/**
 * Check if user has at least one of the required roles.
 * Admin has access to everything. Moderator has access to all roles except Admin-only operations.
 */
export function hasRole(context: AuthContext, ...requiredRoles: UserRole[]): boolean {
  if (context.groups.includes('Admin')) return true;
  if (context.groups.includes('Moderator') && !requiredRoles.includes('Admin')) return true;
  return requiredRoles.some((role) => context.groups.includes(role));
}
```
</implementation>

<verification>
After making the change, verify:
- The `hasRole()` function now has the `!requiredRoles.includes('Admin')` guard on the Moderator line
- `isSuperAdmin()` and `requireSuperAdmin()` are untouched
- No other files were modified
- The TypeScript compiles without errors (run `cd backend && npx tsc --noEmit` to check)
</verification>

<success_criteria>
- `hasRole(moderatorContext, 'Admin')` returns false
- `hasRole(moderatorContext, 'Moderator')` returns true
- `hasRole(moderatorContext, 'Wrestler')` returns true
- `hasRole(adminContext, 'Admin')` returns true
- Backend auth.ts compiles cleanly
</success_criteria>
