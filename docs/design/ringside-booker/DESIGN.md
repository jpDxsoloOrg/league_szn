# League SZN alternative look: "Ringside Booker"

A second skin for the Main Event Arena redesign (`docs/design/site-redesign/DESIGN.md`), built so the two can be compared side by side.
Same pages, URLs and behaviour. The frame around them is different: a booking desk with a navigation rail, a status bar and a news crawl, instead of a pay-per-view poster under a top nav.

## Tokens
- Background `#0a0d13`, surface `#111620`, raised surface `#19202d`, hairline `rgba(150,172,210,.18)`
- Text `#f1f4f9`, secondary `#b8c1d2`, muted `#919db3`
- Signal red `#ff4d2e` (primary action, selected state, near-black text on it), cyan `#1fd5f9` (links, secondary action, focus), title gold `#f2c230`
- Status: win `#3ddc97`, loss `#ff6b6b`, draw `#919db3`, warning `#f2c230`
- Radius 2px everywhere. Avatars are square.
- Fonts: Barlow Condensed (headings, buttons; uppercase italic), Chakra Petch (small uppercase labels: nav, tabs, badges, table heads), Inter (body).

The token names in `frontend/src/variables.css` are unchanged from Main Event Arena, so `--color-pink` and `--color-violet` hold the signal-red family and `--color-magenta` holds gold.

## Shell
- Desktop: a fixed sidebar on the left lists every section with its pages under it (`ShellSidebar`), so the secondary tab row is gone. Third-level tabs (Stats) still sit under the top bar.
- Top bar (`ShellHeader`): "SECTION // PAGE", then a status strip with the season, the next show and a live flag, then search, bell, language, help and Sign In for guests.
- Ticker (`LeagueTicker`, built on `ui/Ticker`): docked along the bottom, above the tab bar on phones. Headlines are the live and next show, the latest news, recent results and current champions, each linking to its page. It pauses on hover, on focus and from its button, and does not crawl with reduced motion. Hidden in Admin.
- Phones keep the slim header, the scrolling tab row and the bottom tab bar.
- The status strip and the ticker share one deferred request (`useLeaguePulse`) and show nothing until the API answers. No sample data.

## News
- Home > News (`/news`, `/news/:id`): the newest story leads, the rest follow as cards.
- Stories are the active announcements staff publish in Admin > Announcements. Priority 3 is flagged "Breaking".

## Patterns
- Cards carry a 3px accent bar on the left in the section colour: red for Home and Events, cyan for Rankings and Me, gold for Storylines.
- Page headers and heroes are dark panels with faint diagonal hatching and a 4px accent bar, not gradient bands.
- Buttons are slanted plates. Primary is signal red, secondary is outlined cyan.
- The number one podium slot is framed in title gold.
- The wordmark is set in type: a red "SZN" plate and the name.

## Rules carried over
Touch targets at least 44px, visible focus rings, reduced motion respected, colours from tokens only.

## Installable app
- The PWA from `feat/pwa` is carried on this branch: manifest, service worker, offline page and the Install row in Me.
- Theme and offline-page colours match this look. The app icon is still the violet "S" from Main Event Arena.
- The sidebar, top bar and ticker pad for the status bar, side notch and home indicator when installed.
