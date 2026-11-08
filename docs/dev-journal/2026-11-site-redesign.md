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

## Deferred

Smaller items are under Known open items in the release notes.

| Item | Why it waited |
|---|---|
| Signup abuse controls | Depends on the SES cutover |
| Moving result cascades into one transaction | Medium-risk rework; repair routes exist |
| Offline backup design | Replaces the current API export |
| Matches indexes and counters | Large and staged; no measured failure yet |
| Ladder and cage classification | Needs a stipulation lookup |
| Node runtime upgrade | Touches every function; deserves its own PR |
| Alarms | New resource types need stack routing first |
| Smoke tests, rollback and E2E updates | E2E selectors need updating for the new markup |
| Remaining hard-coded strings | Extract per screen; German strings need a native review |

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
- **Title results:** the check that the champion is in a challenge's title match
  ran only at booking, so a title that moved afterwards could change hands without
  its holder in the match. Two open challenges for one title could do this in
  normal play, and the path is already on `main`. The check now runs again when the
  result is recorded.
- **Deleted players:** profiles, faction overviews, tag team pages and rivalry lists
  said Unknown where Home said Former member. They now agree. If the name list
  fails to load, the page still says Unknown, so live players aren't called former
  members.
- **Tag team Recent Matches:** every row read "vs Unknown" with no format, even
  against live players, because the page and the API disagreed on field names. This
  is also on `main`. The page now resolves opponents through the player directory.
- **Contender overrides:** setting or removing one counted as rank movement. Those
  runs now keep every arrow and New badge, and they don't touch peak rank, weeks at
  #1 or ranking history.

## Operations notes

- **Lambda concurrency:** the account limit is 10, shared by prod and dev. Bursts
  above that return fast 500s across unrelated functions. The frontend now retries
  and survives partial failures, but only a quota increase fixes the cause.
- **Log groups:** `logRetentionInDays` makes CloudFormation update every log group,
  so a deploy fails if one was deleted outside the stack. The first dev deploy
  failed this way. Two empty log groups were created on dev and the deploy was
  rerun. Prod had none missing when last checked. A missing one fails the deploy
  and changes nothing, so it is safe to find out on the day.
- **Challenge notifications:** these stay off. They were removed on purpose when
  matchmaking replaced challenges, so a direct challenge can lapse unseen.
- **User pool protection:** deletion protection is set by `setup-cognito.sh`, not
  the template. The template has no `LambdaConfig`, so a pool property change makes
  CloudFormation call `UpdateUserPool` without the triggers, which detached both
  for 5 minutes on devtest and would leave them off after a failed deploy. Prod's
  template now matches what is deployed, so this release does not touch its pool.
  The wire step turns protection on for prod, in a call that keeps the triggers, and
  it now also runs after a failed backend deploy.
- **Local scripts:** `backend/lib/asyncLambda.ts` falls back to the prod stack's
  function names. Set `SERVICE_NAME` and `STAGE` before running a handler locally.

## Release notes

The owner runs this release. Nothing here has been run against prod. Stage `dev` is
prod and `devtest` is the dev site. Counts come from a copy of prod data taken on
2026-11-06, so they may have moved a little.

### Release steps

Before merging:

1. Pick a quiet window, with no show running and no sign-up push. Every function
   updates, and Lambda concurrency is shared with dev.

Deploying:

2. Merge PR 388. Merging deploys nothing: Deploy to Production only runs by hand.
3. Go to Actions, then Deploy to Production, then Run workflow, and pick `main`. From
   any other branch the deploy job is skipped without an error.
4. Watch the cycle check print `No dependency cycles in N root resources`. N must be
   500 or less. Above that, CloudFormation refuses the update and nothing changes.
5. If the backend step fails, the Cognito steps still run, so the triggers stay
   attached. Fix the cause and run the workflow again. If the run was cancelled, those
   steps are skipped, so run `backend/scripts/setup-cognito.sh <poolId> dev` by hand.

After the deploy:

6. Read the pool with `aws cognito-idp describe-user-pool`. It should show PreSignUp,
   PostConfirmation and `DeletionProtection: ACTIVE`. The pool id is the
   `CognitoUserPoolId` output of stack `wwe-2k-league-api-dev`.
