# Admin: Rivalries Moderation

The Rivalries admin tab at `/admin/rivalries` is the GM control surface for the long-form storyline feature. This article covers when to approve, how to write notes vs plans, how to schedule rivalry matches, and how to clean up.

> **Spoiler-safety note.** Plan notes default to `gm-only` visibility for good reason — they describe future storyline beats. If you publish a plan to `participants` or `all`, every wrestler will see it. The data model enforces this server-side, but a sloppy click on the visibility dropdown can still spoil a finish. Double-check before saving.

## Triage Workflow

1. Open `/admin/rivalries` and select the **Pending** chip.
2. For each row, decide:
   - **Approve** if the pitch is on-brand, both wrestlers are reasonable picks, and the storyline doesn't conflict with another booked angle.
   - **Reject** with a short reason — wrestlers see the reason in their notification. Reasons can be as simple as "Saving this for after the title program" or "Conflicts with active stable feud."
3. After approval, the rivalry shows up in the public Hub. Status is `active`.

A good rule of thumb: approve no more than 3 active rivalries per wrestler at once. The Hub will get crowded otherwise.

## Storyline Notes vs Plans

Both note types live on the **Notes & Plans** tab of a rivalry's detail page, but they serve very different purposes:

| Note type | Audience | Use for |
|---|---|---|
| **Storyline** | optional — `all`, `participants`, or `gm-only` | what HAS happened so far on screen (continuity record) |
| **Plan** | defaults to `gm-only` | what WILL happen — future beats, target events, finishes |

**Visibility rules** (server-side enforced):

- Wrestlers can author `storyline` notes; their visibility is always forced to `gm-only` (treated as a suggestion to you).
- Wrestlers attempting to author a `plan` are rejected with a 403. Plans are GM-only.
- Wrestlers cannot see another wrestler's `gm-only` storyline notes. They can see their own.
- Wrestlers never see a `plan` unless its visibility is explicitly set to `participants` or `all`.

When you set a plan's visibility to `participants`, the wrestlers can read it — useful for telling them "Match 3 is when you win" without making it public. Set it to `all` only for plans you want visible from the wrestler's public Hub.

## Linking Plans to Matches and Events

When creating a plan, you can attach a `linkedMatchId` or `linkedEventId`. The Notes & Plans tab will render a small badge that deep-links to that match or event. If the linked record is later deleted, the badge renders with strikethrough — the page does not 404.

This is mainly useful for "Plan A → ladder match at PPV-3" so the booking is visible from inside the rivalry detail.

## Scheduling Matches Against a Rivalry

Two options:

1. **Schedule from the Future Matches tab** — quickest path. Brings up the schedule-match form pre-populated with the rivalry's participants. The new match is auto-tagged.
2. **Tag an existing match** — when scheduling any match via the regular admin schedule flow, set the optional `rivalryId` field. The backend validates that both match participants are in the rivalry.

Matches scheduled before RIV-06 won't have a `rivalryId` and will be picked up by the participant-overlap fallback. New work should always set the field.

## When to Conclude

Conclude a rivalry when the storyline has had its payoff match and you don't intend to revisit it for at least a season. Concluded rivalries:

- Move to the **Legacy Archive** tab on the public Hub.
- Stop appearing in the participant's "My Rivalries" tab by default.
- Are still queryable by historians.

Wrestlers get a notification when you conclude. The conclude modal accepts an optional closing note — use this to record "Decided at WrestleMania 40 — Cena retires Punk" so the archive isn't faceless.

## Heat is Driven by Match Ratings

Each rivalry has a **heat** tier (Frozen → Cold → Warm → Hot → Scorching) that lives on the rivalry card and detail page. As of Wave 3, heat is no longer set by hand: it is recomputed automatically from user star ratings of the rivalry's matches.

You can still manually override a rivalry's heat from the admin row, but the next rating submitted against any of its matches will overwrite your override. Use the **Recompute from ratings** button to force a fresh calculation immediately. See [How rivalry heat works](/guide/wiki/rivalry-heat-explained) for the full formula and tier thresholds.

## Bulk Cleanup

The **Clear resolved** button hard-deletes every rivalry with status `completed`, `rejected`, or `cancelled`. Use this when the archive has accumulated test records or noise. The confirmation modal shows the exact count.

This is destructive — there is no undo. If you accidentally cleared production history, you'll need to restore from the most recent DynamoDB backup.

## See also

- [Manage Promos](/guide/wiki/admin-promos)
- [Challenges](/guide/wiki/admin-challenges)
- [Storyline Requests](/guide/wiki/admin-quickstart)
