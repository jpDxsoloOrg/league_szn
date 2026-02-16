# New Features & Improvements — League SZN

Proposed new features and improvements based on a thorough review of the codebase, existing feature set, UI/UX patterns, and competitive analysis of league management apps.

---

## New Features

### 1. 🏆 Match of the Night / Star Rating System

**Problem:** After events conclude, there's no way to highlight standout matches or track match quality over time. All completed matches are treated equally — a 5-star classic and a squash match look the same.

**Proposal:** Add a star rating system (1–5 stars, half-star increments) for completed matches. After recording a match result, the admin can assign a star rating. Public users see ratings on event results pages and in a new "Match of the Night" badge on each event. Statistics pages gain a "Highest Rated Matches" leaderboard and per-player average match rating.

**Scope:**
- **Backend:** Add `starRating` (number, 0.5–5.0) and `matchOfTheNight` (boolean) optional fields to the Matches table. Update `PUT /matches/{matchId}/result` to accept these fields. New `GET /statistics` section for match ratings.
- **Frontend:** Star rating input on the match result form (`AdminMatchResult.tsx`). Gold star badges on `EventDetail.tsx` and `EventResults.tsx`. New "Best Matches" tab on Statistics. "Match of the Night" callout card on event detail pages.
- **i18n:** Add EN/DE keys for star rating labels, MOTN badge text.
- **Tables affected:** Matches (add `starRating`, `matchOfTheNight` attributes)

**Effort:** ~8–12 hours

---

### 2. 📰 News Feed / Activity Timeline

**Problem:** There's no central "what's happening" view. Users must navigate to specific pages (Standings, Championships, Events, Challenges, Promos) to discover recent activity. New results, title changes, challenge responses, and promo activity happen silently — you only see them if you go looking.

**Proposal:** Create a combined activity feed on the home page (currently just Standings) that aggregates recent events across all features into a timeline. Each entry would show a summary card with an icon, timestamp, and link to details.

**Activity types to include:**
- Match results recorded (who won, stipulation, event)
- Championship title changes (new champion crowned)
- Season started/ended
- Tournament results & bracket advancement
- Challenge issued / accepted / completed
- New promos posted
- Fantasy scoring events

**Scope:**
- **Backend:** New `GET /activity` endpoint. No new DynamoDB table needed — this queries existing tables (Matches, ChampionshipHistory, Challenges, Promos, Tournaments, Seasons) sorted by timestamp and merges/sorts them. Paginated with `?limit=` and `?cursor=`. Optionally filter by `?type=match|championship|challenge|promo`.
- **Frontend:** New `ActivityFeed.tsx` component for the home page. Activity cards with type-specific icons (🏆 title change, ⚔️ match result, 🎤 promo, etc.). Infinite scroll or "Load More" pagination. Show as a sidebar widget or full-page timeline depending on screen size. 
- **i18n:** Activity type labels, "X minutes ago" relative timestamps (use i18next `formatRelative`).
- **Tables read:** Matches, ChampionshipHistory, Challenges, Promos, Tournaments, Seasons (all read-only)

**Effort:** ~14–20 hours

---

### 3. 🎲 Rivalry Tracker

**Problem:** Wrestling is built on rivalries, but the app has no way to surface them. Head-to-head comparisons exist in Statistics, but users have to know which two players they want to compare. The system doesn't automatically detect or highlight active rivalries — repeated matchups, back-and-forth title changes, or challenge chains between two players.

**Proposal:** Automatically detect and display active rivalries based on match history. A "rivalry" is defined by configurable thresholds: e.g., two players who've faced each other 3+ times in the current season, or had a challenge chain. Display a "Rivalries" section on the home page or under Statistics with a rivalry card showing:
- Both players with images
- Series record (e.g., "AJ Styles leads 3-2")
- Recent matches in the rivalry
- Any active championship at stake
- "Heating Up 🔥" / "Intense 💥" / "Historic 👑" intensity badges based on match count

