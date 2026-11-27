# Plan: Episodes section (YouTube full episodes + self-hosted highlight packages)

Branch: `feat/episodes`. Owner request: an Episodes section where the league host's YouTube
videos are linked (so plays still count as YouTube views), plus highlight packages that stay
hosted on the site.

## 0. Decisions (fixed by the owner, restated)

1. A full episode is a YouTube video. It shows as a thumbnail card; a click swaps in a
   `youtube-nocookie.com` iframe in place (click-to-load facade). A "Watch on YouTube" link
   always sits beside it. Embedded plays count toward YouTube views.
2. Staff add an episode by pasting a YouTube URL. Title and thumbnail come from YouTube oEmbed,
   fetched **server-side** (no API key, no CORS issue, no CSP `connect-src` change). A `source`
   field leaves room for playlists later; playlists are **not** built now.
3. The existing Highlights (Videos table, `/highlights`, admin Videos tool, S3 + CloudFront
   `/videos/*`) fold into one Episodes section with **Full Episodes** and **Highlights** tabs.
   A highlight can link to one episode; the episode page lists its highlights. `/highlights`
   redirects into the section. Upload path is unchanged. Linking has **one direction only**: the
   highlight carries `episodeId`, set from the Manage Highlights (ManageVideos) form. The episode
   form has no highlight picker.
4. An episode can optionally link to a league Event. The episode page then shows that event's
   card/results; the event page gets a "Watch the episode" button. Episodes without an event work.

## 1. Data model

### Decision: new `Episodes` table; highlights stay in `Videos` with an optional `episodeId`

Reasons (verified in code):
- Putting YouTube rows into Videos would leak them into `GET /videos` / `listPublished()`
  (`DynamoContentRepository.ts` ~:182, category filter is applied after the query), into the
  self-service `POST /admin/videos` (wrestlers with `canUploadVideos` could create episode rows),
  and into the `category` enum checks (`createVideo.ts:50`, `updateVideo.ts:36`) and the
  required `videoUrl`. Every one of those needs a guard; a new table needs none.
- The `/videos` and `/admin/videos` routes are pinned by `legacyParity.test.ts` /
  `legacyGatewayRoutes.json`; keeping Videos as-is means zero fixture changes.
- Episodes want `airDate` ordering and an event lookup index; Videos' `PublishedIndex` is keyed on
  `createdAt`.
- Cost: one table (goes to the Overflow stack via `stacks-map.js`), one env var (~50 B of the
  ~3.1 KB/4 KB env budget), two IAM ARNs (~160 B of the ~6.2 KB/10 KB inline policy). Fits.

### Episodes table (new)

`serverless.yml` resource `EpisodesTable`:
- `TableName: ${self:provider.environment.EPISODES_TABLE}` where env
  `EPISODES_TABLE: ${self:service}-episodes-${self:provider.stage}` (add next to `VIDEOS_TABLE`, ~:53).
- `DeletionPolicy: Retain`, `UpdateReplacePolicy: Retain`, `DeletionProtectionEnabled: true`,
  `PointInTimeRecoveryEnabled: true` (these protections are enforced by
  `lib/__tests__/serverlessConfig.test.ts`), and `BillingMode: PAY_PER_REQUEST` (project
  convention; no test checks it).
- Key: `episodeId` (S, HASH).
- GSIs (both `ProjectionType: ALL`):
  - `PublishedIndex`: HASH `isPublished` (S, `'true'|'false'`), RANGE `airDate` (S, ISO date).
  - `EventIndex`: HASH `eventId` (S). Sparse: rows without `eventId` are not indexed.
- IAM: add `arn:...:table/${self:provider.environment.EPISODES_TABLE}` and `.../index/*` to the
  single DynamoDB statement (~:100-205). Check afterwards with `simulate-principal-policy`
  against the Lambda role (see memory note "Lambda role IAM check").
- `backend/lib/dynamodb.ts` `TableNames`: `EPISODES: process.env.EPISODES_TABLE!` (follow the
  existing entry style).

Backend type (`backend/lib/repositories/types.ts`, next to `Video`):

```ts
export type EpisodeSource = 'youtube'; // widen later, e.g. 'youtube-playlist'

export interface Episode {
  episodeId: string;           // uuid
  source: EpisodeSource;       // always 'youtube' now
  youtubeVideoId: string;      // 11 chars, [A-Za-z0-9_-]
  title: string;               // from oEmbed, editable
  description: string;         // staff text, '' default; plain text, never HTML
  thumbnailUrl: string;        // https://i.ytimg.com/vi/<id>/hqdefault.jpg (built from the id)
  channelName?: string;        // oEmbed author_name
  airDate: string;             // YYYY-MM-DD; staff-set (oEmbed has no publish date); default today
  eventId?: string;            // optional LeagueEvent link (no seasonId copy: nothing reads it)
  isPublished: string;         // 'true' | 'false' (GSI key), same convention as Video
  createdBy: string;           // caller sub; stripped from public responses
  createdAt: string;
  updatedAt: string;
}
```

Store the YouTube **id**, not the URL. Build watch/embed/thumbnail URLs from the id everywhere.
Always build `thumbnailUrl` from the id (`hqdefault.jpg`, which always exists) rather than trusting
oEmbed's `thumbnail_url`, so `img-src` only ever needs `i.ytimg.com`.

### Videos table change

- `Video` gains `episodeId?: string`. `VideoCreateInput` and `VideoPatch` gain `episodeId?: string`
  (patch: `string | null`, null removes the attribute).
- No new GSI on Videos. "Highlights for episode X" = `listPublished()` filtered in memory by
  `episodeId` (current volume is ~11 rows). A sparse `EpisodeIndex` GSI can be added later in place.
- **Migration/backfill: none.** `episodeId` is optional; the 11 existing prod videos keep working
  and show under the Highlights tab unlinked. Staff link them by hand in the admin form afterwards.
  **This depends on the `isPublished` fix in §2.0**: today editing a draft in ManageVideos
  publishes it, so the fix must land before (or with) the episode picker.

### Event link

Single source of truth: `eventId` lives **only on the episode**. `LeagueEvent` is not changed, so
there is nothing to keep in sync and `updateEvent.ts` / `EventPatch` are untouched. The event page
looks up its episode with `GET /episodes?eventId=` (served by `EventIndex`). At most one
**published** episode per event is shown (newest `airDate` wins if staff link several).

Dangling links: `deleteEvent.ts` does not cascade. The episode page treats a missing event (404)
as "no event" and hides the section; the admin list shows a "linked event missing" badge,
computed client-side from the `eventsApi.getAll()` list the form already loads (no per-row
server lookup). No cascade is added (non-goal).

## 2. Backend

### 2.0 Pre-existing bug fix first: `Video.isPublished` string/boolean mismatch

