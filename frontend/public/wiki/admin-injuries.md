# Admin: Injuries

Stamina, injuries and their effect on the match sim. This page covers the GM side. For what players see, read [Stamina and Injuries](stamina-and-injuries).

## Switch it on first

Stamina and injuries sit behind the **Stamina & Injuries** feature flag, and it's **off** until you turn it on. While it's off, matches don't drain stamina, nobody rolls for injuries, nobody is blocked from bookings, and the sim ignores stamina.

1. Check the **Injury & Stamina** settings first (see below), so the first rolls use your numbers.
2. An Admin opens **Admin → Feature Management** and switches on **Stamina & Injuries**.

Switching it off again pauses everything. Nothing is deleted: stamina, open injuries and history are still there when you switch it back on.

## Injury & Stamina settings

**Admin → Injury & Stamina**. Admins can change these; Moderators can read them. Every number starts as a placeholder, so tune them to your league.

| Section | What you set |
|---------|--------------|
| **Stamina drain** | Max stamina, the stamina one singles match takes for each sim category, and how much a maxed-out Endurance stat cuts that drain (0 turns the Endurance effect off). |
| **Format multipliers** | Drain multiplier per match format: singles, tag team, multi-person, battle royal. A format that isn't listed uses 1. |
| **Injury chance by stamina** | Bands from the highest minimum stamina down to 0, each with an injury chance. A wrestler uses the first band their stamina after the match reaches. |
| **Category risk** | Multiplies the band's chance for each sim category, so hardcore or cage matches can be riskier. The chance never goes above 95%. |
| **Severity** | A weight and the min and max weeks out for Minor, Moderate and Major, plus the **low-stamina shift**: below that stamina, injuries lean towards the worse severities. |
| **Weekly recovery** | Back to full each Sunday, or a fixed amount. Also the **league time zone**, which sets when Sunday midnight is, and when the league week starts for payroll and other weekly jobs. |
| **Match sim penalties** | A competitor's rating at 0 stamina (100% at full, sliding down to this), and the extra penalty for an injured wrestler who is booked anyway. |

Two helpers sit beside the form and use the numbers on the page, saved or not:

- **Preview a match**: pick a sim category, a format, a starting stamina and an Endurance stat to see the drain, the stamina after, the injury chance and the weeks out if injured.
- **Matches until exhausted**: how many standard singles matches it takes from full stamina to reach each band.

**Save** asks you to confirm and saves a new version. New rolls use the new version; injuries already rolled keep the version they used, so an old result can always be explained. The **Version history** lists who saved each version and when. If someone else saved while you had the page open, you're asked to reload and make your changes again.

## The Injury Report

**Admin → Injury Report**, for Moderators and Admins.

**Active injuries** lists everyone who is out: the player, the severity, the source (**From a match** or **Storyline**), the return date, and what it affects: the scheduled matches they're still booked in and any title they hold.

- **Heal** ends the injury now. The player can be booked again straight away.
- **Extend** sets the injury's total length in weeks, counted from when it started. It works both ways: a lower number shortens it. The return date moves to the start of that league week.

**Roster stamina** lists every wrestler's stamina, sortable, with low stamina highlighted. **Adjust** sets a wrestler's stamina by hand.

Every action takes an optional note that only staff see. The player gets a neutral notification, and each change is kept in the injury's change log.

### Storyline injuries

A storyline injury takes a wrestler off TV for an angle. It works like a match injury: the wrestler can't be booked, gets a return date on a Sunday, and shows the public injury badge. Your note on it stays private to staff. The Admin panel doesn't have a button for adding one yet: it's added through the league API. Once it's on, it shows in the Injury Report as **Storyline**, and you heal or extend it like any other.

## Staff notices

When a wrestler is injured, or an injury is extended, every Moderator and Admin gets a notification: who is out, until when, how many scheduled matches are affected, and which title they hold. It opens the Injury Report. Nothing is cancelled automatically: you decide whether to rebook, swap someone in or keep the match.

## Booking injured wrestlers

Injured wrestlers can't be added to new matches. In **Schedule Match** and when you edit a match's participants, they show **Injured until {date}** and can't be picked. Wrestlers low on stamina show their stamina beside their name, so you can spread the work.

To book an injured wrestler anyway, for a storyline, tick **Allow injured (override)**. The match saves with a warning listing who was injured, and the override is recorded on the match. Players can never override this themselves: claiming a slot in a match and challenges are always refused while they're injured.

Scheduled matches with an injured participant on the match date show a warning banner on the event page and under **Admin → Standalone Matches**.

## Condition report

When a result is recorded, by hand or with the sim, every participant's stamina drops and they roll for an injury. Completed matches on the event page and in **Standalone Matches** show staff a **Condition report**: each wrestler's stamina before and after, their injury chance, the roll, and the result: an injury with its severity and return date, **Already injured**, or **No injury**. Players never see it, because stamina is private.

Deleting a completed match refunds the stamina it cost and ends any injury from it, unless a GM has already healed or changed that injury.

## Weekly recovery

Every Sunday at midnight in the league time zone, everyone's stamina recovers and injuries whose return date has come end. The players get a "You're cleared to compete" notification. It runs once a week; if the job was down, it catches up as soon as it's back.

## In the match sim

With the flag on, the [match sim](admin-match-simulator) lowers a competitor's rating by their stamina, from 100% at full down to the **Rating at 0 stamina** setting, and lowers it again for an injured wrestler you booked with the override. The preview shows each competitor's stamina and an **Injured** marker, for GMs only. The play-by-play may show a wrestler looking gassed or selling an injury.

If a player bought **sim interference** for the match in the shop, their rating gets the boost when you simulate it. The preview shows the boost to GMs only, and the play-by-play can add a run-in. Recording the match by hand refunds the player instead.

## The shop's injury items

With the economy on (see [Admin: Economy](admin-economy)), players can buy:

- **Injury shield**: lowers their injury chance for their next few matches. Each match uses one up.
- **Rehab**: takes time off an active injury. The return date stays on a Sunday and never ends up less than a week after the injury started. It's logged in the injury's change log.
- **Stamina top-up**: adds stamina straight away, up to the maximum.

You set their prices and effects in **Economy Settings**.
