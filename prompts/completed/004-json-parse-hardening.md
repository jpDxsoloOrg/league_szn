<objective>
Harden 15+ backend Lambda handlers against malformed JSON by extracting a shared `parseBody()` utility and applying it to all handlers that use `JSON.parse(event.body)` without try-catch. Malformed JSON currently causes generic 500 errors instead of descriptive 400 responses.
</objective>

<context>
This is a WWE 2K League Management serverless backend (Node.js 24.x + TypeScript + DynamoDB on AWS Lambda).

All Lambda handlers use `backend/lib/response.ts` which exports `badRequest()`, `serverError()`, etc.

Six handlers were previously hardened with try-catch, but 15+ remain unguarded. The solution is to create a shared utility rather than repeating try-catch boilerplate in every file.

Files to CREATE:
- `backend/lib/parseBody.ts` (new shared utility)

Files to MODIFY (all use unguarded `JSON.parse(event.body)`):
- `backend/functions/matches/scheduleMatch.ts` (line ~25)
- `backend/functions/championships/updateChampionship.ts` (line ~17)
- `backend/functions/championships/createChampionship.ts` (line ~20)
- `backend/functions/tournaments/createTournament.ts` (line ~96)
- `backend/functions/tournaments/updateTournament.ts` (line ~17)
- `backend/functions/images/generateUploadUrl.ts` (line ~27)
- `backend/functions/players/updatePlayer.ts` (line ~17)
- `backend/functions/players/updateMyProfile.ts` (line ~21)
- `backend/functions/players/createPlayer.ts` (line ~19)
- `backend/functions/divisions/updateDivision.ts` (line ~22)
- `backend/functions/divisions/createDivision.ts` (line ~17)
- `backend/functions/events/updateEvent.ts` (line ~46)
- `backend/functions/seasons/createSeason.ts` (line ~18)
- `backend/functions/seasons/updateSeason.ts` (line ~23)
- `backend/functions/fantasy/updateFantasyConfig.ts` (line ~33)
- `backend/functions/promos/adminUpdatePromo.ts` (line ~16)
- `backend/functions/promos/reactToPromo.ts` (line ~19)
</context>

<requirements>
1. **Create `backend/lib/parseBody.ts`** — a shared utility:
```typescript
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { badRequest } from './response';

/**
 * Safely parse the JSON body from an API Gateway event.
 * Returns the parsed object on success, or a 400 badRequest response on failure.
 */
export function parseBody<T = Record<string, any>>(
  event: APIGatewayProxyEvent
): { data: T; error?: never } | { data?: never; error: APIGatewayProxyResult } {
  try {
    if (!event.body) {
      return { error: badRequest('Request body is required') };
    }
    const data = JSON.parse(event.body) as T;
    return { data };
  } catch {
    return { error: badRequest('Invalid JSON in request body') };
  }
}
```

2. **Update each handler file** — read each file first, then replace the unguarded `JSON.parse(event.body)` with the `parseBody` utility. The pattern is:

   BEFORE (typical pattern):
   ```typescript
   const body = JSON.parse(event.body || '{}');
   ```

   AFTER:
   ```typescript
   import { parseBody } from '../../lib/parseBody'; // adjust relative path
   // ... inside handler:
   const { data: body, error: parseError } = parseBody(event);
   if (parseError) return parseError;
   ```

3. Read EVERY file before editing it — the exact `JSON.parse` pattern varies per handler
4. Adjust the import path based on file depth (e.g., `../../lib/parseBody` for files in `functions/domain/`)
5. Do NOT modify any logic beyond replacing the JSON.parse call and adding the import
6. Do NOT touch handlers that already have try-catch around JSON.parse

For maximum efficiency, read multiple handler files in parallel to understand their patterns, then edit them.
</requirements>

<verification>
After making all changes:
1. Run `cd backend && npx tsc --noEmit` to verify all files compile
2. Search for remaining unguarded JSON.parse: `grep -rn "JSON.parse(event.body" backend/functions/ --include="*.ts"` — each result should be inside a try-catch or using parseBody
3. Verify parseBody.ts exists and exports the utility
4. Verify no handler logic was changed beyond the JSON.parse replacement
</verification>

<success_criteria>
- `backend/lib/parseBody.ts` exists with the parseBody utility
- All 17 listed handler files use `parseBody()` instead of raw `JSON.parse(event.body)`
- All files compile without TypeScript errors
- No handler business logic was changed
- Import paths are correct for each file's depth
</success_criteria>
