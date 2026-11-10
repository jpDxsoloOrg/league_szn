# League SZN alternative look: "Ringside Booker"

A second skin for the Main Event Arena redesign (`docs/design/site-redesign/DESIGN.md`), built so the two can be compared side by side.
Same pages, navigation, components and behaviour. Only the visual layer differs: a booking-desk readout instead of a pay-per-view poster.

## Tokens
- Background `#0a0d13`, surface `#111620`, raised surface `#19202d`, hairline `rgba(150,172,210,.18)`
- Text `#f1f4f9`, secondary `#b8c1d2`, muted `#919db3`
- Signal red `#ff4d2e` (primary action, selected state, near-black text on it), cyan `#1fd5f9` (links, secondary action, focus), title gold `#f2c230`
- Status: win `#3ddc97`, loss `#ff6b6b`, draw `#919db3`, warning `#f2c230`
- Radius 2px everywhere. Avatars are square.
- Fonts: Barlow Condensed (headings, buttons; uppercase italic), Chakra Petch (small uppercase labels: nav, tabs, badges, table heads), Inter (body).

The token names in `frontend/src/variables.css` are unchanged from Main Event Arena, so `--color-pink` and `--color-violet` hold the signal-red family and `--color-magenta` holds gold.

## Patterns
- Cards carry a 3px accent bar on the left in the section colour: red for Home and Events, cyan for Rankings and Me, gold for Storylines.
- Page headers and heroes are dark panels with faint diagonal hatching and a 4px accent bar, not gradient bands.
- Buttons are slanted plates. Primary is signal red, secondary is outlined cyan.
- The number one podium slot is framed in title gold.
- The wordmark is set in type: a red "SZN" plate and the name.

## Rules carried over
Touch targets at least 44px, visible focus rings, reduced motion respected, colours from tokens only.
