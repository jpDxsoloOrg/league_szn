# Plan: UX — Loading skeletons and improved empty states across all pages

**GitHub issue:** [#155](https://github.com/jpDxsolo/league_szn/issues/155) — UX: Add loading skeletons and improved empty states across all pages

## Context

Data-fetching pages currently show plain "Loading..." text and minimal empty-state copy (e.g. "No players found") with no visual treatment or CTAs. This plan adds reusable skeleton placeholders that mirror content layout and consistent empty-state components (icon, friendly text, optional CTA) across Standings, Championships, Tournaments, Events, Stats, ContenderRankings, Fantasy, Dashboard, and admin/wiki/challenge flows.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review shared components and page integrations |
| Before commit | git-commit-helper | Conventional commit message |
| When adding/updating tests | test-generator | Tests for skeleton/empty-state rendering |

## Agents and parallel work

- **Suggested order**: Step 1 → Steps 2+3+4+5+6 → Steps 7+8 → Step 9.
- **Agent types**: `general-purpose` for all steps (React/CSS/i18n); optionally `test-engineer` for Step 10 if adding tests in same run.

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/components/ui/Skeleton.tsx` | Create | Reusable skeleton variants (table rows, cards, calendar, block) |
| `frontend/src/components/ui/Skeleton.css` | Create | Skeleton animation and layout styles |
| `frontend/src/components/ui/EmptyState.tsx` | Create | Reusable empty state (icon, title, description, optional CTA) |
| `frontend/src/components/ui/EmptyState.css` | Create | Empty state layout and typography |
| `frontend/src/components/Standings.tsx` | Modify | Use Skeleton (table), EmptyState for no players |
| `frontend/src/components/Championships.tsx` | Modify | Use Skeleton (cards), EmptyState for no championships |
| `frontend/src/components/Tournaments.tsx` | Modify | Use Skeleton (cards/list), EmptyState for no tournaments |
| `frontend/src/components/events/EventsCalendar.tsx` | Modify | Use Skeleton (calendar), EmptyState for no events |
| `frontend/src/components/events/EventResults.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/events/EventDetail.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/Dashboard.tsx` | Modify | Use Skeleton blocks and EmptyState for each empty section |
| `frontend/src/components/statistics/Rivalries.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/statistics/PlayerStats.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/statistics/BestMatches.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/statistics/Leaderboards.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/statistics/TaleOfTheTape.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/statistics/HeadToHeadComparison.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/statistics/EmbeddedPlayerStats.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/contenders/ContenderRankings.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/ActivityFeed.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/fantasy/WrestlerCosts.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/fantasy/ShowResults.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/admin/RecordResult.tsx` | Modify | Use Skeleton + EmptyState where applicable |
| `frontend/src/components/admin/ScheduleMatch.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/admin/ManageDivisions.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/admin/AdminChallenges.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/admin/AdminPromos.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/admin/MatchCardBuilder.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/challenges/ChallengeBoard.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/challenges/ChallengeDetail.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/challenges/MyChallenges.tsx` | Modify | Use Skeleton + EmptyState |
| `frontend/src/components/WikiArticle.tsx` | Modify | Use Skeleton for loading |
| `frontend/src/components/WikiIndex.tsx` | Modify | Use Skeleton for loading |
| `frontend/src/components/profile/WrestlerProfile.tsx` | Modify | Use shared EmptyState if applicable; keep or align loading |
| `frontend/src/i18n/locales/en.json` | Modify | Add keys for empty-state CTAs (e.g. checkBackSoon, createFirstX) |
| `frontend/src/i18n/locales/de.json` | Modify | Same keys, German translations |

## Implementation Steps

### Step 1: Shared Skeleton and EmptyState components

- Create `frontend/src/components/ui/` and add:
  - **Skeleton.tsx**: Export a `Skeleton` component that accepts a `variant`: `'table'` (multiple rows with columns), `'cards'` (grid of card-shaped blocks), `'calendar'` (month grid with day cells), `'block'` (generic rectangular blocks). Use a single pulsing/animated placeholder style (e.g. `animation: shimmer` or opacity pulse). Support optional `rows`/`count` for table/cards. Use `role="status"` and `aria-label` (e.g. "Loading") for accessibility.
  - **Skeleton.css**: Define `.skeleton`, `.skeleton-table`, `.skeleton-cards`, `.skeleton-calendar`, `.skeleton-block` and a simple shimmer or pulse animation using CSS variables if the project has a design system (see existing `--*` in CSS).
  - **EmptyState.tsx**: Accept props: `icon` (ReactNode or icon name string), `title` (string), `description` (string), optional `actionLabel` and `onAction` (CTA button). Render a centered block with icon, title, description, and optional button. Use i18n for any default copy; allow parent to pass translated strings.
  - **EmptyState.css**: Center content, spacing, and basic typography; align with existing `.empty-state` styles where used (e.g. Standings, Championships).
- Add i18n keys under `common` or a new `emptyState` namespace, e.g. `checkBackSoon`, `createFirstChampionship`, `createFirstPlayer`, so pages can pass them into EmptyState. Add en + de in `en.json` and `de.json`.

### Step 2: Standings — skeleton table and empty state

- In `Standings.tsx`, when `loading` is true, render `<Skeleton variant="table" />` (or equivalent) instead of `<div className="loading">…</div>`. Ensure the skeleton approximates the standings table layout (e.g. several rows with rank, name, wins, losses, form).
- When `standings?.players.length === 0`, render `<EmptyState title={...} description={...} />` using existing `standings.noPlayers` (and optional CTA like "Check back soon" for public). Reuse or replace the current `.empty-state` div with the new component.

### Step 3: Championships — skeleton cards and empty state

- In `Championships.tsx`, when `loading` is true, render `<Skeleton variant="cards" />` instead of the current loading div.
- When `championships.length === 0`, render `<EmptyState />` with title/description from i18n (`championships.noChampionships`) and optional CTA for admins (e.g. link to manage championships) or "Check back soon" for public.

### Step 4: Tournaments — skeleton and empty state

- In `Tournaments.tsx`, when `loading` is true, render `<Skeleton variant="cards" />` (or a list variant if the layout is list-like) instead of plain loading text.
- When `tournaments.length === 0`, render `<EmptyState />` with appropriate title, description, and optional CTA.

### Step 5: Events (Calendar, Results, Detail) — skeleton and empty states

- In `EventsCalendar.tsx`, when `loading`, render `<Skeleton variant="calendar" />` (or block variant that suggests a calendar grid). When no events, use `<EmptyState />` with friendly text and optional CTA.
- In `EventResults.tsx` and `EventDetail.tsx`, replace loading div with `<Skeleton variant="block" />` (or a short block list). Use `<EmptyState />` when there is no event or no results, with clear copy.

### Step 6: Dashboard — skeleton blocks and empty states

- In `Dashboard.tsx`, when `loading && !data`, render a dashboard-shaped skeleton (e.g. several `<Skeleton variant="block" />` sections for quick stats, champions, upcoming events, recent results). Replace existing "Loading..." treatment.
- For each empty section (no champions, no upcoming events, no recent results, no active season), use `<EmptyState />` or a compact inline empty message that matches the new design (icon + short text). Prefer EmptyState for prominent sections.

### Step 7: Statistics components — skeleton and empty states

- In `Rivalries.tsx`, `PlayerStats.tsx`, `BestMatches.tsx`, `Leaderboards.tsx`, `TaleOfTheTape.tsx`, `HeadToHeadComparison.tsx`, and `EmbeddedPlayerStats.tsx`: replace current loading output (e.g. `<p>{t('common.loading')}</p>`) with `<Skeleton variant="block" />` or a variant that fits the layout (e.g. table for leaderboards). Replace "no data" / empty outputs with `<EmptyState />` using existing i18n keys where applicable (e.g. `statistics.bestMatches.noData`, `rivalries.noRivalries`).

### Step 8: ContenderRankings, ActivityFeed, Fantasy (WrestlerCosts, ShowResults)

- In `ContenderRankings.tsx`, when `loading` (and optionally when contenders are loading), show `<Skeleton variant="cards" />` or block. When no championships or no contenders, use `<EmptyState />` with appropriate copy.
- In `ActivityFeed.tsx`, when `loading && items.length === 0`, show `<Skeleton variant="block" />`. When `items.length === 0` after load, use `<EmptyState />` (e.g. `activity.noActivity`).
- In `WrestlerCosts.tsx` and `ShowResults.tsx`, replace loading state with `<Skeleton variant="block" />` or cards, and empty state with `<EmptyState />`.

### Step 9: Admin, challenges, wiki, profile

- In `RecordResult.tsx`, `ScheduleMatch.tsx`, `ManageDivisions.tsx`, `AdminChallenges.tsx`, `AdminPromos.tsx`, `MatchCardBuilder.tsx`: replace "Loading..." (or similar) with `<Skeleton variant="block" />` or table/cards as appropriate; replace `.empty-state` or plain "no X" text with `<EmptyState />` (with admin-oriented CTAs where relevant, e.g. "Create first division").
- In `ChallengeBoard.tsx`, `ChallengeDetail.tsx`, `MyChallenges.tsx`: same pattern — Skeleton for loading, EmptyState for no challenges.
- In `WikiArticle.tsx` and `WikiIndex.tsx`, replace loading paragraph with `<Skeleton variant="block" />`.
- In `WrestlerProfile.tsx`, align loading with shared Skeleton if it already has a custom spinner; use EmptyState for "no profile" case if it improves consistency.

## Dependencies & Order

- Step 1 must be done first (shared components and i18n).
- Steps 2–6 can run in parallel (each page uses shared Skeleton/EmptyState).
- Steps 7–8 can run in parallel after 2–6 (stats, contenders, activity, fantasy).
- Step 9 can run after 7–8 (admin, challenges, wiki, profile).
- **Suggested order**: Step 1 → Steps 2+3+4+5+6 → Steps 7+8 → Step 9.

## Testing & Verification

- Manual: Load each affected page with slow network (throttling) and confirm skeleton appears instead of "Loading..."; clear data or use empty fixtures and confirm empty state shows icon, text, and CTA where expected.
- Existing tests that assert "Loading..." or "No players found" etc. should be updated to match new structure (e.g. Skeleton role/aria-label, EmptyState title/description). Run frontend lint and tests; fix any snapshot or text assertions.
- Optionally add a simple test for `Skeleton` and `EmptyState` (render with props and check accessibility attributes and CTA).

## Risks and edge cases

- **Design system**: If the project adopts CSS variables for colors/spacing, Skeleton and EmptyState should use them so they respect theme.
- **Admin vs public**: EmptyState CTA may differ (e.g. "Create your first championship" for admin vs "Check back soon" for public); ensure pages pass the right action or hide CTA when not applicable.
- **Existing .empty-state class**: Some components have local `.empty-state` CSS; either keep that class on the wrapper rendered by EmptyState or migrate styles into EmptyState.css and remove duplicates.
- **Tests**: Many tests look for exact "Loading..." or "No players found"; updating them in one pass may touch many files; run tests after each wave and fix failures before proceeding.