**Scope:**
- **Backend:** New `GET /rivalries` endpoint. Analyzes Matches table for repeated pairings, calculates series records. Scores a "rivalry intensity" based on: match count, recency, championship involvement, active challenges between them. Returns sorted list of top rivalries. Could be computed on-demand or cached.
- **Frontend:** New `Rivalries.tsx` page with rivalry cards. Each card is a mini head-to-head with images, records, and intensity badge. Clicking expands to full match history. Optional: "Rivalry of the Week" featured card.
- **i18n:** Rivalry labels, intensity badge text, series record format.
- **Tables read:** Matches, Players, Championships, Challenges (all read-only)

**Effort:** ~12–16 hours

---

### 4. 📊 Dashboard / League Overview Page

**Problem:** The landing page is just the Standings table. There's no at-a-glance overview of the league's current state. A new user or returning visitor can't quickly see: who are the champions, what events are coming up, how long the season has been running, or league-wide stats.

**Proposal:** Replace the default Standings landing with a rich Dashboard page that provides a league "snapshot":
- **Current Champions** strip — show all active championship holders with belt images
- **Upcoming Events** — next 1-3 scheduled events with countdown timers
- **Recent Results** — last 3-5 completed matches (links to event detail)
- **Season Progress** — current season name, start date, match count, visual progress indicator
- **Quick Stats** — most wins this season, longest active win streak, newest champion
- **Active Challenges** — count of pending challenges with a "View All" link
- Standings table remains accessible via sidebar/tab

