# UI components

Shared building blocks for the Main Event Arena redesign. Design rules live in
`docs/design/site-redesign/DESIGN.md`; tokens live in `src/variables.css`.

## Rules

- Import each component from its own file, such as `import Button from '../ui/Button'`.
  There is no barrel, because a barrel would pull Radix and Embla into every route chunk.
- Colours come from tokens. No hex values in component CSS.
- Icons come from `lucide-react`. Give decorative icons `aria-hidden="true"`.
- Page titles use `PageHeader`, which renders the page's only `h1`.
- `.App` carries `data-section` from `getSectionTheme`. `variables.css` turns that into `--section-band`
  (the `PageHeader` gradient), `--section-accent` (underlines and active nav) and a slight surface tint. Admin
  pages are `data-section="admin"` and have no band. Text on a band stays AA at every stop: check any new one.
- One selected language: section rows use an underline in `--section-accent`, and every in-page tab, third-level
  row and filter pill uses `--color-selected` with `--color-on-selected`. Sideways-scrolling rows use
  `useScrollFade` for the edge fade.

## Components

| Component | Use it for | Key props |
|---|---|---|
| `Button` | Actions and link-buttons | `variant` (`primary`, `secondary`, `ghost`, `danger`, `hero`), `size`, `icon`, `loading`, `fullWidth`, `to` |
| `Card` | A surface. Do not nest cards | `variant` (`default`, `raised`, `plain`), `padding`, `to` |
| `Modal` | Dialogs. Focus trap, Escape and focus return are built in | `open`, `onClose`, `title`, `description`, `size`, `footer`, `hideTitle` |
| `Tabs` | In-page tabs that do not change the URL | `items`, `value`, `onValueChange`, `label` |
| `SectionTabs` | Tabs that navigate between routes | `items`, `label`, `activeTo`, `variant` |
| `Badge` | Status pills. `live` is the only toned badge with a glow | `tone`, `icon` |
| `Avatar` | Player images, with initials as a fallback | `src`, `name`, `size`, `ring` |
| `PageHeader` | Title block with an actions slot | `title`, `eyebrow`, `subtitle`, `actions` |
| `DataTable` | Tables. Become stacked cards on phones, with a sort Select in place of the headers | `columns`, `rows`, `rowKey`, `caption`, `density`, `loading`, `empty` |
| `EmptyState` | No-data panels | `title`, `description`, `icon`, `actionLabel`, `onAction` |
| `Skeleton` | Loading placeholders | `variant` (`table`, `cards`, `calendar`, `block`), `count` |
| `Select` | Dropdowns. `''` is a valid option value, for "All" filters | `value`, `onValueChange`, `options`, `label`, `placeholder` |
| `Podium` | Top three, shown 2-1-3 | `entries`, `label` |
| `PhotoTile` | Portrait photo cards with a title rim light. No photo gives a colour wash with initials | `imageUrl`, `title`, `eyebrow`, `meta`, `accent`, `badge`, `fallbackIcon`, `to` |
| `FormDots` | Recent results | `results` (oldest to newest) |
| `SwipeRow` | Swipeable tile rows. Set `--swipe-row-slide` to size slides | `label`, `children` |
| `ToastProvider`, `useToast` | Short confirmations. The provider is already mounted in `App` | `showToast(message, tone)` |

## Examples

```tsx
<PageHeader
  eyebrow={t('standings.eyebrow')}
  title={t('standings.title')}
  actions={<Select label={t('standings.season')} value={seasonId} onValueChange={setSeasonId} options={seasonOptions} />}
/>

<SwipeRow label={t('dashboard.champions')}>
  {champions.map((champion) => (
    <PhotoTile key={champion.id} title={champion.name} eyebrow={champion.title} accent="world" imageUrl={champion.imageUrl} to="/championships" />
  ))}
</SwipeRow>

<DataTable
  caption={t('standings.title')}
  rows={players}
  rowKey={(player) => player.playerId}
  columns={[
    { key: 'name', header: t('standings.wrestler'), render: (player) => player.name, sortValue: (player) => player.name },
    { key: 'form', header: t('standings.last5'), render: (player) => <FormDots results={player.recentForm ?? []} />, hideOnMobile: true },
  ]}
/>
```

## Related helpers

- `hooks/useIsMobile` returns true at the shell's 768px breakpoint.
- `utils/sanitizeHtml` cleans stored HTML before `dangerouslySetInnerHTML`. It keeps inline
  `style` attributes and `<video>`, which announcements rely on.
- `config/navConfig` is the navigation registry. Add pages there, not in a component.
- `isApiError(err, 404)` from `services/api` checks a failed request's HTTP status.
- `fetchWithAuth` retries GETs twice on 429, 500, 502 and 503 with jittered backoff. Writes are never retried.
- `useDocumentTitle` overrides the route title that `App` sets from `getPageInfo`.
- `playersApi.getDirectory()` resolves names for all players, including those with no wrestler.
  `playersApi.getAllIncludingHidden()` is the staff roster. Pass it through `pickablePlayers` in
  `utils/pickablePlayers` before filling a picker: hidden players stay out unless already on the record.
