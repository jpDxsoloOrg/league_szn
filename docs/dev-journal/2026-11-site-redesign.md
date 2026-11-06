# Dev journal: site redesign and audit (November 2026)

PR: https://github.com/jpDxsoloOrg/league_szn/pull/388

This records what changed and why. The repository is public, so security
entries describe the class of problem and the fix, not how to reproduce it.

## Goals

- The site looked generated and busy. It needed to be simpler and easier to
  navigate, keep every feature, and stay mobile friendly.
- Players with no wrestler name should disappear from the site without losing
  their accounts.
- Old call-outs should stop sitting in public feeds.
- Audit the features and architecture, and fix what could be improved.

## Design: Main Event Arena

The brief is `docs/design/site-redesign/DESIGN.md`. The look blends two Stitch
mockups, Main Event and Arena Lights, after an earlier pair came out too muted.

- Deep violet base with hot pink and cyan accents. Gradients are for hero areas
  and glow is only for live or active things, so colour keeps its meaning.
- Sora for headings, Inter for text, both self-hosted.
- `--color-primary` maps to cyan, not violet, because it is used as text in many
  places and violet fails contrast on the dark background.
- Mockup artwork is not shipped. Some generated images showed real people and
  third-party logos.

## Navigation

- Five sections on desktop and phone: Home, Events, Rankings, Storylines, Me.
  Staff also get Admin, as a sixth section on desktop and a row in Me on phones.
- **Why:** the old sidebar, Basic/Advanced toggle and mobile More sheet gave
  three different maps of one site. One registry now drives all of it.
- Every existing URL still works.
- Site search uses fuse.js. Routes and admin tabs load on demand, which took
  initial JS from about 1.8 MB to about 650 kB.

## Hiding players with no wrestler name

- Visibility is computed by `isPlayerVisible` from `currentWrestler`. A blank
  value or the "Needs Wrestler" placeholder means hidden.
- **Why computed and not a stored field:** a stored flag can drift from the data,
  and a computed rule needs no prod data change. A player reappears the moment
  they save a name, with nothing to restore. This differs from the original idea
  of adding a field, and it is simple to switch if a manual hide is ever wanted.
- On prod data this hid 315 of 704 players (81 blank, 234 placeholder).
- Hidden players can still sign in. The site prompts them for a wrestler name.
- `GET /players?view=directory` returns names for all players, so history such
  as old results and title reigns still reads properly.
- Rules chosen at the edges:
  - Historic matches and title reigns keep the player's real name, never the
    placeholder.
  - Pending and active rivalries with a hidden participant leave public lists.
    Completed ones stay as history.
  - Tag teams with a hidden member leave public reads.
  - Season awards skip hidden players, including for completed seasons.

## Call-outs and challenges

- Call-outs and responses leave public feeds after 4 days
  (`backend/lib/promoArchive.ts`). Archiving is decided at read time from
  `createdAt`, so nothing is deleted, admins can still see them, and rivalry heat
  is unchanged.
- **Why not `isHidden`:** that field is moderation state, and admin bulk delete
  keys off it. Reusing it would have put archived call-outs in the delete path.
- Pinned promos do not archive. A pin is a deliberate staff action.
- Pending challenges expire at 4 days through an hourly `expireChallenges`
  Lambda. When prod is deployed, the first run closes about 48 stale challenges.

## Audit fixes

- **Access control:** every route must now declare who may call it, and the router
  enforces that. A test walks all route tables, so a new route can't ship
  undeclared. **Why:** checks were previously left to each handler, and some were
  missing.
- **Secrets:** credentials are removed from tracked docs and test code, and CI
  runs a secret scan. Removal does not clean git history.
- **Uploads:** stored file types come from a server-side allow-list, the signed
  URL fixes the content type, and video uploads follow the same permission rule
  as creating a video.
- **Data safety:** tables, the user pool and the images bucket are retained, tables
  have point-in-time recovery and deletion protection, and image versions are
  kept for 90 days. Destructive admin tools run only on non-production stages or
  need a typed confirmation.
- **Match writes:** results and slots are checked at commit time and conflicts
  return 409. Results are validated against the match, and round-robins can now
  finish.
- **Deploys:** deploys depend on a shared lint, type and test workflow, run one at
  a time per environment, and prod deploys run from `main` only. Hashed assets are
  kept between deploys so open tabs don't break after a release.
- **Stack limit:** new resources route to the Overflow nested stack through
  `backend/stacks-map.js`. A generated-template check now fails before deploy if
  nested stacks form a cycle, which review caught on this branch.

## Decisions for the owner to confirm

These were conservative defaults, chosen so the work could continue.

- Call-outs still create challenges and now need an opponent and match type.
- Moderators don't manage users. Navigation hides what the API refuses.
- Season and title deletes stay available to Admin and Moderator.
- PSN IDs are unchanged.
- Stored announcements keep their old inline styling. Only new ones use the new
  markup.

## Deferred

| Item | Why it waited |
|---|---|
| Challenges feature review | Product decision |
| Signup abuse controls | Depends on the SES cutover |
| Moving result cascades into one transaction | Medium-risk rework; repair routes exist |
| Offline backup design | Replaces the current API export |
| Matches indexes and counters | Large and staged; no measured failure yet |
| Ladder and cage classification | Needs a stipulation lookup |
| Node runtime upgrade | Touches every function; deserves its own PR |
| Alarms | New resource types need stack routing first |
| Smoke tests, rollback and E2E updates | E2E selectors need updating for the new markup |
| About 225 hard-coded strings | Extract per screen; German strings need a native review |

Smaller open items:

- Challenges and promos posted before a player became hidden still appear on
  public reads. New ones are refused.
