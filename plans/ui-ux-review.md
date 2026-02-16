# UI/UX Review — League SZN

Comprehensive review of the frontend UI/UX based on code analysis of all major components, CSS, routing, and layout structure. Organized by severity/impact.

---

## 🔴 High Priority — User Flow Pain Points

### 1. No Loading Skeletons — Jarring Content Shifts
**Affected:** Every data-fetching page (Standings, Championships, Tournaments, Events, Stats, etc.)

All pages show a bare text string like `"Loading..."` centered on a blank dark screen while data loads. This causes a jarring flash when content pops in. Users see nothing to indicate what _will_ appear.

**Suggestion:** Replace plain-text loading states with skeleton placeholder components that mirror the layout of the actual content (e.g. skeleton table rows for Standings, skeleton cards for Championships). This gives users spatial context and a feeling of speed.

---

### 2. No 404 / Catch-All Route
**Affected:** `App.tsx` routing

There is no `<Route path="*" ...>` catch-all. Navigating to a non-existent URL (e.g. `/asdf`) renders a blank `<main>` with no feedback. Users see an empty dark page and have no way to recover.

**Suggestion:** Add a `NotFound` component with a friendly message, a link back to the home page, and possibly a search or sitemap.

---

### 3. Championship History Modal Has No Backdrop Click-to-Close
**Affected:** `Championships.tsx`

The history modal renders a `<div className="history-modal">` as the backdrop, but there's no `onClick` handler on it to close. Users must find the `×` button. This is non-standard — users expect clicking outside a modal to dismiss it.

**Suggestion:** Add `onClick` on the backdrop overlay (with `stopPropagation` on the inner content) and also close on `Escape` key press.

---

### 4. Auth Pages Not Internationalized
**Affected:** `Login.tsx`, `Signup.tsx`

All auth page text is hardcoded in English: "Sign In", "Email", "Password", "Don't have an account?", etc. The rest of the app supports i18n (EN/DE). This is a broken experience for German-speaking users.

**Suggestion:** Replace all hardcoded strings with `t()` calls using existing i18n keys or add new ones under `auth.*`.

---

### 5. Empty States Lack Personality and Guidance
**Affected:** Standings, Championships, Tournaments, Events, and other pages

Empty states just show text like "No players found" or "No championships." with no visual treatment, no icon, no suggested action. For a new league with no data yet, every page feels broken.

**Suggestion:** Design empty state components with an illustration/icon, descriptive text, and a call-to-action button (e.g. "Create your first championship" for admins, "Check back soon" for public users).

---

## 🟡 Medium Priority — Visual & Interaction Issues

### 6. Inconsistent Color Systems Between Components
**Affected:** `App.css`, `Auth.css`, component-specific CSS

- `App.css` uses `#d4af37` (gold) as the primary accent and `#0f0f0f` as background.
- `Auth.css` uses CSS custom properties (`var(--accent-color, #e50914)` — red!) and `var(--card-bg, #1a1a2e)` which are never defined globally. The login page has a completely different accent color (Netflix red) from the rest of the app (gold).
- Some components use hardcoded hex values, others use partial CSS variables.

**Suggestion:** Establish a global CSS custom property design system in `index.css` or a `variables.css` file. Define `--color-primary`, `--color-bg`, `--color-surface`, `--color-text`, etc. and use them consistently everywhere.

---

### 7. No Visual Feedback on Interactive Table Rows
**Affected:** Standings, Championship History, Tournament Standings

Table rows highlight on hover (`tr:hover { background: #1a1a1a }`), but there's no indication they're clickable — and they aren't actually clickable. The standings table shows player data but there's no way to click a player to see their profile or stats. This is a missed opportunity for discovery.

**Suggestion:** Make player names in the standings table link to `/stats/player/:playerId`. Add a subtle cursor pointer and hover underline to signal interactivity.

---

### 8. Division Filter Duplicated CSS
**Affected:** `Standings.css`, `Championships.css`

The `.division-filter` styles are copy-pasted identically between these two files. If a third page adds division filtering, it'll need another copy.

**Suggestion:** Extract the division filter into a shared component with its own CSS file.

---

### 9. Calendar Events Not Clickable
**Affected:** `EventsCalendar.tsx`

Calendar event dots have a `cursor: pointer` and hover scale animation, but no `onClick` handler. Users see what looks like an interactive element but nothing happens when clicked.

**Suggestion:** Make event dots link to `/events/:eventId` or show a small tooltip/popover with event details on click.

---

### 10. TopNav Dropdown Closes on Blur with setTimeout Hack
**Affected:** `TopNav.tsx` line 274

```jsx
onBlur={() => setTimeout(closeDropdown, 150)}
```

This 150ms timeout is a fragile workaround. It can cause dropdowns to flash closed and reopen, or fail to close in edge cases. It also means keyboard navigation is unreliable.

**Suggestion:** Use a proper focus-management approach: wrap the dropdown in a container and use `onFocusOut` with `relatedTarget` checking, or use a click-outside listener via `useEffect` with a ref.

---

### 11. Sidebar Takes 300px Fixed Width — Content Feels Cramped on Medium Screens
**Affected:** `App.css`, `Sidebar.css`