Verified: the backend stores `Video.isPublished` as `'true'|'false'`
(`DynamoContentRepository.ts:204`), the frontend types it as `boolean`
(`frontend/src/types/index.ts:677`). `ManageVideos.tsx` `handleEdit` (:164) copies the string
`'false'` into the form, the checkbox (:349) renders checked, the save (:134) sends `'false'`,
`updateVideo.ts` passes the body straight to `videos.update`, and the repo's
`patch.isPublished ? 'true' : 'false'` (:221) turns the truthy string into `'true'`. So editing
any draft publishes it. The badges at `ManageVideos.tsx:256` and `MyVideos.tsx:297` show
"Published" for every draft. Linking highlights to episodes (via that same form) would make
wrestler-submitted drafts public, so fix it first, as its own commit:
- Backend: `createVideo.ts` / `updateVideo.ts` return `badRequest('isPublished must be a boolean')`
  when `isPublished` is present and not `typeof === 'boolean'`. Both repos (Dynamo :221 and
  in-memory) compare strictly: `patch.isPublished === true ? 'true' : 'false'` (and the same in
  `create`: `input.isPublished === false ? 'false' : 'true'` is already strict).
- Frontend: normalise at the API boundary. In `videos.api.ts`, map every returned `Video`
  through `normalizeVideo` (`isPublished: raw.isPublished === true || raw.isPublished === 'true'`),
  with the raw response typed as `Omit<Video, 'isPublished'> & { isPublished: boolean | 'true' | 'false' }`.
  `Video.isPublished` stays `boolean`, so `ManageVideos`, `MyVideos` and `Highlights` need no
  type changes and their badges and checkbox become correct.
- `episodes.api.ts` (§4.1) uses the same normaliser pattern from the start; frontend `Episode`
  has `isPublished: boolean`.
- Tests: `updateVideo.test.ts` rejects `isPublished: 'false'` with 400 and keeps a draft a draft
  when `isPublished: false` is sent; `videos.api` test (or `ManageVideos.test.tsx`) proves that
  editing a draft row and saving sends `isPublished: false` and the badge reads "Draft".

### 2.1 Repository

Put episodes on `ContentRepository` (same aggregate family as videos; avoids widening
`Repositories` / `registry.ts`):

`backend/lib/repositories/ContentRepository.ts`:
```ts
export interface EpisodeCreateInput {
  youtubeVideoId: string; title: string; description?: string; thumbnailUrl: string;
  channelName?: string; airDate: string; eventId?: string;
  isPublished?: boolean; createdBy: string;
}
export interface EpisodePatch {
  title?: string; description?: string; airDate?: string;
  eventId?: string | null;   // null = remove
  isPublished?: boolean;
  youtubeVideoId?: string; thumbnailUrl?: string; channelName?: string;
}
// in ContentRepository:
episodes: CrudRepository<Episode, EpisodeCreateInput, EpisodePatch> & {
  listPublished(): Promise<Episode[]>;            // PublishedIndex, airDate desc
  listByEvent(eventId: string): Promise<Episode[]>; // EventIndex
  findByYoutubeId(youtubeVideoId: string): Promise<Episode | null>; // duplicate check (scan+filter ok)
};
```
- `create` defaults `isPublished` to **false** (draft first; staff publish explicitly), `source`
  to `'youtube'`.
- Dynamo impl in `dynamo/DynamoContentRepository.ts` (copy the videos block ~:159-248;
  `update` with `ConditionExpression: attribute_exists(episodeId)`). Wire at the `content`
  factory (~:651).
  - **Null removal needs hand-written REMOVE.** `buildUpdateExpression` (`dynamo/util.ts`) only
    emits `SET` and would write `eventId = NULL`, which DynamoDB rejects on a GSI key
    (`EventIndex` HASH `eventId`) and which, for `Videos.episodeId`, would leave a NULL attribute.
    So `episodes.update` must leave `eventId` out of the util input when it is `null` and append
    `' REMOVE eventId'` to the returned `UpdateExpression`, following the `expiresAt` pattern at
    `DynamoContentRepository.ts:129-132`. `videos.update` does the same for `episodeId: null`.
    Note the util always SETs `updatedAt`, so a patch whose only field is `null` still produces a
    valid `SET ... REMOVE ...` expression.
- In-memory impl in `inMemory/InMemoryContentRepository.ts` (copy ~:170-236, wire ~:451);
  `null` deletes the property (`delete row.eventId`).
- Videos repos (both): accept/persist `episodeId`, support `null` removal in `update` as above.
- Optional but recommended: add Episodes to `dynamo/adminOps.ts` export/clear and
  `functions/admin/dataTransferConfig.ts` **only if** Videos is added there too; otherwise skip
  (Videos is not there today; stay consistent).
- `backend/scripts/create-tables.ts`: skip (Videos is not there either).

Tests: `lib/repositories/__tests__/episodes.test.ts` against the in-memory driver
(create defaults, listPublished order by airDate desc and excludes drafts, listByEvent,
patch with null removes `eventId` (`'eventId' in row` is false afterwards), findByYoutubeId;
videos patch with `episodeId: null` removes it). Plus a Dynamo-level unit test with a mocked
`dynamoDb.update` (same style as existing Dynamo repo tests) asserting that
`episodes.update(id, { eventId: null })` sends an `UpdateExpression` containing `REMOVE eventId`
and no `:eventId` value, and the same for `videos.update(id, { episodeId: null })`.

### 2.2 YouTube helpers (`backend/lib/youtube.ts`, new, pure + one fetch)

```ts
export const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
export function parseYoutubeVideoId(input: string): string | null;
export function youtubeWatchUrl(id: string): string;      // https://www.youtube.com/watch?v=<id>
export function youtubeThumbnailUrl(id: string): string;  // https://i.ytimg.com/vi/<id>/hqdefault.jpg
export interface YoutubeOEmbed { title: string; channelName?: string }
export async function fetchYoutubeOEmbed(id: string, timeoutMs?: number): Promise<YoutubeOEmbed | null>;
```

`parseYoutubeVideoId` (use `new URL()` in try/catch; never regex the whole URL):
- Trim. A bare 11-char id matching `YOUTUBE_ID_RE` is accepted.
- Prepend `https://` if there is no scheme. Protocol must be `http:`/`https:`.
- Host (lowercased, strip a leading `www.` / `m.` / `music.`):
  - `youtube.com`, `youtube-nocookie.com`:
    - `/watch` → `searchParams.get('v')`
    - `/shorts/<id>`, `/embed/<id>`, `/live/<id>`, `/v/<id>` → path segment 2
  - `youtu.be` → path segment 1
- Ignore extra params (`t`, `si`, `list`, `feature`). Return the id only if it matches
  `YOUTUBE_ID_RE`; anything else (other hosts, `/playlist?list=` with no `v`, channel URLs) → `null`.

`fetchYoutubeOEmbed`:
- `GET https://www.youtube.com/oembed?url=<encodeURIComponent(watchUrl)>&format=json` with global
  `fetch` (Node 20 runtime; no new dependency) and `signal: AbortSignal.timeout(timeoutMs ?? 4000)`.
