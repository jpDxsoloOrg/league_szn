# Plan: Mobile App Experience (bottom-tab, app-like UI on phones)

## Context

The site is desktop-first: a fixed 260px sidebar (`frontend/src/components/Sidebar.tsx`) with a hamburger drawer at phone widths, and sparse media-query coverage across component CSS. On phones the site should look and behave like a native mobile app.

The visual design was produced in Google Stitch (project **"League SZN Mobile"**, dark theme, gold `#d4af37` accent, Oswald headlines / Inter body). The exported screens live in **`docs/design/mobile-app/`** — each folder has `screen.png` (source of truth for layout/styling) and `code.html` (reference only). Design tokens/component rules: `docs/design/mobile-app/DESIGN.md`.

Product decisions already made:

- **Navigation**: bottom tab bar with 5 tabs — **Home `/`, Standings `/standings`, Rivalries `/rivalries`, Profile `/profile`, More**. "More" opens a sheet with all remaining features, plus an **Admin Panel** entry for admins/moderators.
- **User screens with bespoke mobile design**: Dashboard, Standings, Rivalries (hub + detail), Profile, Championships, Events, Matches. Everything else is reachable via More using its existing rendering.
- **Admin**: ALL admin features stay available on mobile. `/admin` renders a grouped **admin hub list** at phone widths; sections share reusable mobile styles (list-manage, full-screen form). `MatchCardBuilder` and the Danger Zone get bespoke treatment.
- Desktop experience is unchanged. Mobile = `useMediaQuery('(max-width: 768px)')`.

## Grounding — existing code to build on

| Thing | Where | Note |
|---|---|---|
| Media-query hook | `frontend/src/hooks/useMediaQuery.ts` | Returns `false` in JSDOM → desktop snapshots unaffected in tests |
| Proven mobile pattern | `frontend/src/components/Standings.tsx` (≤640px card view, `Standings.css:298+`) | The card-swap pattern to replicate |
| Nav source of truth | `frontend/src/config/navConfig.ts` (`USER_NAV_GROUPS`, `USER_NAV_STANDALONE`, `ADMIN_NAV_GROUPS`) | Tabs + More sheet must derive from this, not duplicate it |
| Feature/role visibility | `isUserItemVisible` (used by `Sidebar.tsx`), `useSiteConfig()`, `hasRole` in `AuthContext.tsx` | Reuse for tab/More filtering |
| Design tokens | `frontend/src/variables.css` | Already matches the Stitch palette |
| App shell | `App.tsx` `AppLayout` (renders `Sidebar` + `TopBar` + `main`) | Mount point for the mobile shell |
| Admin shell | `frontend/src/components/admin/AdminPanel.tsx` (tab dispatcher off `/admin/:tab`) | Hub list reuses its tab registry |
| Dormant code | `frontend/src/components/TopNav.tsx` + `frontend/src/contexts/NavLayoutContext.tsx` | Unmounted horizontal nav — delete (confirm nothing imports it first) |

## Files to Modify

| File | Change |
|---|---|
| `frontend/src/components/mobile/BottomTabBar.tsx` + `.css` | NEW — fixed bottom tab bar |
| `frontend/src/components/mobile/MoreSheet.tsx` + `.css` | NEW — More bottom sheet |
| `frontend/src/components/mobile/MobileHeader.tsx` + `.css` | NEW — slim mobile screen header |
| `frontend/src/App.tsx`, `frontend/src/App.css` | Mobile shell switch in `AppLayout` |
| `frontend/src/components/TopNav.tsx`, `.css`, `frontend/src/contexts/NavLayoutContext.tsx` | DELETE dormant nav |
| `frontend/public/manifest.webmanifest`, `frontend/index.html` | NEW manifest + PWA meta |
| `frontend/src/components/Dashboard.tsx` + `.css` | Mobile app styling |
| `frontend/src/components/Standings.tsx` + `.css` | Mobile card polish |
| `frontend/src/components/rivalries/RivalryHub.tsx`, `RivalryDetail.tsx` + CSS | Mobile styling |
| `frontend/src/components/profile/WrestlerProfile.tsx` + CSS | Mobile styling |
| `frontend/src/components/Championships.tsx`, `EventsCalendar.tsx`, `MatchSearch.tsx` + CSS | Mobile card styling |
| `frontend/src/components/admin/AdminPanel.tsx` + CSS | Mobile admin hub |
| `frontend/src/components/admin/mobile/adminMobile.css` (or similar) | NEW shared admin mobile styles |
| `frontend/src/components/admin/MatchCardBuilder.tsx`, `ClearAllData.tsx` + CSS | Bespoke mobile styling |
| `frontend/src/components/mobile/__tests__/*` | NEW component tests |

