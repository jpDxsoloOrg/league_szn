# League SZN site redesign: "Main Event Arena"

Pay-per-view night in an arena. Flashy, but one obvious focus per screen and easy to navigate.
Blend of the Stitch directions "Main Event" (violet base, gradients, top nav, podium) and "Arena Lights" (photo-led tiles, spotlight hero, pink and cyan glow).

## Tokens
- Background `#0d0a1a`, raised surface `#17112b`, higher surface `#211939`, hairline `rgba(255,255,255,.10)`
- Text `#f6f3ff`, secondary `#c9c2dc`, muted `#a49cbb` (never below 4.5:1 on the background)
- Primary violet `#7c3aed`, hot pink `#ff2e63`, cyan `#22d3ee` (primary action, near-black text on it)
- Hero gradient: violet to magenta `#7c3aed -> #d946ef`
- Status: win `#34d399`, loss `#fb7185`, draw `#a49cbb`, warning `#fbbf24`
- Title rim lights: world gold `#fbbf24`, US cyan `#22d3ee`, IC emerald `#34d399`, tag magenta `#e879f9`
- Radius 12px cards, 999px pills. Fonts: Sora headings, Inter body. Body text at least 16px on mobile, 15px dense admin tables.

## Rules
- Glow only on live and active items. Gradients only on hero areas and primary emphasis. No gold-on-everything.
- No boxes inside boxes. Public tables stay at about 6 columns; extra data goes in a detail view.
- Touch targets at least 44px. Visible focus rings. Respect prefers-reduced-motion.
- Colours come from tokens only; no hex values in component CSS. CSS files or modules, no inline styles.

## Key patterns
- Home leads with tonight's show (or next event), then swipeable champion photo tiles, latest results, top of the table.
- Standings: top-3 podium, then a clean list. Mobile: compact podium, then rows with record and form dots.
- Site-wide search in the top bar.

## Navigation
Five sections, same on desktop and mobile: Home, Events, Rankings, Storylines, Me. Admin is a role-gated sixth item on desktop and a row in Me on mobile.
All existing URLs stay. Each section renders secondary tabs from navConfig. Desktop uses a top nav; mobile keeps the fixed bottom tab bar and card lists.

Mockups are reference only. Their photos and small labels are generated and must not ship.
