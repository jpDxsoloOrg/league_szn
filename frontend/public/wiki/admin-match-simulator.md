# Admin: Match Simulator

The match sim lets GMs settle a match without playing it. It reads both sides' [wrestler builds](wrestler-builds), their form and the kind of match, works out each side's chance to win, and draws a winner. Moderators and Admins can use it. Wrestlers never see a preview or the odds: they only see the result of a match you've simulated and recorded.

## Preview or simulate & record

There are two ways to use the sim:

- **Preview** shows the odds and a sample match, and records nothing. Run it as often as you like; every run draws again, so the winner can change.
- **Simulate & record** settles a scheduled match for real. The result counts exactly like one you enter by hand: records, standings, season standings, titles and tournament brackets all update.

### The Match Simulator page

Open **Admin** and choose **Match Simulator**. Pick two to four sides, add a partner to a side for a tag match, and choose a stipulation or a match type. Each wrestler can only be on one side. Select **Preview** to see the result. This page is for trying out matchups ("what if Undertaker met Edge in a cage?") and never records anything.

### On a scheduled match

Scheduled matches have **Preview** and **Simulate & record** next to the usual result form, both on the event page and under **Admin > Standalone Matches**. **Simulate & record** opens a confirmation that shows the odds first. Confirm, and the sim runs once with a fresh draw and records the winner. It can't be undone from there, so check the card first. If the match has already been settled, by hand or by another GM at the same moment, you get an error and nothing changes.

## What the GMs see and what everyone sees

The result panel shows:

- an **odds bar** with each side's chance to win
- the match's **category** (see below)
- a **★ in specialty** marker for anyone fighting in their specialty
- the **play-by-play**, revealed line by line. **Show all** skips ahead.

The odds are for GMs only. Once a simulated match is recorded, everyone sees a **Simulated** badge on it on the Matches page and the event card, and anyone can open the play-by-play and the specialty markers. The win chances stay hidden from everyone but the GMs, before and after.

## Sim categories on stipulations and match types

The sim weighs stats differently depending on the kind of match. Each stipulation and match type has a **Sim category**, set under **Admin > Match Config** (see [Match Config](admin-match-config)):

| Category | Examples | Stats that count most |
|----------|----------|-----------------------|
| **Standard** | Normal rules | Strikes and Grapple, a little ahead of Agility and Endurance |
| **High risk** | Ladder, TLC, Scaffold | Agility |
| **Technical** | Submission, I Quit, 2 out of 3 Falls | Grapple |
| **Endurance** | Iron Man, Last Man Standing | Endurance |
| **Hardcore** | Street Fight, Extreme Rules, Tables, Falls Count Anywhere | Strikes |
| **Cage** | Steel Cage, Hell in a Cell | Strikes and Grapple |

A match takes its stipulation's category first, then its match type's. If neither has one, it's **Standard**. The category also decides whose specialty applies, so set one on every stipulation you create.

## What decides the odds

Each wrestler gets a rating from:

1. **Stats**: the build's four stats, including the style bonus, weighted by the match's category. A wrestler whose build is over budget after a relegation is rated on a scaled-down copy until they re-spend.
2. **Moves**: the level of their best finisher, and the average level of their signatures.
3. **Form**: how they've done in the current season, from league points per match and the strength of the opponents they've faced. Wins over strong opponents count for more. With no active season, the sim reads their last 10 matches. A wrestler with no matches yet is rated as average.
4. **Specialty**: a 6% boost when the match's category is their specialty (3% for an All-rounder).

A side's rating is the average of its wrestlers, so a tag team with one strong and one weak member lands in between. Then the **style matchup** adds or takes away 5% for each opponent their style beats or loses to (see the circle in [Wrestler Builds](wrestler-builds)). The ratings turn into win chances that add up to 100%, and every side keeps at least a 5% chance. That floor is why upsets always stay possible.

The sim never produces a draw.

### How lopsided can it get?

From a calibration run of 10,000 sims per scenario:

- A fully spent Heavyweight build against a brand-new default build wins about **83%** of the time, and about **90%** when it's also in its specialty and has the style edge. Never 100%.
- A style edge alone, between two otherwise equal wrestlers, is about **57 to 43**.
- Fighting in your specialty, against the same build without it, is worth about **5 points** (55 to 45). For an All-rounder it's about half that.
- Across the seeded roster, the favourite wins about 61% of random pairings. The bigger the gap in ratings, the more often the favourite wins, and the odds the panel shows match how often it really happens.

## Seeds and replays

Every sim starts from a random **seed**. The same seed with the same inputs always gives the same winner and the same play-by-play. When you record a sim, the match stores the seed, the odds, the play-by-play, a fingerprint of the inputs and the version of the sim rules, so a result can always be explained later, even after builds change. When the league changes the sim's numbers, the rules version goes up and older results keep the version they were decided under.

A preview draws a new seed every time, which is why two previews of the same match can end differently.

## Good to know

- Only scheduled matches can be simulated and recorded.
- Simulated matches start with no star ratings. Fans can rate them like any other match.
- The sim uses builds as they are when it runs. If a wrestler changes their build afterwards, a recorded result doesn't change.
- There is no public "what if?" page. Previews exist only in the Admin panel and on scheduled matches for GMs.
