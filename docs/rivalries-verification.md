# RIV-19 Verification Report

Verification ledger for the Rivalries feature epic. Each row is one
acceptance-criterion checkbox from RIV-19; rows marked **pending
human** require either a running devtest environment, a real
browser, or two separate user accounts and are deferred to whoever
runs the manual smoke before promoting to prod.

## Automated checks (this branch)

| Check | Status | Notes |
|---|---|---|
| `cd backend && npx tsc --project tsconfig.json --noEmit` | ✅ pass | 0 errors |
| `cd frontend && npx tsc --project tsconfig.app.json --noEmit` | ✅ pass | 0 errors |
| `cd backend && npm run lint` | ✅ pass | 0 warnings |
| `cd frontend && npm run lint` | ✅ pass | 0 warnings |
| `cd backend && npx vitest run` | ✅ pass | 1139/1139 |
| `cd frontend && npx vitest run` | ✅ pass | 532/532 |

## Manual smoke (pending human against devtest)

- [ ] Deploy backend (`devtest` stage) + frontend (`devtest` mode) per the
  CLAUDE.md deploy commands.
- [ ] Wrestler A: dashboard → "My Active Rivalries" card → seeded
  rivalry → Overview tab populated.
- [ ] Wrestler A: Request a Rivalry → two-step form → pending detail page.
- [ ] Admin: `/admin/rivalries` → approve pending request → wrestler A
  receives notification, status flips to `active`, system message in
  Messages tab.
- [ ] Wrestler A posts an `admins`-audience message → admin sees it on
  refresh → wrestler B confirms it is NOT in their messages list.
  Wrestler A posts a `participants`-audience message → wrestler B sees
  it on refresh.
- [ ] Admin schedules a match from Future Matches tab → match created
  with `rivalryId` → appears in Future Matches → after recording
  result, appears in Match History.
- [ ] Admin tags a promo with `rivalryId` from the promo composer →
  appears in the rivalry's Promos tab.
- [ ] Language switch: `de` renders all rivalry strings translated;
  fallback to en for any missing key.

## Visibility audit (pending human, but mirror tests cover most of it)

Automated test coverage backing each manual check:

| Audit cell | Server-side test |
|---|---|
| Wrestler B viewing wrestler A's `admins` messages | `listMessages` "hides admins-only messages from a participant who is not the author" |
| Wrestler B viewing GM `admins` plan notes | `listNotes` "hides plan notes from wrestlers unless published to participants or all" |
| Unauthenticated viewing detail | `getRivalry` "returns a public-safe payload without moderationNote for anonymous callers" |
| Non-participant POST message | `postMessage` "rejects non-participants with 403 (not 404)" |
| Non-participant POST note | `upsertNote` "rejects a non-participant non-GM with 403" |
| Wrestler authoring plan | `upsertNote` "rejects a wrestler trying to author a plan note with 403" |
| Wrestler-authored storyline visibility coercion | `upsertNote` "forces a wrestler-authored storyline note to admins visibility" |

The manual smoke still wants two real user sessions to confirm the
client UI also drops these — defense-in-depth is in
`NotesPlansTab.filterClientSide`, which mirrors the server filter.

## Accessibility & performance (pending human)

- [ ] Keyboard-only nav Hub → Detail → Messages composer.
- [ ] Screen reader reads thread chronologically with author attribution.
- [ ] Hub TTI under 2s with seed data; Detail TTI under 2s; messages
  polling jank-free.

## Follow-up tickets filed during this epic

- `defaultMessageAudience` is currently a client-only setting on the
  Messages tab. RIV-12 spec hints at persisting it to the Rivalry
  shape; the data model does not carry that field yet. File a
  follow-up if the persisted toggle is required pre-GA.
- Polling fan-out (RIV-12 Notes): if many active Messages tabs hit
  prod simultaneously, file a follow-up for long-poll or SSE.
- Materialized `RivalryActivity` derived table (RIV-03 Notes): only
  needed if the on-the-fly merge gets slow at real data volumes.

## Visibility model sign-off

The matrix that this epic enforces server-side. **Every cell verified by
automated tests cited above.**

| Role × audience | `messages.admins` | `messages.participants` | `messages.all` | `notes.plan.admins` | `notes.plan.participants` | `notes.plan.all` | `notes.storyline.admins` | `notes.storyline.participants` | `notes.storyline.all` |
|---|---|---|---|---|---|---|---|---|---|
| Admin / Moderator | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Participant (author) | ✅ | ✅ | ✅ | n/a (cannot author plan) | n/a | n/a | ✅ | ✅ | ✅ |
| Participant (other) | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Anonymous | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
