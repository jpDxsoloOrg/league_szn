# Admin: Rivalries Moderation

**Admin → Rivalries** is the GM control page for long-running storylines. This article covers how rivalries start, how to write notes and plans, how matches get linked, and how to clean up. Moderators and Admins can use everything here except **Heat Tunables**, which is for full Admins.

The **Notes & Plans** tab is where the two rivals and the GMs plan the storyline together. Everything saved there, plans included, is shared between them.

## Starting a Rivalry

Only staff can open a rivalry. Wrestlers who want one can pitch it from their profile, and those pitches arrive under **Admin → Storyline Requests**, where you **Acknowledge** or **Decline** them. A GM note is required to decline.

1. Go to **Storylines → Rivalries** and click **Request a Rivalry** (only staff see this button)
2. Pick two wrestlers, and which wrestler each player is using
3. Give it a title and starting heat, add a storyline pitch, and add any plans
4. Save. The rivalry goes live straight away, with you as the booker

A good rule of thumb: no more than 3 active rivalries per wrestler at once, or the Hub gets crowded.

On the rivalry page, staff can take or clear the booker credit with **I'll book this**, **Take over booking** or **Clear booker**.

## Pending Rivalries

New rivalries skip review, so the **Pending review** filter normally stays empty. If an older rivalry is still there, use **Approve** or **Reject** on its row. A rejection needs a reason, and the participants get a notification either way.

## Storyline Notes vs Plans

Both note types live on the **Notes & Plans** tab of a rivalry's page. Only the rivals and GMs can open that tab.

| Note type | Who can write it | Use for |
|---|---|---|
| **Storyline** | Rivals and GMs | What HAS happened so far on screen (continuity record) |
| **Plan** | GMs only | What WILL happen, with an optional **Scheduled for** date |

Both rivals and all GMs can read notes and plans. Wrestlers can edit and delete their own notes; GMs can edit and delete any note.

## Scheduling Matches Against a Rivalry

Schedule the match as normal with [Schedule Match](admin-schedule-match) or **Add Match** on an event. If everyone in an active rivalry is in the match and only one rivalry fits, the match is linked automatically. If not, it still shows on the **Future Matches** and **Match History** tabs when the rivals meet during the rivalry.

## When to Conclude

Click **Conclude** when the storyline has had its payoff match and you don't intend to revisit it for at least a season. Concluded rivalries move to the **Legacy Archive** tab on the public Hub, and the participants get a notification.

The conclude dialog takes an optional closing note. Use it to record something like "Decided at WrestleMania 40: Cena retires Punk", so the archive has some context.

## Heat

Each rivalry has a **heat** tier (Frozen, Cold, Warm, Hot, Scorching) shown on its card and page. The site works it out from star ratings of the rivalry's matches and from reactions to its promos.

You can still set the tier by hand with **Heat** on a row, but the next rating or qualifying reaction overwrites it. **Recompute from ratings** in the same dialog forces a fresh calculation straight away. See [How rivalry heat works](/guide/wiki/rivalry-heat-explained) for the full formula and tier thresholds.

A full Admin can tune the formula under **Heat Tunables**.

## Bulk Cleanup

**Clear resolved** permanently deletes the Concluded, Rejected and Cancelled rivalries in the list. Use this when the archive has built up test records or noise. The confirmation dialog shows the exact count.

There is no undo. **Delete** on a row removes a single rivalry the same way.

## See also

- [Manage Promos](/guide/wiki/admin-promos)
- [Challenges](/guide/wiki/admin-challenges)