7. Smoke test signed out and as an admin: Home, Standings, Match Search, a title's
   contenders, sign-up. Reload any tabs you had open. An old tab shows an empty
   challenge opponent list until it is reloaded.
8. Within the hour, check the first expiry run, below.
9. Within 6 hours, check the first contender run, below.
10. Clear the transfer requests:

    Check the dry-run counts for anything still pending first. This deletes every row
    in that stage's transfer-requests table. It doesn't change players or send
    notifications. Run it from `backend/` with an AWS profile that works, then add
    `--confirm`:

    ```bash
    # Dry run: prints counts by status, changes nothing
    AWS_PROFILE=league-szn npm run delete-transfer-requests -- --stage dev

    # Delete
    AWS_PROFILE=league-szn npm run delete-transfer-requests -- --stage dev --confirm
    ```

### What the deploy changes in prod

- No deploy step writes to DynamoDB. The only automatic writers are the two scheduled
  functions, and they start after the deploy.
- Tables, the user pool and the images bucket change in place, with no key or name
  changes and no new index. Point-in-time recovery, deletion protection and image
  versioning come on.
- `setup-cognito.sh` moves users to Admin only with `MIGRATE_USERS_TO_ADMIN=true`, and
  the workflow doesn't set it.
- `clearAll` and `seedData` are refused on stage `dev`.
- The site sync keeps `assets/`, so open tabs can still load their old files.

### First scheduled runs on prod

**`expireChallenges`, hourly.** The first run should close about 48 stale challenges.
It moves pending challenges past 4 days to expired, and nothing else. Accepted and
scheduled challenges stay, and nobody is notified. On the copy of prod data, one run
expired 48 of 48. Its log, `/aws/lambda/wwe-2k-league-api-dev-expireChallenges`, should
show about 48 expired and 0 failed, then 0 expired on later runs.

**`recalculateContenders`, every 6 hours.** Expect visible changes on `/contenders`,
because stored rankings on prod date from April to August. The first run:

- Ranks every active title on the active season's matches. With no active season it
  does nothing.
- Takes deleted and hidden players off the lists. On the copy of prod data, a deleted
  player was #1 for two titles, though the page already leaves those rows out.
- Drops anyone under 3 season matches, so a title can show fewer than 10 contenders.
- Removes the row of anyone who drops out, with their stored peak rank and weeks at #1.
- Shows the change from those old rankings as movement arrows, and New for anyone
  without a stored row. This is correct, but it will look like a big week.
- Counts one week at #1, and writes one history row per ranked player per title.

Its log should show `championshipsFailed` 0. On dev, 6 titles took about 1.4 seconds.
A title that fails keeps its old rankings and tries again on the next run. Rows on
inactive titles are left alone. Any result recorded after the deploy also recalculates,
so the first run may come sooner than 6 hours.

### Rollback

There is no rollback tooling. The workflow only runs `main`, so rolling back means
reverting on `main` and running it again. Keep the Retain, point-in-time recovery and
deletion protection blocks in the revert. Expired challenges and recalculated rankings
stay as they are unless restored from point-in-time recovery. Players soft-deleted
after the release look to the old code like live players with no wrestler.

### Service worker and rollback

The site installs as an app and registers a service worker, `frontend/public/sw.js`,
served at `/sw.js`. Once a browser has it, the worker stays until the browser is told
to remove it, so a rollback has to deal with it.

- **What it caches.** Page loads always go to the network first, so a stale worker
  never pins an old `index.html`: online users get whatever build is deployed, rolled
  back or not. Only when the network fails does it show `/offline.html`. Hashed files
  under `/assets/` are cached by name, which is safe because a name never changes
  content. API, Cognito, S3 images and wiki markdown are not touched.
- **Why a rollback still needs care.** A build from before this change has no `sw.js`,
  and its deploy's `--delete` sync removes ours. CloudFront then answers `/sw.js` with
  `index.html` and status 200. Browsers reject that as a worker script, so they keep the
  old worker, which keeps running against the rolled-back site. That is harmless with
  network-first pages, but it never goes away.
