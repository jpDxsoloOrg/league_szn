<objective>
Fix the `sanitizeName()` function in the frontend to support international/Unicode characters (accents, umlauts, tildes, cedillas, etc.) instead of stripping them. This is relevant for WWE wrestler names with diacritics.
</objective>

<context>
This is a WWE 2K League Management React + TypeScript frontend.

Current state in `frontend/src/utils/sanitize.ts` line 41:
```typescript
.replace(/[^a-zA-Z0-9\s\-'.]/g, '');
```
This ASCII-only allowlist strips all accented characters like e, u, n, c — which are valid in wrestler names.

File to modify: `frontend/src/utils/sanitize.ts`
</context>

<requirements>
1. Read `frontend/src/utils/sanitize.ts` to confirm current state
2. In the `sanitizeName` function, replace the ASCII-only regex with a Unicode-aware pattern:

   BEFORE:
   ```typescript
   .replace(/[^a-zA-Z0-9\s\-'.]/g, '');
   ```

   AFTER:
   ```typescript
   .replace(/[^\p{L}\p{N}\s\-'.]/gu, '');
   ```

   Where:
   - `\p{L}` matches any Unicode letter (includes accented, CJK, Cyrillic, etc.)
   - `\p{N}` matches any Unicode number
   - The `u` flag enables Unicode mode
   - Everything else (spaces, hyphens, apostrophes, periods) stays the same

3. Update the inline comment to reflect the change:
   ```typescript
   .replace(/[^\p{L}\p{N}\s\-'.]/gu, ''); // Only allow Unicode letters/numbers, spaces, hyphens, apostrophes, periods
   ```

4. Do NOT modify any other functions in the file (`sanitizeInput`, `sanitizeDescription`, `isValidInput`, `meetsMinLength`)
5. Do NOT change the function signature or default parameters
</requirements>

<verification>
After making the change:
1. Verify the regex uses `\p{L}` and `\p{N}` with the `u` flag
2. Verify only the `sanitizeName` function was changed
3. Run `cd frontend && npx tsc --noEmit` to verify TypeScript compiles
4. Mentally verify: `sanitizeName("Rey Mysterio")` returns `"Rey Mysterio"`, `sanitizeName("Andre the Giant")` preserves the accent, `sanitizeName("<script>alert</script>")` strips the angle brackets
</verification>

<success_criteria>
- `sanitizeName` uses Unicode-aware regex `/[^\p{L}\p{N}\s\-'.]/gu`
- International characters (accents, umlauts, etc.) are preserved
- Dangerous characters (<, >, etc.) are still stripped
- No other functions in the file were modified
- TypeScript compiles without errors
</success_criteria>