- On non-2xx (401/403 = embedding disabled or private, 404 = not found), network error, timeout or
  unexpected JSON shape → `console.warn` and return `null`. Narrow the JSON from `unknown`
  (`typeof body.title === 'string'`); no `any`.
- Never throws. Callers decide what null means.

Tests `lib/__tests__/youtube.test.ts`: table-driven parse cases (watch, `watch?v=..&t=30s`,
`m.youtube.com`, `youtu.be/<id>?si=..`, shorts, embed, nocookie embed, live, bare id, no scheme;
reject `vimeo.com`, `youtube.com/playlist?list=..`, `youtube.com/@channel`, 10/12-char ids,
`javascript:`); oEmbed with `vi.stubGlobal('fetch', ...)` for 200, 404, thrown error, abort,
malformed body.

### 2.3 Routes (`backend/functions/episodes/handler.ts`, new)

Route-table entries only; **no** `serverless.yml` http events.

| Method | Resource | Access | Handler |
|---|---|---|---|
| GET | `/episodes` | `'public'` | `getPublishedEpisodes.ts` |
| GET | `/episodes/{episodeId}` | `'public'` | `getEpisode.ts` |
| GET | `/admin/episodes` | `STAFF` | `listEpisodes.ts` |
| POST | `/admin/episodes` | `STAFF` | `createEpisode.ts` |
| POST | `/admin/episodes/youtube-lookup` | `STAFF` | `lookupYoutube.ts` |
| PUT | `/admin/episodes/{episodeId}` | `STAFF` | `updateEpisode.ts` |
| DELETE | `/admin/episodes/{episodeId}` | `STAFF` | `deleteEpisode.ts` |

- Export `routes` and `handler = createRouter(routes)` like `functions/videos/handler.ts`.
- Register in `functions/api/routes.ts`: import + add to `DOMAIN_ROUTE_TABLES`.
- `functions/__tests__/routeAccess.test.ts`: add `'GET /episodes'` and `'GET /episodes/{episodeId}'`
  to `PUBLIC_ROUTES`; add the five staff routes to `STAFF_ROUTES` (audited list).
- Highlights keep using `/videos` and `/admin/videos` (unchanged routes, legacy parity intact).
- `routes.test.ts` precedence: `/admin/episodes/youtube-lookup` (POST) shares no method with
  `/admin/episodes/{episodeId}` (PUT/DELETE), so no conflict; literal still beats param.

Handler behaviour (all import only from `lib/repositories`, use `lib/response` helpers,
JSON.parse inside try/catch → `badRequest('Invalid JSON')`):

- **`getPublishedEpisodes`** (public): `?eventId=` → `listByEvent(eventId)` filtered to published,
  sorted airDate desc; otherwise `listPublished()`. Map through `toPublicEpisode` (new
  `lib/publicEpisode.ts`, strips `createdBy`). Must handle `queryStringParameters: null` (no
  query params); `getPublishedEpisodes.test.ts` covers this directly. (`routeAccess.test.ts`
  replaces every handler with a `vi.fn()` stub, so it does not exercise real handlers.)
- **`getEpisode`** (public): 404 when missing; drafts 404 unless `isStaff(await getVerifiedCaller(event))`
  (same pattern as `getVideo.ts`). Response:
  ```ts
  { episode: PublicEpisode; highlights: PublicVideo[] }
  ```
  `highlights` = `content.videos.listPublished()` filtered by `episodeId`, newest first, mapped
  through `toPublicVideo`. The event itself is **not** embedded; the frontend calls the existing
  `GET /events/{eventId}` (reuses `enrichedMatches` and its staff-only redaction rules).
- **`listEpisodes`** (staff): `episodes.list()` (scan) sorted airDate desc, drafts included,
  full rows. No per-row event lookups; the admin UI derives "linked event missing" from the
  events list it already loads.
- **`lookupYoutube`** (staff): body `{ url: string }` → `parseYoutubeVideoId`; null →
  `badRequest('Not a YouTube video link')`. Then `fetchYoutubeOEmbed`. Returns
  `{ youtubeVideoId, title: oembed?.title ?? '', channelName?, thumbnailUrl, oembedAvailable: boolean,
  existingEpisodeId?: string }` (from `findByYoutubeId`, to warn about duplicates). Never 5xx on
  oEmbed failure. **This is the only place oEmbed is fetched.**
- **`createEpisode`** (staff): body `{ url, title, channelName?, description?, airDate?, eventId?, isPublished? }`.
  No oEmbed call: the client sends the title it got from lookup (or typed) and the server trusts it.
  - Parse id (400 on failure). Duplicate `youtubeVideoId` → `conflict`/400 "This video is already an episode".
  - `title` required: trimmed, 1-200 chars, else 400 "Title required". `channelName` optional,
    trimmed, ≤200 chars.
  - `description` ≤ 5000 chars, plain text. `airDate` must match `^\d{4}-\d{2}-\d{2}$` and parse;
    default today (UTC).
  - `eventId`: if present, `leagueOps.events.findById` must exist else 400 "Event not found".
  - `isPublished`: must be boolean if present (same rule as §2.0).
  - `thumbnailUrl = youtubeThumbnailUrl(id)`, `createdBy = caller sub`.
  - Returns `created(episode)`.
- **`updateEpisode`** (staff): patch fields copied explicitly (like `updateEvent.ts`); `url` may
  change the video (re-parse, duplicate check excluding self, rebuild thumbnail; title/channel
  only replaced if the body sends them). `eventId: null` unlinks; non-null validated as above.
  Empty patch → 400. 404 when missing.
- **`deleteEpisode`** (staff): 404 when missing; unlink highlights whose `episodeId` matches
  (`videos.list()` filtered, then `videos.update(id, { episodeId: null })` sequentially), then
  delete. Videos are never deleted. Non-transactional, but unlinks run before the delete, so a
  failure part-way leaves the episode in place with some highlights unlinked, and retrying the
  delete finishes the job.

Videos domain changes (small):
- `createVideo.ts` / `updateVideo.ts`: accept optional `episodeId` (`string | null` on update).
  Validate it exists via `content.episodes.findById` (400 if not). In `createVideo`, **only staff**
  may set `episodeId`; a wrestler's value is ignored (they cannot link into staff content).
- `getPublishedVideos.ts`: optional `?episodeId=` filter (in memory). Response shape unchanged.
- Fix the stale comment at `functions/images/generateUploadUrl.ts:58` only if touching the file
  (not required).

Backend tests (`functions/episodes/__tests__/`), using in-memory repos via
`setRepositoriesForTesting`. The API Gateway event helpers `makeEvent` / `withAuth` (plus `ctx`,
`cb`) exist only at `backend/functions/rivalries/__tests__/testHelpers.ts`; import them from
there (`../../rivalries/__tests__/testHelpers`) rather than copying. `fetch` stubbed in
`lookupYoutube.test.ts` only (no other handler fetches):
- `getPublishedEpisodes.test.ts`: excludes drafts, airDate order, `?eventId=` filter, no `createdBy`,
  200 with `queryStringParameters: null`.