The sidebar is 300px wide and the main content area has a hard `margin-left: 300px`. On a 1024px-wide screen, that leaves only 700px for content (minus padding). Tables with many columns (Standings has 8-9 columns) overflow horizontally.

**Suggestion:** Consider reducing sidebar to 240-260px, or making it collapsible to an icon-only rail on medium screens (1024-1280px range).

---

### 12. No Breadcrumb or Back Navigation on Detail Pages
**Affected:** Event Detail, Challenge Detail, Promo Thread, Player Stats

When a user navigates to `/events/:eventId` or `/challenges/:challengeId`, there's no breadcrumb or "← Back to Events" link. The only way back is the browser back button or the sidebar/topnav.

**Suggestion:** Add a simple breadcrumb or back-link component at the top of detail pages.

---

## 🟢 Lower Priority — Polish & Enhancement

### 13. No Page Transition Animations
**Affected:** All route changes

Route transitions are instantaneous swaps. The content just appears/disappears with no transition. This feels abrupt, especially with the loading flash issue.

**Suggestion:** Add subtle fade-in transitions on page mount using CSS `@keyframes` or `React.lazy` with `Suspense`.

---

### 14. Buttons Use Global Styles — No Variant System
**Affected:** `App.css` global `button` styles

Every `<button>` in the app gets the gold background by default. Components that need different button styles (auth, modals, filters) must fight these global styles with overrides and `!important`. This is fragile.

**Suggestion:** Remove the global `button` styling. Create explicit button classes: `.btn-primary` (gold), `.btn-secondary` (outline), `.btn-danger` (red), `.btn-ghost` (transparent).

---

### 15. Language Switcher Text Not Translated
**Affected:** `LanguageSwitcher.tsx`

Text like "Sign In" and "Sign Up" in the TopNav is hardcoded in English even outside the auth forms (TopNav lines 248-249, 383-384).

**Suggestion:** Use `t('common.signIn')` and `t('common.signUp')` translation keys.

---

### 16. ErrorBoundary Not Internationalized
**Affected:** `ErrorBoundary.tsx`

"Something went wrong" and "Reload Page" are hardcoded English. Since ErrorBoundary is a class component, it can't use `useTranslation()` directly.

**Suggestion:** Use the `i18n` instance directly (import and call `i18n.t()`) or wrap the fallback UI in a functional component that uses the hook.

---

### 17. No Scroll-to-Top on Route Change
**Affected:** All route navigation

When navigating between pages, the scroll position is retained from the previous page. If a user scrolls to the bottom of Standings and then navigates to Championships, they start mid-page.

**Suggestion:** Add a `ScrollToTop` component that calls `window.scrollTo(0, 0)` on route changes.

---

### 18. Print Styles Only Partially Implemented
**Affected:** `App.css` `@media print`

Print styles hide the navigation but don't adjust content widths, table styles, or colors for printing. Printing a standings table would show white text on a white background.

**Suggestion:** Add print-specific overrides: set background to white, text to black, remove decorative borders, and ensure tables fit the page width.

---

### 19. No Favicon or Site Title Branding
**Affected:** `index.html`

The page title and favicon likely still use Vite defaults. The browser tab doesn't reinforce the "League SZN" brand.

**Suggestion:** Add a custom favicon and set `<title>League SZN</title>` with dynamic page-specific titles using a `useDocumentTitle` hook or `react-helmet`.

---

### 20. TopBar Component Purpose Unclear
**Affected:** `TopBar.tsx`

The TopBar is only shown in sidebar mode and appears to just be a thin bar at the top. Its purpose overlaps with the sidebar header. Having two simultaneous top-level UI elements (sidebar header + TopBar) is potentially confusing.

**Suggestion:** Evaluate if TopBar is needed or if its functionality can be folded into the Sidebar header.

---

## Summary of Suggested Changes by Priority

| Priority | Item | Effort |
|----------|------|--------|
| 🔴 High | Loading skeletons | Medium |
| 🔴 High | 404 catch-all route | Low |
| 🔴 High | Modal backdrop click-to-close + Escape | Low |
| 🔴 High | Auth page i18n | Low |
| 🔴 High | Empty state components | Medium |
| 🟡 Medium | CSS custom property design system | Medium |
| 🟡 Medium | Clickable player names in standings | Low |
| 🟡 Medium | Extract shared division filter component | Low |
| 🟡 Medium | Calendar event dots clickable | Low |
| 🟡 Medium | Fix TopNav dropdown focus management | Medium |
| 🟡 Medium | Sidebar width / collapsible | Medium |
| 🟡 Medium | Breadcrumbs on detail pages | Low |
| 🟢 Low | Page transition animations | Low |
| 🟢 Low | Button variant system | Medium |
| 🟢 Low | TopNav auth text i18n | Low |
| 🟢 Low | ErrorBoundary i18n | Low |
| 🟢 Low | Scroll-to-top on route change | Low |
| 🟢 Low | Print styles | Low |
| 🟢 Low | Favicon + dynamic titles | Low |
| 🟢 Low | Evaluate TopBar necessity | Low |
