# Mobile App Designs (Google Stitch)

Exported from Stitch project **"League SZN Mobile"** (project ID `4654349611285922106`, design system asset `4367003443510987202`). Each folder holds `screen.png` (the design, source of truth) and `code.html` (Stitch's generated markup — reference only; implement natively in React).

Implementation plan: [`docs/plans/plan-mobile-app-experience.md`](../../plans/plan-mobile-app-experience.md). Design tokens/component rules: [`DESIGN.md`](DESIGN.md).

## User screens (bottom tab bar: Home · Standings · Rivalries · Profile · More)

| Folder | Screen |
|---|---|
| `league-szn-home-dashboard` | Dashboard (Home tab) — champion carousel, live/upcoming events, quick stats, recent results, season ring |
| `league-standings` | Standings — filter chips, ranked player cards with form dots, streak, OVR |
| `rivalries-hub` | Rivalries hub — segments, heat filter chips, VS cards with heat meters, activity feed |
| `rivalry-detail-danny-b-vs-marcus-rivera` | Rivalry detail — heat meter hero, tab strip, overview cards |
| `my-profile` | Profile — header card, stats, editable rows, alignment pills, division transfer |
| `league-szn-more-menu` | More — grouped feature list, pinned Admin Panel row, language + logout |
| `championships` | Championships — belt cards with current champions, vacant state |
| `league-szn-events` | Events — upcoming/past segments, date-block cards, LIVE state, past variant |
| `league-szn-matches` | Matches — search, filter chips, completed/scheduled match cards |

## Admin screens (hub + reusable templates)

| Folder | Screen |
|---|---|
| `admin-panel-hub` | Admin hub — all ~28 sections in 6 groups, Danger Zone in red |
| `manage-players-admin` | List-manage **template** (styled as Manage Players) — search, row actions, FAB, bottom-sheet edit |
| `schedule-match-admin` | Full-screen form **template** (styled as Schedule Match) — field cards, sticky save bar |
| `match-card-builder-admin` | Match Card Builder — drag-to-reorder card list, MAIN EVENT highlight, publish bar |
| `danger-zone-admin-panel` | Danger Zone — red theme, hold-to-confirm, type-DELETE modal |

`_generated-images/` holds standalone hero images Stitch generated for the dashboard (belt, champion portrait).