## Implementation Steps

### Step 1: BottomTabBar component

Create `frontend/src/components/mobile/BottomTabBar.tsx` + `BottomTabBar.css`. Match `docs/design/mobile-app/league-szn-home-dashboard/screen.png` (bottom bar): 5 items (icon + tiny uppercase label), background `var(--color-surface)`, top border `var(--color-border)`, active item gold `var(--color-primary)`, inactive `var(--color-text-muted)`, `padding-bottom: env(safe-area-inset-bottom)`, fixed to viewport bottom, min 44px tap targets.

Tabs: Home `/`, Standings `/standings`, Rivalries `/rivalries`, Profile `/profile`, More (a button, not a route — calls an `onMoreClick` prop). Active tab from `useLocation` (More is "active" while the sheet is open via an `isMoreOpen` prop). Visibility rules: hide Rivalries when the `rivalries` feature flag is off (`useSiteConfig()`), substituting Championships `/championships`; Profile navigates to `/profile` for users with the Wrestler role (`useAuth()`/`hasRole`) and to `/login` when signed out. Reuse icons in the style the app already uses (check how `Sidebar.tsx` renders nav icons and reuse that approach). i18n all labels (`useTranslation`; add keys to `frontend/src/i18n/locales/en.json` and `de.json`).

### Step 2: MoreSheet component

Create `frontend/src/components/mobile/MoreSheet.tsx` + `MoreSheet.css`. Match `docs/design/mobile-app/league-szn-more-menu/screen.png`: a bottom sheet (overlay scrim + slide-up panel, rounded top corners) listing nav groups. Build rows from `USER_NAV_GROUPS`/`USER_NAV_STANDALONE` in `frontend/src/config/navConfig.ts`, excluding paths already on the tab bar (`/`, `/standings`, `/rivalries`, `/profile`), filtered with the same feature-flag/role logic Sidebar uses (`isUserItemVisible` or equivalent). Pinned at top when `isAdminOrModerator`: a gold-bordered "Admin Panel" row → `/admin`. At bottom: `LanguageSwitcher` (reuse existing component) and a red "Log out" row (reuse Sidebar's logout handler pattern; show Log in instead when signed out). Props: `open`, `onClose`. Close on route change, Escape, and scrim tap; lock body scroll while open (Sidebar's mobile drawer already does this — copy the pattern). i18n everything.

### Step 3: Mobile shell in AppLayout

In `frontend/src/App.tsx` `AppLayout`: `const isMobile = useMediaQuery('(max-width: 768px)')`. When `isMobile`: do NOT render `Sidebar`/`TopBar`; instead render a new `MobileHeader` (`frontend/src/components/mobile/MobileHeader.tsx` + css: slim bar, screen title left in Oswald-style using existing heading styles, `NotificationBell` right — reuse the path→title logic from `TopBar.tsx`, extracting it to a shared helper if needed) plus `BottomTabBar` and `MoreSheet` (open state lives here). Give `main` bottom padding (~72px + safe-area) via an `.app-mobile` class in `App.css` and remove the desktop left margin at mobile widths. Desktop rendering must be byte-for-byte unchanged. Admin routes (`/admin*`) at mobile widths: keep the header but the tab bar may remain visible (simplest; hub/danger screens in the design omit it, but keeping it is acceptable v1). Verify `npx tsc --project tsconfig.app.json --noEmit` passes.

### Step 4: Delete dormant TopNav