- `getEpisode.test.ts`: draft 404 anonymous/Wrestler, 200 for Moderator; highlights only published
  and only linked ones; no `uploadedBy`/`createdBy` leaks.
- `createEpisode.test.ts`: each URL form; invalid URL 400; missing/blank title 400; title over
  200 chars 400; duplicate 400; bad event 400; non-boolean `isPublished` 400; defaults draft;
  `fetch` is never called.
- `updateEpisode.test.ts`: unlink event with null; change video; 404; empty patch 400.
- `deleteEpisode.test.ts`: unlinks highlights, keeps videos.
- `lookupYoutube.test.ts`: success, oEmbed null → `oembedAvailable: false`, duplicate hint.
- `functions/videos/__tests__/`: staff can set `episodeId`, wrestler cannot, unknown episode 400,
  `episodeId: null` clears it, `?episodeId=` filter, plus the §2.0 `isPublished` tests.
- Existing guards that must stay green: `routeAccess.test.ts`, `routes.test.ts`,
  `legacyParity.test.ts`, `serverlessConfig.test.ts` (table protections, ≥41 tables, http only on
  `api`), `readPathVisibility.test.ts`.

### 2.4 API docs

`backend/docs/openapi.yaml`: add `Episode`, `EpisodeDetail`, `YoutubeLookup` schemas, the seven
paths, and `episodeId` on `Video` (also fix `isPublished` there to `type: string, enum: ['true','false']`).
Then `cd backend && npm run embed-docs && npm run validate-api-docs` and commit
`functions/docs/docsEmbed.generated.ts` (CI diff-gates it).

## 3. CSP and headers

`frontend/index.html` meta CSP, exact edits:
- `img-src 'self' data: blob: https://*.s3.amazonaws.com https://*.s3.us-east-1.amazonaws.com https://i.ytimg.com;`
- `frame-src https://www.youtube-nocookie.com;` (replaces `'none'`)
- Nothing else: no `script-src` change (plain iframe, no IFrame API script), no `connect-src`
  change (oEmbed is server-side), no `media-src` change (highlights stay same-origin via
  `/videos/*`), no `child-src` (frame-src takes precedence).

Other header sources (verified, no change): CloudFront uses AWS managed SecurityHeadersPolicy
(`serverless.yml` `custom.securityHeadersPolicyId`), which sends no CSP; its `X-Frame-Options:
SAMEORIGIN` only restricts framing *of* our site; `Referrer-Policy: strict-origin-when-cross-origin`
still sends the origin, which the YouTube embed requires. **Do not** set
`referrerpolicy="no-referrer"` on the iframe. Service worker ignores cross-origin requests
(no `CACHE_VERSION` bump). `sanitizeHtml` keeps stripping `<iframe>`: the player is only ever a
React component built from a validated id, never stored HTML.

Test: extend `frontend/src/utils/__tests__/contentSecurityPolicy.test.ts` with
`frame-src` equal to `['https://www.youtube-nocookie.com']` and `img-src` containing
`https://i.ytimg.com`.

## 4. Frontend

### 4.1 Types and API client
- `src/types/index.ts`: `Episode` (mirror of public backend shape, but `isPublished: boolean`,
  normalised in `episodes.api.ts` exactly like `normalizeVideo` in §2.0),
  `EpisodeDetail { episode: Episode; highlights: Video[] }`, `YoutubeLookupResult`;
  `Video.episodeId?: string`.
- `src/services/api/episodes.api.ts` (new), all via `fetchWithAuth`, AbortSignal param on reads:
  `getPublished(signal?)`, `getByEvent(eventId, signal?)`, `getById(id, signal?)`,
  `getAll()` (admin), `lookup(url)`, `create(input)`, `update(id, patch)`, `delete(id)`.
  Export `episodesApi` and input types from `src/services/api/index.ts`.
- `videos.api.ts`: `CreateVideoInput.episodeId?: string | null`; `getPublished(category?, signal?, episodeId?)`
  only if needed.
- `src/utils/youtube.ts`: `youtubeWatchUrl(id)`, `youtubeEmbedUrl(id)` =
  `https://www.youtube-nocookie.com/embed/<id>?autoplay=1&rel=0&modestbranding=1`, and
  `isYoutubeId(id)` (same regex) used as a render guard.

### 4.2 Routes (`src/App.tsx`)
- Lazy imports: `Episodes` (`components/episodes/Episodes.tsx`), `EpisodeDetail`
  (`components/episodes/EpisodeDetail.tsx`). Remove the `Highlights` lazy import.
- Three routes, in this order:
  ```tsx
  <Route path="/episodes" element={<Episodes />} />
  <Route path="/episodes/highlights" element={<Episodes />} />
  <Route path="/episodes/:episodeId" element={<EpisodeDetail />} />
  ```
  `Episodes` picks the Full Episodes or Highlights view from `useLocation().pathname`.
- `/highlights` → `<Navigate to="/episodes/highlights" replace />`.
- Tabs as **route tabs** (shareable URLs): `/episodes` (Full Episodes) and `/episodes/highlights`
  (Highlights). Declare `/episodes/highlights` **before** `/episodes/:episodeId` (React Router ranks
  static segments first anyway; keep it explicit). Episode ids are uuids so `highlights` can never
  collide.
- No feature flag (Highlights and Events have none). Ungated, public.

### 4.3 Nav (`src/config/navConfig.ts`)
- Events section: replace the `/highlights` tab with
  `{ path: '/episodes', labelKey: 'nav.episodes', icon: Tv /* lucide */, matches: ['/highlights'] }`.
- `DETAIL_TITLES`: add `{ pattern: /^\/episodes\/(?!highlights$)[^/]+/, titleKey:
  'episodes.detail.pageTitle', parentKey: 'nav.episodes' }` (`parentKey` is a translation key,
  not a path).
- `STATIC_TITLE_KEYS`: add **only** `'/episodes/highlights': 'episodes.tabs.highlights'`. Do
  **not** add `/episodes`: `getPageInfo` checks static prefixes with `pathMatches`
  (`startsWith(prefix + '/')`) and returns before `DETAIL_TITLES`, so a `/episodes` key would
  give every `/episodes/<uuid>` the list title. `/episodes` already gets its title from the nav
  tab via `findActiveTab`.
- Admin: add `'episodes'` to `ADMIN_TABS` and
  `{ tab: 'episodes', labelKey: 'admin.panel.tabs.episodes', icon: Tv, minRole: 'Moderator' }`
  in the `storylinesContent` group beside `videos`; `AdminPanel.tsx` maps
  `episodes: lazy(() => import('./ManageEpisodes'))`. Keep the `videos` admin tab; rename its label
  to "Manage Highlights" (`admin.panel.tabs.videos` value only, key unchanged).