- **The kill switch.** `frontend/public/sw-kill.js` is published with every build at
  `/sw-kill.js` and is not registered by anything. Deployed as `/sw.js`, it deletes
  every cache and unregisters itself on each browser's next visit. After rolling back to
  a build without a service worker, keep it there:

  ```bash
  # Prod. Use dev.leagueszn.jpdxsolo.com for dev. Get sw-kill.js from any build of
  # this change (frontend/public/sw-kill.js) if the rolled-back dist lacks it.
  aws s3 cp frontend/public/sw-kill.js s3://leagueszn.jpdxsolo.com/sw.js \
    --cache-control "no-cache" --content-type "application/javascript" \
    --profile league-szn
  aws cloudfront create-invalidation --distribution-id <id> --paths "/sw.js"
  ```

  The next deploy from an old build deletes it again (`--delete`), so repeat this after
  each such deploy until the service worker is back on `main`.
- **Rolling back to a build that has a service worker** needs nothing special. To force
  every browser to drop its caches, bump `CACHE_VERSION` in `sw.js`.
- **Deploy headers.** `sw.js`, `sw-kill.js` and `manifest.webmanifest` are uploaded with
  `no-cache` and explicit content types after the main sync, in both workflows.

### Optional one-off jobs

None of these blocks the release. Each one writes to prod, so each is the owner's call.

- **32 blank names.** These players have no name or PSN ID, all at 0-0-0 and all with a
  linked account. 27 show on public lists. New accounts can't end up this way, and
  staff lists show them as unnamed. The job would fill name and PSN ID from Cognito,
  falling back to `Player <first 8 of the id>`, never the email. No script exists yet.
  It needs a dry run first and can't be tested on dev, whose Cognito users don't match
  these rows.
- **31 deleted names.** These ids are gone from the Players table but appear in 200
  matches, 7 title reigns and one tournament win. They read Former member, so no job is
  needed for the site to work. Restoring real names means writing soft-deleted rows.
  Names can only come from a point-in-time restore, if its window still covers the
  deletion, or from the owner. Five ids have a name on a match slot. The top four cover
  128 of 219 appearances, so naming those clears most of it. 52 stale scheduled matches
  touch these ids and could be closed at the same time.
- **Image resizing.** The biggest speed win left: `/championships` loads about 20 MB
  for 8 images. The job would re-encode `wrestlers/`, `championships/`, `factions/` and
  `shows/` to about 800 px, with long cache headers, under the same keys so stored URLs
  stay valid. Six title images went from 16.54 MB to 0.54 MB as WebP in a trial. WebP
  under a `.png` key needs its content type set, and animated GIFs should be skipped.
  Run it after the deploy, because versioning then keeps the originals for 90 days. Dev
  reads the same objects, so it can't be trialled there. New uploads are still not
  resized, so this also needs a resize step in the upload path.

### Ranking and transfer changes

- **Contender rankings:** a scheduled function recalculates every active title every 6
  hours, with the default settings (3 minimum matches, 10 contenders) and active
  overrides. The Contender Config screen and its Recalculate button are gone.
  `POST /admin/contenders/recalculate` stays for emergencies. Custom settings sent there
  last only until the next job or recorded match.
- **Ranking writes:** new rankings replace old ones row by row, and only afterwards are
  dropped players removed. A failed title keeps its rankings and the other titles still
  save. A partly failed recalculation reports which titles failed.
- **Ranking counters:** `weeksAtTop` counts weeks rather than runs. An unchanged rank
  keeps its last movement arrow, so the job doesn't reset arrows to zero. The New badge
  clears at the next run, so within 6 hours.
- **Transfers off:** `POST /transfers` returns 403 while the `transfers` flag is off. A
  missing key means off, so prod needs no data change. Admins can still list and review
  existing requests through the API only: the admin tab is gated by the same flag, so it
  disappears on deploy. Reaching a pending request in the UI means turning the flag on,
  which also reopens `POST /transfers` to everyone.

### Decisions taken

These were conservative defaults, chosen so the work could continue. Each is simple to
change.

- Call-outs still create challenges and need an opponent and match type. They can put a
  title on the line, but only one the challenge can decide.
- A title match from a challenge must include the current champion, at booking and when
  the result is recorded. A vacant title and a draw are fine. If the title moved, staff
  edit the match or make it non-title.
