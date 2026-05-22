# Rivalries

A **rivalry** is a long-form storyline between two wrestlers. Unlike a one-off challenge, a rivalry persists across multiple matches and weeks of storyline. The Rivalries Hub at `/rivalries` is the home for every active, archived, and pending rivalry in the league.

## Rivalry vs Challenge

| | Rivalry | Challenge |
|---|---|---|
| **Lifetime** | weeks → months | hours → days |
| **Approval** | GM review required | wrestler-to-wrestler |
| **What it tracks** | matches, promos, notes, messages | one upcoming match |
| **When to use** | a multi-match storyline beat | a single ad-hoc match |

If you want a one-and-done match, issue a **challenge**. If you want a recurring beef with character beats and a payoff match later, open a **rivalry**.

## Requesting a Rivalry

1. From the Hub, click the gold **Request a Rivalry** button.
2. **Step 1 — Who & Why:** pick your opponent from autocomplete, title the rivalry, choose an initial heat level (see below), and write a 50–1500 character pitch.
3. **Step 2 — Pitch & Plans:** flesh out a 100–3000 character storyline, optionally add up to 5 plan beats with target dates (these become **plan notes** visible only to GMs by default).
4. Submit. A GM will approve or reject within a few days.

## Heat Levels

The heat meter tells the rest of the locker room how hot the storyline is. Pick the level that matches your pitch — GMs may adjust it after approval.

| Heat | When to use |
|---|---|
| **Slow Burn** | history is building; matches are sporadic |
| **Brewing** | regular character work, no payoff yet |
| **Heated** | active main-event-tier feud |

GMs may tag a rivalry as escalating beyond your initial choice as the storyline plays out.

## Messages

The Messages tab on a rivalry's detail page is the private back-channel between you, your opponent, and the GMs:

- **Loop in opponent** (toggle on the left rail): when **off**, your messages are seen only by the assigned GMs — a "talk to the booker" channel. When **on**, your messages also go to the opposing wrestler — a "trash talk between us" channel.
- You can also override the audience on a single message via the composer toggle.
- 🔒 indicates a message is GM-only; it's not visible to your opponent.
- Polling refreshes the thread every 15 seconds while the tab is open; sent messages appear instantly with optimistic UI.

## After You Submit

Your request goes to the pending queue at `/admin/rivalries`. GMs see it and:

- **Approve** → status flips to `active`, you get a notification, and the rivalry shows up on the Hub.
- **Reject** → you get a notification with the GM's reason. You can request a different rivalry.
- **Conclude** (later) → the rivalry moves to the **Legacy Archive** tab on the Hub.

## Matches and Promos Tagged to a Rivalry

When a GM schedules a match between rivalry participants, they can tag the match to the rivalry — that match then shows up on the Match History or Future Matches tab. Promos cut by either participant can also be tagged so the storyline beats stay in one place.

If you haven't seen a match show up in the rivalry detail yet, it might simply not be tagged. Ask your GM to attach it.

## See also

- [Promos](/guide/wiki/promos)
- [Challenges](/guide/wiki/challenges)
- [Events](/guide/wiki/events)
