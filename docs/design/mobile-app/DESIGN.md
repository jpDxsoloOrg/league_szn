# League SZN Mobile — Design System

Mobile app experience for a WWE 2K wrestling league tracker. Dark, premium, sports-broadcast energy. Feels like a native iOS/Android app, not a website.

## Color tokens (use exactly)
- Background: `#0f0f0f` (near-black, whole app)
- Surface / cards: `#1a1a1a`; pressed/hover surface: `#252525`
- Borders / dividers: `#333333` (1px, subtle)
- Primary accent: gold `#d4af37`; pressed gold `#b8941f`; text ON gold is near-black `#1a1a1a`
- Text: primary `#ffffff`, secondary `#bbbbbb`, muted `#666666`
- Status: success/win `#4ade80`, danger/loss `#dc3545` (light variant `#f87171`), warning `#fbbf24`, info `#0ea5e9`, neutral/draw `#6b7280`
- Rivalry heat tiers: Scorching `#ef4444`, Hot `#f97316`, Warm `#fbbf24`, Cold `#60a5fa`, Frozen `#94a3b8`

## Typography
- Headlines & screen titles: Oswald, uppercase, tight letter-spacing — sports broadcast style
- Body, labels, data: Inter
- Big stat numbers may use Oswald

## Core components
- **Bottom tab bar**: fixed, 5 items (icon + tiny label), background `#1a1a1a` with top border `#333`, active item gold `#d4af37`, inactive `#666`. Respect safe-area inset at the bottom.
- **Screen header**: large Oswald title, left-aligned; optional right-side icon buttons (notifications, settings). No hamburger menu.
- **Cards**: `#1a1a1a` surface, 12px radius, 1px `#333` border, 16px padding; lists are stacks of cards, never data tables.
- **Chips/filters**: pill-shaped, horizontally scrollable rows; selected = gold fill with dark text, unselected = `#1a1a1a` with `#333` border.
- **Segmented controls**: rounded container `#1a1a1a`, active segment gold.
- **Primary buttons**: gold fill `#d4af37`, near-black text, 12px radius, bold. Secondary: outlined `#333`. Destructive: `#dc3545`.
- **Badges**: small pills — LIVE badge is red with pulse dot; win/loss badges green/red; heat badges use heat tier colors with a flame icon.
- **FAB**: gold circular floating action button, bottom-right above the tab bar, for admin add actions.
- **Avatars**: circular wrestler photos with a subtle gold ring for champions.
- **Empty states**: centered icon + short message + gold CTA.

## Tone
Content is a video-game wrestling league: wrestlers, championships, rivalries, heat, events. Use realistic sample data (wrestler names, W-L-D records like 12-3-1, win %, star ratings ★★★★). Dense but breathable; 16px screen gutters; app-like, thumb-friendly tap targets (min 44px).