First `grep -rn "TopNav\|NavLayoutContext"` under `frontend/src/`. If truly only self-referential (plus possibly `navConfig.ts` comments and `MenuModeToggle`-adjacent wiring), delete `frontend/src/components/TopNav.tsx`, its CSS, and `frontend/src/contexts/NavLayoutContext.tsx`, and remove any dead imports/providers/comments. If something meaningful consumes them at runtime, STOP and report instead of deleting. Frontend `tsc` must pass after removal.

### Step 5: PWA manifest and meta

Add `frontend/public/manifest.webmanifest`: name "League SZN", short_name "League SZN", `display: "standalone"`, `background_color`/`theme_color` `#0f0f0f`, start_url `/`, icons (reference existing favicon/logo assets in `frontend/public/` — check what exists; if only a favicon exists, declare it and note larger icons as TODO). In `frontend/index.html`: `<link rel="manifest" ...>`, `<meta name="theme-color" content="#0f0f0f">`, and add `viewport-fit=cover` to the existing viewport meta.

### Step 6: Dashboard mobile styling

Match `docs/design/mobile-app/league-szn-home-dashboard/screen.png` in `Dashboard.tsx`/`Dashboard.css` at ≤768px: full-bleed hero champion card with overlay text and carousel dots, stacked What's Happening cards (LIVE badge, countdown pill), 2×2 quick-stats grid with big gold numbers, horizontally scrolling recent-result cards, season progress card with the ring right-aligned. Prefer CSS-only changes; use `useMediaQuery` + alternate JSX only where CSS cannot reproduce the design (follow the `Standings.tsx` card-swap pattern). Do not touch data fetching. Desktop unchanged.

### Step 7: Standings mobile polish

`Standings.tsx`/`Standings.css` already render cards at ≤640px. Align them with `docs/design/mobile-app/league-standings/screen.png`: big Oswald-style rank numeral, gold accent treatment for top 3, form dots row, streak badge (hot = gold/flame, cold = blue), OVR in a gold-bordered square, division/alignment filter chips styled as horizontally scrollable pills. Bump the card breakpoint to 768px to match the new shell. Desktop table unchanged.

### Step 8: Rivalries hub and detail mobile styling

Match `docs/design/mobile-app/rivalries-hub/screen.png` and `rivalry-detail-danny-b-vs-marcus-rivera/screen.png` in `frontend/src/components/rivalries/RivalryHub.tsx`, `RivalryDetail.tsx` and their CSS (plus `HeatBadge` styles if needed) at ≤768px: segmented Active/Mine/Archive control, heat filter chip row, rivalry cards with avatar-VS-avatar layout + heat badge + thin heat meter bar + footnote, activity feed items with icon circles; detail: avatar-VS hero, gradient heat meter with indicator and score, scrollable tab strip with gold underline, stacked overview cards. Keep all existing behavior/routing; styling and small markup adjustments only. Desktop unchanged.

### Step 9: Profile mobile styling

Match `docs/design/mobile-app/my-profile/screen.png` in `frontend/src/components/profile/WrestlerProfile.tsx` + CSS at ≤768px: header card (avatar with gold ring, name, wrestler/alt names, PSN, alignment badge pill), 3-up stats row with big numbers, grouped "details" rows (label left / value + chevron right), alignment selector as three pills, division card with transfer button/pending badge. Reuse existing edit flows — do not change form logic. Desktop unchanged.

### Step 10: Championships, Events, Matches mobile styling

At ≤768px match: `docs/design/mobile-app/championships/screen.png` in `Championships.tsx` + CSS (belt image cards, champion row with gold-ring avatar, days-held, VACANT state, View history link); `league-szn-events/screen.png` in `EventsCalendar.tsx` + CSS (Upcoming/Past segmented control, date-block cards, LIVE card with progress bar, grayed past card with Results link); `league-szn-matches/screen.png` in `MatchSearch.tsx` + CSS (rounded search bar, filter chip row, result cards with bold winner + green W / muted loser + red L, star rating, belt icon for title matches, SCHEDULED variant). Existing data/filter logic untouched. Desktop unchanged.

### Step 11: Mobile admin hub