- `navConfig.test.ts`: change the `['/highlights','events']` expectation to `['/episodes','events']`
  and add `['/highlights','events']` via `matches`, plus `/episodes/abc` → events. Add
  `getPageInfo` cases: `/episodes/abc` → title `episodes.detail.pageTitle`, parent `nav.episodes`;
  `/episodes/highlights` → `episodes.tabs.highlights`; `/episodes` → `nav.episodes`. Admin-registry
  counts: still 5 groups; `ADMIN_TABS` length +1; admin-only count unchanged (Moderator tab);
  unique admin titles.

### 4.4 Components (all CSS in sibling `.css` files, tokens only, no inline styles)

`components/episodes/YouTubeFacade.tsx` + `YouTubeFacade.css`
- Props: `{ videoId: string; title: string; thumbnailUrl?: string }`.
- Renders nothing (returns `null`) if `!isYoutubeId(videoId)`.
- Idle: `<button type="button" class="yt-facade" aria-label={t('episodes.play', { title })}>` with
  `<img loading="lazy" src={thumbnailUrl ?? i.ytimg hqdefault} alt="">` and a play icon (lucide
  `Play`, `aria-hidden`). 16:9 via `aspect-ratio`.
- Active (after click): `<iframe src={youtubeEmbedUrl(id)} title={title}
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  allowFullScreen loading="lazy">`. Focus moves to the iframe.
- Always render under it: `<a href={youtubeWatchUrl(id)} target="_blank" rel="noopener noreferrer"
  className="ui-btn ui-btn--secondary ui-btn--sm">` "Watch on YouTube" (lucide `ExternalLink`).
  `Button` cannot link off-site (it always renders a router `Link`).
- Test `__tests__/YouTubeFacade.test.tsx`: no iframe before click; iframe with nocookie URL after
  click; external link href/target/rel; invalid id renders nothing.

`components/episodes/Episodes.tsx` + `Episodes.css` (section shell)
- `PageHeader` (only h1) with `episodes.title` / `episodes.subtitle`.
- `SectionTabs` items: `/episodes` "Full Episodes", `/episodes/highlights` "Highlights"; active by
  `useLocation().pathname`.
- Full Episodes view (`EpisodeList.tsx`): `episodesApi.getPublished(signal)` with AbortController;
  `Skeleton variant="cards"`, `EmptyState` with retry on error, `EmptyState` when empty. Grid of
  `EpisodeCard` (Card `to=/episodes/:id`: thumbnail `img`, title, air date, linked-event Badge). The
  card links to the detail page; the facade plays on the detail page (keeps the grid light: no
  iframes in lists).
- Highlights view (`HighlightsList.tsx`): **move** the body of `components/Highlights.tsx` here
  (category Tabs, `VideoCard` with native `<video>` + `toMediaUrl`), dropping its `PageHeader`
  (the shell owns the h1). Add a "From episode: <title>" link on cards with `episodeId` (resolve
  titles from one `episodesApi.getPublished()` call inside its own try/catch, separate from the
  videos fetch; on failure or not found, hide the link and still render the videos).
- Delete `components/Highlights.tsx` + `.css`; move styles into `HighlightsList.css`. Move/rename
  `__tests__/Highlights.test.tsx` to `episodes/__tests__/HighlightsList.test.tsx` (same 4 cases,
  mock `videosApi` + `episodesApi`).
- Tests `Episodes.test.tsx`: tabs render and route; list, empty, error/retry.

`components/episodes/EpisodeDetail.tsx` + `EpisodeDetail.css`
- `episodesApi.getById(episodeId, signal)`; 404 → `EmptyState` "Episode not found" + back link.
- Layout: back link to `/episodes`; `PageHeader` title = episode title, subtitle = air date
  (+ channel name); `YouTubeFacade`; description as plain text paragraphs (React text, no HTML).
- If `episode.eventId`: `eventsApi.getById(eventId, signal)`; on success render an "On the card"
  section: event name linking `/events/:eventId`, status/type Badges (`eventDisplay.ts` tones), and
  the match list from `enrichedMatches` (participants, winners highlighted, designation label via
  `DESIGNATION_LABEL_KEYS`) plus a `Button to=/events/:id/results` when any match is completed.
  Extract a small `EpisodeEventCard.tsx` for this; do **not** import the 1388-line `EventDetail`.
  On event 404/error, hide the section silently.
- "Highlights from this episode": `highlights` from the response, reusing `HighlightVideoCard`
  (export the card from `HighlightsList.tsx` or move it to `HighlightVideoCard.tsx`). Hidden when empty.
- Tests: renders facade + event card + highlights; no event section without `eventId`; event 404
  hides section; episode 404 state.