**Scope:**
- **Backend:** New `GET /dashboard` endpoint that aggregates data from multiple tables in a single call: current champions, upcoming events, recent matches, season info, and quick stats. This avoids the frontend making 5+ separate API calls.
- **Frontend:** New `Dashboard.tsx` page with a responsive card grid layout. Champion strip as horizontal scrollable cards. Event countdown using a lightweight timer. Recent results as compact match cards. Quick stats as big-number callout cards. Reuses existing CSS variables and component patterns.
- **Route change:** `/` renders Dashboard instead of Standings. Standings moves to `/standings` only (it's already there, just need to remove the `/` alias).
- **i18n:** Dashboard section headings, countdown text, "this season" labels.
- **Tables read:** Championships, Events, Matches, Seasons, SeasonStandings, Players, Challenges (all read-only, aggregated in one Lambda)

**Effort:** ~16–22 hours

---

## Improvements to Existing Features

### 1. 🎯 Enhanced Event Detail Page with Pre-Match Predictions

**Current state:** The `EventDetail.tsx` page shows the event match card — participants, match type, stipulation, and result (if completed). It works, but it's static and informational. There's no engagement — users just passively read the card.

**Problem:** For upcoming events, the match card shows scheduled matches but there's no interactivity. Users can't express excitement, make predictions, or engage with the upcoming card. After the event, there's no "I called it!" satisfaction.

**Improvement:**
- Add a public (no-login) prediction system for upcoming event matches. Before an event starts, users can click a wrestler's name/image to cast their prediction for each match.
- Predictions are stored client-side (localStorage) — no backend needed, keeping it lightweight.
- After results are posted, show a "You predicted X/Y correctly!" summary with green/red highlights.
- Show aggregate prediction percentages next to each match ("68% predicted AJ Styles to win").
- Optional: Leaderboard for logged-in users who opt into tracked predictions.

**Scope:**
- **Frontend only** (Phase 1): localStorage-based predictions, no backend. `EventDetail.tsx` gets a "Predict" mode for upcoming events with clickable wrestler cards. `EventResults.tsx` shows prediction accuracy.
- **Backend** (Phase 2, optional): `POST /events/{eventId}/predict` and `GET /events/{eventId}/predictions` for aggregate stats. New `EventPredictions` DynamoDB table.
- **i18n:** "Make Your Picks", "You got X right!", prediction percentage labels.

**Effort:** Phase 1: ~6–8 hours (frontend only). Phase 2: ~8–10 hours (backend persistence).

---

### 2. 🔔 Standings Table: Inline Player Cards with Win Streak Indicators

**Current state:** The `Standings.tsx` table shows rank, player name, W/L/D, and win percentage in a flat table. Player names are plain text with no links or interactivity. There's no visual indicator of hot streaks, cold streaks, or recent form.

**Problem:** The standings table is the most-visited page but provides the least context about player momentum. A player on a 5-match win streak looks identical to one coming off 3 straight losses. There's no way to click a player to see more about them without navigating to stats manually.

**Improvement:**
- **Streak indicators:** Add a "Form" column showing the last 5 match results as colored dots (🟢 win, 🔴 loss, ⚪ draw) — like football/soccer league tables.
- **Win streak badges:** If a player has a current streak of 3+ wins, show a "🔥 3W" badge. For loss streaks of 3+, show a "❄️ 3L" badge.
- **Clickable player names:** Link player names to `/stats/player/:playerId` for detailed stats.
- **Mini hover card:** On desktop, hovering a player name shows a tooltip with their current champion status, division, and last match result.

**Scope:**
- **Backend:** Extend `GET /standings` response to include `recentForm` (array of last 5 match results: W/L/D) and `currentStreak` (object: `{type: 'W'|'L'|'D', count: number}`). This data is computed from the Matches table.
- **Frontend:** Update `Standings.tsx` to render form dots, streak badges, and link player names. Add a `PlayerHoverCard.tsx` component using CSS `position: absolute` tooltips.
- **i18n:** "Form", "Win Streak", "Loss Streak", streak badge text.
- **Tables read:** Matches (additional query for recent form per player)

**Effort:** ~8–12 hours

---

### 3. 🌙 Dark/Light Theme Toggle

**Current state:** The app is exclusively dark-themed (`#0f0f0f` background, light text, gold `#d4af37` accents). There are no theme options. CSS uses a mix of hardcoded hex values and some inconsistent CSS variables.

**Problem:** Some users prefer light themes, especially for daytime use or accessibility reasons. The current hardcoded dark palette makes it difficult to add a theme toggle later. Also, the print styles (partially implemented per the UI/UX review) render poorly because of the dark-only approach.

**Improvement:**
- Implement a CSS custom properties-based theme system with dark (default) and light variants.
- Add a theme toggle button next to the language switcher in the sidebar/topnav.
- Persist theme preference in localStorage.
- Define all colors as CSS variables in `:root` (dark) and `[data-theme="light"]` scopes.
- This also fixes the print styles issue (print can force `data-theme="light"`).

**Scope:**
- **Frontend:** 
  - Create `variables.css` with all color tokens as CSS custom properties for both themes.
  - Refactor hardcoded hex values across all CSS files to use variables (this is a big sweep but mechanical).
  - New `ThemeToggle.tsx` component (sun/moon icon button).
  - Add `useTheme()` hook or context for persisting to localStorage and setting `data-theme` on `<html>`.
  - Update print media query to force light theme.
- **No backend changes needed.**
- **i18n:** "Dark Mode", "Light Mode" toggle labels.

**Effort:** ~10–16 hours (bulk of work is CSS variable migration)

---

## Summary

| # | Type | Feature/Improvement | Effort | Priority |
|---|------|---------------------|--------|----------|
| 1 | 🆕 New | Match of the Night / Star Ratings | 8–12 hrs | High |
| 2 | 🆕 New | News Feed / Activity Timeline | 14–20 hrs | High |
| 3 | 🆕 New | Rivalry Tracker | 12–16 hrs | Medium |
| 4 | 🆕 New | Dashboard / League Overview | 16–22 hrs | High |
| 5 | ✨ Improve | Event Detail Pre-Match Predictions | 6–8 hrs (P1) | Medium |
| 6 | ✨ Improve | Standings: Inline Form & Streaks | 8–12 hrs | High |
| 7 | ✨ Improve | Dark/Light Theme Toggle | 10–16 hrs | Medium |

**Total estimated range:** 74–106 hours

### Suggested Implementation Order

1. **Standings Streaks** (low effort, high visibility — enhances most-visited page)
2. **Match of the Night** (low effort, adds fun factor to events)
3. **Dashboard** (high impact, makes the home page feel alive)
4. **Activity Feed** (complements Dashboard, adds engagement)
5. **Event Predictions** (P1 is frontend-only, quick win)
6. **Rivalry Tracker** (cool factor, builds on match data)
7. **Theme Toggle** (large CSS sweep but valuable for accessibility)