Match `docs/design/mobile-app/admin-panel-hub/screen.png`. In `frontend/src/components/admin/AdminPanel.tsx` (+ CSS): at ≤768px, when no tab is selected (`/admin`), render a grouped tappable list built from the existing tab registry — groups: Roster & People, Match & Competition, Content & Storylines, League Config, Users & Access, Danger Zone (red-tinted, superadmin-gated exactly like the existing `danger` tab logic). Rows: icon, label, chevron → navigate to `/admin/:tab`. When a tab IS selected on mobile, render that section full-width with a back chevron to `/admin` in the header area. Desktop admin panel unchanged.

### Step 12: Shared admin mobile styles (list + form)

Create shared mobile CSS (e.g. `frontend/src/components/admin/mobile/adminMobile.css`, imported by `AdminPanel.tsx`) implementing the two template looks at ≤768px: (a) list-manage per `docs/design/mobile-app/manage-players-admin/screen.png` — full-width search input, card rows (avatar, two-line text, right-aligned icon actions), gold FAB (add) fixed bottom-right above the tab bar; (b) full-screen form per `schedule-match-admin/screen.png` — stacked field cards with labels above inputs, selected-participant token chips, gold toggle, sticky bottom save bar. Apply by adding generic classes that target the existing markup of admin sections (start with `ManagePlayers` and `ScheduleMatch` as the reference adopters; broader class-based coverage of other sections is welcome but must not restructure their JSX). Desktop unchanged.

### Step 13: MatchCardBuilder and Danger Zone mobile styling

At ≤768px: `MatchCardBuilder.tsx` + CSS per `docs/design/mobile-app/match-card-builder-admin/screen.png` — event header card with DRAFT pill, numbered match cards with drag handle + stipulation/title pills + overflow menu, MAIN EVENT gold-border highlight, sticky Publish/Preview bar, add FAB (keep existing reorder mechanism; do not build new drag-and-drop if none exists — style what's there). `ClearAllData.tsx` + CSS per `danger-zone-admin-panel/screen.png` — red banner, red-tinted destructive cards, prominent confirm treatment; KEEP the existing confirmation logic exactly (restyle only, do not weaken any confirm step). Desktop unchanged.

### Step 14: Mobile shell component tests

Add Vitest + React Testing Library tests under `frontend/src/components/mobile/__tests__/`: `BottomTabBar` — renders 5 tabs, active tab matches route, Rivalries hidden (Championships shown) when `rivalries` feature flag is off, Profile target is `/login` when signed out; `MoreSheet` — Admin Panel row only for admin/moderator, excludes tab-bar paths, calls `onClose` on scrim/Escape. Mock `SiteConfigContext`/`AuthContext` the way existing component tests do (find an existing test that mocks these and follow it). Also assert desktop layout still renders Sidebar when `matchMedia` is unavailable (JSDOM default).

## Dependencies & Order

- Steps 1, 2, 4, 5 are independent (new files / deletions / static assets).
- Step 3 integrates Steps 1+2 into `App.tsx` (and is cleaner after 4's deletions).
- Steps 6–10 are independent of each other (different components) and only visually depend on Step 3.
- Step 11 depends on Step 3 (shell). Steps 12, 13 depend on Step 11 only for visual context — they touch different files and can run together after it.
- Step 14 tests components from Steps 1–3.

**Suggested order**: Steps 1+2+4+5 -> Step 3 -> Steps 6+7+8+9+10 -> Steps 11+14 -> Steps 12+13

## Testing & Verification

- `cd frontend && npx tsc --project tsconfig.app.json --noEmit` — zero errors (required before push).
- `cd frontend && npm run lint` and the frontend Vitest suite — all green. JSDOM's `matchMedia` absence keeps `useMediaQuery` false, so existing desktop tests must remain untouched/passing.
- New tests from Step 14 pass.
- Manual: Playwright/devtools mobile viewport (390×844) — tab navigation across the 4 tabs, More sheet opens/closes with correct entries per role, admin hub → Manage Players → edit flow, desktop viewport (1280px) identical to before.
- Backend is untouched; backend suite should be a no-op pass.