- Title matches staff book directly are not held to this, even if the holder changes
  later. The result still crowns the winner, so staff need to check who holds the title.
- A challenge whose title was deleted books as a non-title match.
- Deleted players stay as hidden rows, so history keeps their names. Players deleted
  before this release read Former member.
- Contender rankings are automatic, with overrides as the only manual control. An
  override is not rank movement.
- Transfers stay off. Staff make division moves.
- Rivalry Notes & Plans are shared by the rivals and GMs.
- Moderators don't manage users. Navigation hides what the API refuses.
- Season and title deletes stay available to Admin and Moderator.
- PSN IDs are unchanged.
- Stored announcements keep their old inline styling. Only new ones use the new markup.

For the owner to decide:

- Whether the FAQ's "where did the sidebar and Match Card Builder go" entries stay.
- Whether hidden players' gamertags stay on match cards.
- Whether the Transfers admin tab should show while the flag is off.

### Known open items

Security:

- Removing credentials from tracked files doesn't clean git history, and the repository
  is public. Confirm the admin password has been changed.
- Uploads still need a server-side size limit, and stored image URLs a host check.

Data and rankings:

- Soft-deleted players still read Unknown on challenge pages and faction promos,
  schedule and stats.
- A contender pushed off the list by an override loses their stored row, and with it
  peak rank and weeks at #1.
- An override that expires on its own still counts as movement on the next run.
- Overlapping recalculations can overwrite newer ranks. The next run repairs it.
- A week spanning 1 January counts as two for `weeksAtTop`.
- A match scheduled on an earlier day than a reign but recorded after it skips the
  defense decrement when deleted.
- Deleting a match can leave a dead card when it was added with no event id. Staff can
  clear it with Remove from card.
- Stored stable and tag team win counters are still written but no longer shown.

Pages:

- Challenges posted before a player became hidden still appear on public reads. New ones
  are refused.
- `GET /challenges/{id}` still returns a lapsed challenge by direct link, the same way an
  archived promo stays reachable by link.
- Home and Events can show old events as current, because event statuses are never
  closed. This needs a rule for how long an event counts as live.
- A booked call-out whose match was deleted can be rebooked from the Promos row only.
  The Call-outs view offers Schedule on accepted challenges, and the detail page keeps a
  link to the deleted match.
- The Call-outs view lists tag challenges by player, not team name.
- Deleting a title doesn't warn about open challenges.
- The staff check-in roster leaves out players with no wrestler who haven't checked in.
- `/contenders/my-status` is an unlinked placeholder that anyone can open.
- Long usernames still split on the Stats podiums at 320.
- Events Calendar's Show more loses focus on the last page.
- Standalone Matches reloads its lists about 3 seconds after opening, so a click at that
  moment can miss. The cause isn't traced.
- Schedule Match once came back blank during a burst of 500s. It hasn't reproduced.

German:

- Text from the API, such as awards and activity summaries, stays English. Fixing it
  needs a locale contract between API and frontend.
- Dates follow the browser language, not the language chosen in the app.
- The New Features announcement is stored content, so it stays English.
- The access denied message in the wiki uses formal Sie.

Dev site:

- Disposable `qa-*` accounts on the devtest pool, and the data QA created, need removing.
- QA left false movement arrows on one dev title. They clear as rankings recalculate.

## Verification

Checked on the dev environment with disposable accounts, using emulated phones and
desktop Chromium.

- Sign-up, the hidden state, the name prompt, becoming visible, signing back in.
- Invitations through accept and decline, including outsiders.
- Player saves and clears on name-only and roster-linked players.
- Role gating for guest, member, Moderator and Admin across every admin tab.
- Horizontal overflow on public routes at 320, 390 and 1440.
- Title challenges from call-out to booked match, including a stale champion refused.
- Recording results after these changes, with the recalculation that follows.
- The expiry sweep and the 4-day archive, on a copy of prod data.

Not proven on dev:

- Real phones, Safari and Firefox.
- The fixes from the last QA round, listed last under What dev QA changed, and the small
  fixes that came with them. They have unit tests but have not been deployed to dev.
- The prod deploy itself. Prod's resource count, pool settings and log groups were not
  read for this release.