`components/events/EventDetail.tsx` (and optionally `EventResults.tsx`)
- After the event loads, `episodesApi.getByEvent(eventId, signal)`; take the first result.
  Failure is silent (button just doesn't show). The whole expression, including the
  `episodesApi.getByEvent` property access, sits **inside** its own `try { } catch { }` in a
  separate effect, so it cannot break the event load.
- Existing test mocks: `EventDetail.test.tsx` mocks `'../../../services/api'` with an explicit
  object (`eventsApi`, `matchesApi`, `playersApi`, `tagTeamsApi`, `isApiError`) and no
  `episodesApi`. Add `episodesApi: { getByEvent: vi.fn().mockResolvedValue([]) }` to it. Then
  grep `vi.mock(.*services/api` across `frontend/src` for any other test that renders
  `EventDetail` or `HighlightsList` (today: `components/__tests__/App.test.tsx` references
  `EventDetail`; check whether it mocks `services/api`) and add `episodesApi` there too. The moved
  `HighlightsList.test.tsx` mocks both `videosApi` and `episodesApi.getPublished`.
- In the `PageHeader` `actions` slot, add
  `<Button variant="secondary" to={`/episodes/${episode.episodeId}`} icon={<Tv aria-hidden size={18}/>}>{t('events.detail.watchEpisode')}</Button>`.
- Extend the EventDetail test (or add one) mocking `episodesApi.getByEvent`: button shown with
  link; hidden when none.

`components/admin/ManageEpisodes.tsx` (+ styles via `adminContent.css`; add
`ManageEpisodes.css` only if needed)
- DataTable: thumbnail, title, air date, event (name from the loaded `eventsApi.getAll()` list,
  or a "missing" warning badge when the id is not in it), Published/Draft, Edit/Delete
  (`useAdminConfirm`).
- `AdminFormModal` form:
  1. **YouTube link** input + "Fetch details" button → `episodesApi.lookup(url)`. Show inline error
     for invalid links; show a preview (thumbnail `img`, fetched title, channel) and a warning if
     `existingEpisodeId`. If `oembedAvailable` is false, show "Couldn't fetch details from
     YouTube; enter a title" and keep going.
  2. **Title** (prefilled from lookup, editable, required), **Description** (textarea),
     **Air date** (`type="date"`, default today).
  3. **Event** `Select` from `eventsApi.getAll()` sorted date desc, with "No event" option.
  4. **Published** checkbox (default off), bound to the boolean `isPublished` from the normalised
     API shape (§2.0); never to a raw string.
  No highlight picker: highlights are linked from Manage Highlights. A one-line hint says so.
- Save → `create` / `update` with `title` (and `channelName` from lookup). Toasts/`AdminNotice`
  on success/failure.
- Test `admin/__tests__/ManageEpisodes.test.tsx`: lookup fills title; invalid link error; oEmbed
  unavailable still saves with typed title; create payload includes eventId/isPublished/title;
  editing a draft and saving keeps `isPublished: false`.

`components/admin/ManageVideos.tsx`
- Add a "Linked episode" `Select` (episodes from `episodesApi.getAll()`, "None" option) sending
  `episodeId` (null to clear) on create/update. Add a column showing the linked episode title.
- Requires the §2.0 fix (otherwise linking a wrestler's draft publishes it).
- Update `ManageVideos.test.tsx` mocks (`episodesApi.getAll`); add one test for the picker payload
  and one that linking a draft to an episode sends `isPublished: false`.
- `profile/MyVideos.tsx`: no code change (wrestlers cannot link); its badge becomes correct
  through the §2.0 normaliser.

### 4.5 i18n (EN + DE, `localeParity.test.ts`)
New keys in both `en.json` and `de.json` (German uses "du"):
- `nav.episodes`: "Episodes" / "Episoden".
- `episodes.title`, `episodes.subtitle`, `episodes.tabs.full` ("Full Episodes" / "Ganze Folgen"),
  `episodes.tabs.highlights` ("Highlights" / "Highlights"), `episodes.noEpisodes`,
  `episodes.loadError`, `episodes.play` ("Play {{title}}"), `episodes.watchOnYoutube`
  ("Watch on YouTube" / "Auf YouTube ansehen"), `episodes.airDate`, `episodes.fromEpisode`,
  `episodes.detail.{pageTitle,notFound,back,onTheCard,viewResults,highlights}`,
  `episodes.admin.{title,add,edit,youtubeUrl,fetchDetails,invalidUrl,oembedUnavailable,duplicate,
  fields.{title,description,airDate,event,noEvent,published},highlightsHint,eventMissing,
  createSuccess,updateSuccess,deleteSuccess,confirmDelete,saveError,loadError}`.
- `videos.fields.episode`, `videos.noEpisode`.
- `events.detail.watchEpisode` ("Watch the episode" / "Episode ansehen").
- `admin.panel.tabs.episodes` ("Manage Episodes" / "Episoden verwalten"); change the
  `admin.panel.tabs.videos` value to "Manage Highlights" / "Highlights verwalten".
- **Keep** the `highlights.*` namespace (`highlights.videoNotSupported` etc. are used by
  `AnnouncementModal`, `news/FeatureStory`, `news/NewsArticle`, and the moved highlights list).
  `nav.highlights` may be removed only if nothing references it (grep first).

### 4.6 Lint
Frontend `eslint --max-warnings 82`: add zero new warnings (exhaustive-deps on the fetch effects).

## 5. Wiki and patch notes

Wiki (CLAUDE.md "To add a wiki article"):
- Public `frontend/public/wiki/episodes.md` + `de/episodes.md`: what Full Episodes and Highlights
  are, that playing on the site counts as a YouTube view, "Watch on YouTube", episode page with
  match card and highlight packages, link from the event page.
- Staff `admin-episodes.md` + `de/admin-episodes.md` (`"adminOnly": true, "parent": "admin",
  "navTitleKey": "wiki.navLabels.adminEpisodes"`): pasting a link, what happens if YouTube details
  can't be fetched, drafts/publishing, linking an event, linking highlight packages (from the
  Manage Highlights form), uploading highlights via Manage Highlights.
- `index.json` entries with `title` equal to the EN `titleKey` value (`wikiTitle.test.ts`);
  `wiki.articles.episodes`, `wiki.articles.adminEpisodes`, `wiki.navLabels.adminEpisodes` in EN+DE.
- Public articles must not link to `admin-episodes` (`wikiLinks.test.ts`).
- Update `getting-started.md` + DE (Events row: "Highlights" → "Episodes"), `events.md` + DE
  (mention "Watch the episode"), `admin-events.md` + DE (one line pointing to Manage Episodes).

Patch notes: **not in this PR.** A separate follow-up PR, stacked on this one, once the owner has
tried the feature on devtest and wants to release it (feature release → **v1.8.0**). The wiki
article it links ships here, so the follow-up only adds release files. When it is done, follow
`frontend/public/patch-notes/README.md`:
`v1.8.0.md` + `de/v1.8.0.md` (sections: "Episodes", "Highlights moved into Episodes"; each ends
with `**Read more:**` → `/guide/wiki/episodes`, never the admin article); prepend the `releases`
entry (version, date, title, summary, titleDe, summaryDe, file); bump `frontend/package.json` and
both `package-lock.json` version lines to `1.8.0`; update `next-features.md` + DE (remove nothing
shipped elsewhere; no links to missing wiki pages). No sprints/dates/timeframes in copy.
Screenshots optional: if added, WebP < 200 KB in `images/v1.8.0/`, no personal data. Run
`npx vitest run src/components/patchNotes`.

`CLAUDE.md`: Data Model (Episodes table; `episodeId` on Videos), API Endpoints (public + admin
episodes routes), and fix the table count in the AWS Infrastructure row to the real count.
**Commit only these hunks.** The working tree already has an uncommitted, unrelated
"claude-reflect: learned rules" block at the end of `CLAUDE.md` (it mentions where the
soloKanban API key lives). Stage the Episodes edits with `git add -p CLAUDE.md` and leave that
block unstaged, unless the owner says it should be committed.

## 6. Work breakdown (ordered; each step independently testable)

| # | Step | Depends on | Verify |
|---|---|---|---|
| 0 | §2.0 `isPublished` fix (backend validation + strict compare, frontend `normalizeVideo`) + tests; own commit | none | backend `npx vitest run functions/videos`, frontend `npx vitest run src/components/admin/__tests__/ManageVideos.test.tsx` |
| 1 | `lib/youtube.ts` + tests | none | `npx vitest run lib/__tests__/youtube.test.ts` |
| 2 | Types, `ContentRepository` interface, in-memory + Dynamo episodes repo (hand-written `REMOVE` for null), Videos `episodeId`, repo tests incl. Dynamo REMOVE test | none | repo tests, `npx tsc --noEmit` |
| 3 | `serverless.yml` table/env/IAM, `TableNames` | none | `serverlessConfig.test.ts`, `npx serverless package --stage devtest` + `npm run check-stack-limits` |
| 4 | Episodes handlers + route table + `routes.ts` + `routeAccess.test.ts` lists + handler tests; Videos `episodeId` handling | 1, 2 | backend `npm test`, lint, tsc |
| 5 | OpenAPI + embed-docs | 4 | `npm run validate-api-docs`, generated file committed |
| 6 | CSP edit + CSP test | none | `contentSecurityPolicy.test.ts` |
| 7 | Frontend types, `episodes.api.ts`, `utils/youtube.ts`, `YouTubeFacade` + tests | API contract from §2.3 | vitest |
| 8 | Episodes shell, EpisodeList, HighlightsList move, routes, nav, i18n | 7 | vitest, `tsc -p tsconfig.app.json` |
| 9 | EpisodeDetail + EpisodeEventCard; EventDetail button | 7 | vitest |
| 10 | ManageEpisodes, ManageVideos picker, admin registry | 0, 7 | vitest |
| 11 | Wiki EN+DE, `getting-started`/`events` updates | 8-10 (for accuracy) | `wikiTitle`/`wikiLinks` tests |
| 12 | CLAUDE.md (Episodes hunks only, `git add -p`) | 11 | review staged diff |
| 13 | Full verify, deploy to devtest, manual walkthrough | all | see §7 |
| later | Patch notes v1.8.0 + version bump, separate stacked PR | 13 + owner go-ahead | patchNotes tests |

Parallelism: **0, 1, 2, 3, 6** in parallel (0 and 2 both touch `DynamoContentRepository.ts` /
`InMemoryContentRepository.ts` videos blocks: same agent, or 0 first); then **4** (backend) in
parallel with **7**; then **8, 9, 10** in parallel (separate files; i18n keys: one agent owns
`en.json`/`de.json` edits or merge carefully, they conflict easily); **5** any time after 4;
**11 → 12 → 13** last.

## 7. Verification before PR

- Backend: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run embed-docs` (no diff),
  `npx serverless package --stage devtest`, `node scripts/check-stack-cycles.js`,
  `npm run check-stack-limits`, `node scripts/check-api-cutover.js --stage devtest`.
- Frontend: `npm run lint` (≤82 warnings), `npx tsc --project tsconfig.app.json --noEmit`, `npm test`.
- Deploy to devtest (allowed). Check: Lambda can read/write Episodes (no AccessDenied); paste each
  URL form in admin; oEmbed fills the title from the deployed Lambda; facade loads the nocookie
  player with no CSP errors in the console; "Watch on YouTube" opens youtube.com; `/highlights`
  redirects; existing 11 highlights still play; link a highlight and an event and confirm both
  pages; event page "Watch the episode" button; drafts hidden when signed out; German UI;
  edit a draft highlight in Manage Highlights, link it to an episode, save, and confirm it stays a
  draft (badge "Draft", absent from `/episodes/highlights` when signed out); unlink an event from
  an episode and confirm the save succeeds (REMOVE on the GSI key).

## 8. Risks

- **CSP typo** blocks the player or thumbnails site-wide → covered by the CSP test and devtest check.
- **oEmbed availability/rate limiting** from Lambda IPs → graceful null, staff types the title;
  thumbnail never depends on oEmbed.
- **Embedding disabled** on a specific video → player shows YouTube's error; the "Watch on YouTube"
  link always works. oEmbed returns 401 for these, so the admin lookup can warn ("embedding may be
  disabled") when `oembedAvailable` is false.
- **View counting**: YouTube counts embedded plays that the viewer starts; autoplay after an
  explicit click is fine. Never autoplay without a click, never mute-autoplay in lists.
- **IAM/env headroom** shrinking (estimates ~3.15/4 KB env, ~6.4/10 KB policy) → note in PR.
- **Dangling event links** after event deletion → handled in UI; no cascade.
- **Episode delete unlinks highlights non-transactionally** → unlinks run first, retry finishes.
- **Draft highlights published by an edit** (pre-existing bug) → fixed in step 0 before the
  episode picker ships.
- **i18n merge conflicts** between parallel agents → single owner for locale files.
- **Nav tests and admin-registry counts** must be updated in the same step as the nav change.

## 9. Non-goals

- Playlist or channel import, YouTube Data API, auto-sync of new uploads (the `source` field is the
  hook for later).
- Storing view counts, durations or publish dates from YouTube.
- Hosting full episodes on the site; transcoding or new upload paths for highlights.
- Changing `/videos` or `/admin/videos` routes, the S3/CloudFront `/videos/*` path, or `MyVideos`.
- `episodeId` on `LeagueEvent`, cascades on event delete, a feature flag, site search indexing,
  E2E specs (optional follow-up), a GSI on Videos by `episodeId`.

## 11. Twitch live stream (added by the owner after review)

### Decisions (owner)
- **No Twitch API.** There's no live detection and no keys. A GM (Moderator or higher) marks the stream live or offline by hand.
- **Placement:** a **Dashboard card** shown only while marked live. There's no Live tab, nav badge or site banner.
- **Player only.** There's no chat embed. The card has a "Watch on Twitch" button that opens `https://www.twitch.tv/<channel>` in a new tab.

### Data: stored in SiteConfig, no new table
- `SiteConfigRepository` gains `getLiveStream()` / `setLiveStream()`, stored the same way as the ticker settings, so it adds no CloudFormation resource. Shape:
  `LiveStreamSettings { channel: string; isLive: boolean; title?: string; liveSince?: string; updatedBy?: string; updatedAt?: string }`.
  - `channel` is the Twitch login. Validate it against `^[A-Za-z0-9_]{4,25}$` and store it lowercase. It defaults to `''`, and the card never shows while it's empty.
  - `title` is an optional headline such as "Season 5 Night 1". It's plain text, max 120 characters, rendered as text and never as HTML.
- **Stale-flag guard:** the read path treats the stream as offline once `liveSince` is more than **8 hours** old (`LIVE_STREAM_MAX_HOURS`, an exported constant), so a GM who forgets to switch it off doesn't leave a dead card up. The check happens at read time and writes nothing.

### Backend (route-table entries only)
- `GET /live-stream` is **public**. It returns `{ channel, isLive, title, liveSince }`, with `isLive` already passed through the 8-hour guard. It leaves out `updatedBy`. It needs an entry in `PUBLIC_ROUTES` in `routeAccess.test.ts`.
- `PUT /admin/live-stream` is **STAFF** (Moderator+). The body is `{ channel?, isLive?, title? }`.
  - Turning live on stamps `liveSince = now`, and turning it off clears `liveSince`.
  - Saving while already live keeps the existing `liveSince`.
  - It returns 400 if `isLive: true` while the channel is empty.
  - It doesn't go through `PUT /admin/site-config`, because that route is ADMIN_ONLY and GMs must be able to toggle the stream.
- Tests cover:
  - validation (bad channel, title too long, live with no channel)
  - the 8-hour guard, with a pinned clock
  - Moderator allowed, Wrestler refused, anonymous GET allowed
  - in-memory repository parity
- OpenAPI entries for both routes, then `npm run embed-docs`.

### Frontend
- `services/api`: `liveStreamApi.get(signal)` and `liveStreamApi.update(patch)`, with the types in `types/index.ts`.
- **`LiveStreamCard`** goes on the Dashboard at the top of the main column, so it's the first thing people see while it's showing.
  - It fetches `GET /live-stream` on mount and every **60 s** while the tab is visible (`document.visibilityState`), and aborts on unmount.
  - It renders nothing unless `isLive && channel`.
  - Content:
    - a "LIVE" badge and the title, or the default "Live now on Twitch"
    - a 16:9 click-to-load player, reusing the YouTube facade pattern, with a branded placeholder and a Play button because there's no thumbnail without the API
    - after the click, an iframe of `https://player.twitch.tv/?channel=<channel>&parent=<window.location.hostname>&autoplay=true`
    - a "Watch on Twitch" link with `target="_blank" rel="noopener noreferrer"`
  - Twitch rejects the embed unless `parent` matches the embedding host, so the code uses `window.location.hostname`, which covers prod, dev and localhost.
  - CSS goes in its own file, with no inline styles.
- **Admin:** a "Live stream" panel in the new Episodes admin tab, visible to Moderator+. It has:
  - a channel field
  - a title field
  - a large **Go live / End stream** toggle
  - the status "Live since 8:42 PM" and the auto-off time
- i18n keys in EN and DE under `liveStream.*`.

### CSP
- `frame-src` adds `https://player.twitch.tv`, next to `https://www.youtube-nocookie.com`. Nothing else changes: the card makes no images or script calls to Twitch. Extend the CSP test.

### Docs
- Add a "Live stream" section to the public Episodes wiki article (EN and DE): where the card appears, and that it opens on Twitch.
- Add the GM steps to `admin-episodes` (EN and DE): set the channel once, toggle Go live, and note that it switches off by itself after 8 hours.

### Work breakdown additions
- **T1:** repository, routes and tests. This can run in parallel with steps 1–3.
- **T2:** API client, `LiveStreamCard` and Dashboard placement. Runs with step 7.
- **T3:** admin panel. Runs with step 10.
- **T4:** CSP. Folded into step 6.
- **T5:** wiki. Folded into step 11.

## 10. Review log

### Round 1

Each issue was checked against the code on `feat/episodes`.

1. **(major) Linking highlights through Manage Videos publishes drafts.** Confirmed:
   `DynamoContentRepository.ts:204` stores `'true'|'false'`, `types/index.ts:677` says `boolean`,
   `ManageVideos.tsx:164/134/349` round-trips the string, `updateVideo.ts` passes the body
   through, and `DynamoContentRepository.ts:221` treats `'false'` as truthy. Badges at
   `ManageVideos.tsx:256` and `MyVideos.tsx:297` are wrong too. **Fixed:** new §2.0 and work-step 0
   (backend rejects non-boolean `isPublished`, strict compare in both repos, frontend
   `normalizeVideo` at the API boundary, tests that a draft stays a draft). ManageEpisodes and
   `episodes.api.ts` use the same normalised boolean. §1, §4.4, §7 and §8 point at it.
2. **(minor) `/episodes` in `STATIC_TITLE_KEYS` hides the detail title.** Confirmed:
   `getPageInfo` (navConfig.ts ~:517-527) returns on a static prefix match before
   `DETAIL_TITLES`, and `pathMatches` matches `prefix + '/'`. `parentKey` is a translation key
   (e.g. `'nav.events'`). **Fixed** in §4.3: only `/episodes/highlights` is a static key, the
   detail entry uses `parentKey: 'nav.episodes'`, and `getPageInfo` tests were added.
3. **(minor) Update builder cannot REMOVE.** Confirmed: `dynamo/util.ts` `buildUpdateExpression`
   emits only `SET`; the `expiresAt` REMOVE is hand-appended at `DynamoContentRepository.ts:129-132`.
   **Fixed** in §2.1: explicit hand-written `REMOVE eventId` / `REMOVE episodeId`, in-memory
   `delete`, plus in-memory and Dynamo-level tests.
4. **(minor) Wrong claims about routeAccess and PAY_PER_REQUEST.** Confirmed:
   `routeAccess.test.ts:301` stubs every handler with `vi.fn()`; `serverlessConfig.test.ts` checks
   only DeletionPolicy/UpdateReplacePolicy/DeletionProtection/PITR. **Fixed:** the no-query-params
   case is now a `getPublishedEpisodes.test.ts` case; §1 wording says PAY_PER_REQUEST is
   convention, not tested.
5. **(minor) Over-engineering.** Accepted. **Fixed:** one linking direction (`episodeId` set from
   Manage Highlights); removed `highlightIds`, `lib/episodeHighlights.ts` and the episode-form
   checkbox list; removed `seasonId`; oEmbed fetched only by the lookup endpoint and
   `createEpisode` trusts the client title; dropped per-row `eventMissing` (derived client-side
   from the events list the form already loads); patch notes moved to a separate follow-up PR.
   Kept: `deleteEpisode` unlinking highlights, so no highlight points at a deleted episode.
6. **(minor) Existing `services/api` mocks break.** Confirmed: `EventDetail.test.tsx:36` mocks an
   explicit object without `episodesApi`; `Highlights.test.tsx:8` mocks only `videosApi`.
   **Fixed** in §4.4: the `getByEvent` access sits inside its own try/catch; `episodesApi` added to
   the EventDetail mock; grep step for other mocks (`App.test.tsx` references `EventDetail`);
   `HighlightsList` episode-title fetch is in its own try/catch and its test mocks both APIs.
7. **(minor) Vague paths and route elements.** Confirmed: `makeEvent`/`withAuth` live only in
   `backend/functions/rivalries/__tests__/testHelpers.ts`. **Fixed:** §2.3 names that import path;
   §4.2 lists all three `<Route>` elements, `/episodes/highlights` rendering `<Episodes />`.
8. **(minor) CLAUDE.md commit would ship unrelated edits.** Confirmed: `git diff CLAUDE.md` shows
   an uncommitted "claude-reflect: learned rules" block. **Fixed** in §5 and step 12: stage only
   the Episodes hunks with `git add -p`, unless the owner says otherwise.

### Round 2 minors, applied (these override earlier sections)
1. **getEpisode draft tests** mock `lib/authenticate` with `fakeAuthenticate` and build requests with `bearer()` / `authedEvent()` from `functions/__tests__/visibilityTestHelpers.ts`, as `readPathVisibility.test.ts` does. `withAuth` is only for STAFF handlers that call `requireRole`.
2. **Empty-string links:** the backend treats `eventId === ''` and `episodeId === ''` as `null` (unlink on update, omitted on create) before any `findById` or write. The frontend sends `null` for "No event" / "None". Each handler gets a test for `''`.
3. **HighlightsList.test.tsx** drops the h1 assertion. `Episodes.test.tsx` asserts the `episodes.title` h1.
4. **Wiki hub:** add `- [Episodes](admin-episodes)` to `admin.md` and the German line to `de/admin.md`, and note that Manage Videos is now Manage Highlights.
5. **Dropped:** the public `GET /videos?episodeId=` filter and its test. `GET /episodes/{id}` already returns the linked highlights.