- `GET /challenges/{id}` still returns a lapsed challenge by direct link, the same
  way an archived promo stays reachable by link.
- The staff check-in roster leaves out blank-name players.
- The wiki needs updating for admin events and recording results.
- Text from the API, such as awards and activity summaries, stays English for
  German readers. Fixing it needs a locale contract between API and frontend.
- Home and Events can show old events as current, because event statuses are
  never closed. This needs a rule for how long an event counts as live.
- Stored stable and tag team win counters are still written but no longer shown.
- E2E selectors have not been updated for the new markup.

## What dev QA changed

Running the site as real members, moderators and admins found problems that unit
tests had not. The fixes are in this PR.

- **Faction invitations:** an access fix in this branch blocked invited players
  from seeing their own invitation. Non-members now get only their own, and only
  the leader and staff see all of them.
- **Player saves:** saving Edit Player cleared any wrestler held by name alone,
  which hid that player. This bug was already on `main`. A slot now goes out only
  when the admin changed it, and clearing one is an explicit request.
- **Records:** faction and tag team records are computed from matches on every
  page, so list and detail agree. List numbers can change after deploy. Tag team
  records count only matches within the team's lifetime. On prod data this
  matched every active and dissolved team, and took one old match each from two
  teams still awaiting approval. Faction records have the same bound, from
  `createdAt` to `disbandedAt`, with no end date while the status is not
  `disbanded` because reactivating keeps the old date. They stay approximate:
  no membership history is stored, so a member's pre-join matches inside the
  faction's lifetime still count and a removed member's matches do not.
- **Win %:** one 0-100 scale everywhere.
- **Cancelling challenges:** both update builders set `updatedAt` a second time
  when a patch carried it, which DynamoDB rejects, so every cancel returned 500.
  Scheduling from a challenge used the same pattern. The cause was already on
  `main`, and only showed up once QA stopped blocking the write.
- **Clearing fields:** blanking a division, alignment, PSN ID or image reported
  success and changed nothing, because the repository skips undefined values.
- **Hidden players:** the API now refuses new challenges, counters and promos from
  them. Before, only the pages stopped them.
- **Public player data:** `userId`, `canUploadVideos` and `hasWrestlerRole` now go
  only to staff and the player themselves. `hasLinkedAccount` replaces the check
  that the challenge picker made on `userId`.
- **Moderators:** navigation and buttons now match what the API allows. Dissolve,
  Disband and Expire also ask for confirmation.

## Operations notes

- **Lambda concurrency:** the account limit is 10, shared by prod and dev. Bursts
  above that return fast 500s across unrelated functions. The frontend now retries
  and survives partial failures, but only a quota increase fixes the cause.
- **Log groups:** `logRetentionInDays` makes CloudFormation update every log group,
  so a deploy fails if one was deleted outside the stack. The first dev deploy
  failed this way. Two empty log groups were created on dev and the deploy was
  rerun. Prod was checked and has none missing.
- **Challenge notifications:** these stay off. They were removed on purpose when
  matchmaking replaced challenges, so a direct challenge can lapse unseen.

- **User pool protection:** deletion protection is set by `setup-cognito.sh`, not
  the template. The template has no `LambdaConfig`, so a pool property change makes
  CloudFormation call `UpdateUserPool` without the triggers, which detached both
  for 5 minutes on devtest and would leave them off after a failed deploy. Prod's
  template now matches what is deployed, so its pool is not touched. The next
  devtest deploy removes the property, so its triggers and protection drop once
  until the wire step restores them. The wire step now also runs after a failed
  backend deploy.

## Release notes

- **Contender rankings:** a new scheduled function recalculates every active title
  every 6 hours, using the same code as the manual recalculate button. It uses the
  default settings (3 minimum matches, 10 contenders) and honours active overrides.
  Custom settings from a manual run last only until the next job or recorded match.
- **Ranking writes:** new rankings now replace old ones row by row, and only
  afterwards are dropped players removed. A failed title keeps its rankings and the
  other titles still save. A partly failed manual run reports which titles failed.
- **Ranking counters:** `weeksAtTop` now counts weeks rather than runs. An unchanged
  rank keeps its last movement arrow, so the job doesn't reset arrows to zero. The
  New badge clears at the next run, so within 6 hours.
- **Transfers off:** `POST /transfers` returns 403 while the `transfers` flag is
  off. A missing key means off, so prod needs no data change. Admins can still list
  and review existing requests through the API only: the admin tab is gated by the
  same flag, so it disappears on deploy. Reaching a pending request in the UI means
  turning the flag on, which also reopens `POST /transfers` to everyone.
- **Clearing transfer requests:** this deletes every row in that stage's
  transfer-requests table. It doesn't change players or send notifications. Stage
  `dev` is prod and `devtest` is the dev site. Run from `backend/`, and read the
  dry-run counts before adding `--confirm`:

  ```bash
  # Dry run: prints counts by status, changes nothing
  AWS_PROFILE=league-szn npm run delete-transfer-requests -- --stage dev

  # Delete
  AWS_PROFILE=league-szn npm run delete-transfer-requests -- --stage dev --confirm
  ```

## Verification

Checked on the dev environment with disposable accounts, using emulated phones and
desktop Chromium.

- Sign-up, the hidden state, the name prompt, becoming visible, signing back in.
- Invitations through accept and decline, including outsiders.
- Player saves and clears on name-only and roster-linked players.
- Role gating for guest, member, Moderator and Admin across every admin tab.
- Horizontal overflow on public routes at 320, 390 and 1440.

Not proven on dev:

- The 4-day archive and expiry against a real old row. Dev has none, so these rest
  on unit tests.
- Real phones, Safari and Firefox.
- Recording a match result after these changes, because it recalculates contenders
  for real titles.
