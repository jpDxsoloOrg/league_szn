# Strikes

Strikes live on each player's record. Open them from [Manage Players](admin-manage-players) with the **Discipline** button on the player's row. Admins can act on a record. Moderators can read it, so they can book correctly.

## The Rules

| Strike | Effect |
|--------|--------|
| First | 7-day warning |
| Second | Sign-ups blocked for 7 days, and strikes stay for 14 days from this strike |
| Third, at any point in those 14 days | Account deactivated until an Admin reactivates it |

Days are 24 hours from the exact strike time, so a window can end at any hour. Nothing runs at the end of a window: the status is worked out from the strike dates each time it's read.

## Issuing a Strike

1. Open the player's **Discipline** record
2. Write a reason of 3 to 500 characters. **The player reads this**, so word it with that in mind
3. Check the button, which states what will happen: **Issue warning**, **Issue second strike** or **Deactivate account**
4. Submit. A deactivation asks you to confirm first and lists what the player still holds

If the record changed while you had it open, nothing is written. The dialog reloads, so read the new state and try again.

Admins and Moderators can't receive strikes. Remove the role in [User Management](admin-user-management) first.

A second or third strike also clears the player's queue spot, online presence, pending invitations, and pending or countered challenges. **Matches they're booked in stay as they are.**

## After a Deactivation

The player loses access at once. They stay on existing records, and nothing they hold changes on its own. The dialog lists what's left for you to handle:

- **Titles** stay with the player. Vacate them under [Championships](admin-championships) if you want to. On a tag title, that also takes it from the partner.
- **Scheduled and open matches** stay on the card. Swap the player out, or record the result as usual.
- **Accepted challenges** can be cancelled under **Admin → Promos**, on the **Call-outs** tab. See [Challenges](admin-challenges).
- **Tournaments** keep the player entered. You can still book their tournament matches, and the booking screen says so. Record each one as a forfeit by clicking **Record Result** on the match and picking the opponent as winner, so the tournament can finish. The button is on the event card, or under **Admin → Standalone Matches**. See [Recording Results](admin-record-results).

A deactivated player can't be added to any other booking. Their tag team stays active but leaves public lists. The partner can dissolve it and form a new one.

Deactivated players are hidden from the **Manage Players** table until you tick **Show hidden**.

## Removing a Strike

Use **Remove** on an active strike, with a reason. It stays in the history as cleared. The rest of the strikes are replayed from their own dates:

- Remove the only strike, and the player is clear
- Remove the first of two, and the second becomes a 7-day warning from its own date
- Remove the second of two, and the first resumes its own 7 days, or is gone if those have passed

Removing a strike doesn't bring back anything it cleared. You can't remove a strike that has lapsed, or any strike while the player is deactivated.

## Reactivating a Player

1. Open the record and write a reason
2. Tick **Restore earlier strikes** only if the last strike was a mistake. Then only that strike is cleared, and the others keep their own dates. Leave it unticked to clear all active strikes
3. Click **Reactivate**

The form shows what the player still holds, because staff may have moved things in the meantime. Their standings, record, wrestler and check-ins return. Their queue spot, invitations and cancelled challenges don't. The player logs in again to continue.

## When a Login Doesn't Match

The record decides access. The login in Cognito is a second layer, and changing it can fail after the record is saved:

- **Login could not be changed**: fix it in [User Management](admin-user-management). Until then, the player's requests are still refused.
- **The login doesn't match the record**: the dialog warns whenever a deactivated player has an enabled login, or a player who isn't deactivated has a disabled one. Use the same page to fix it. A login can always be disabled, and can be enabled once the player is reactivated.
- **No linked login**: the player has no account to change, so only the record applies.
- **Login was already disabled**: reactivating leaves it disabled. Enable it in [User Management](admin-user-management) if you want to.
- **Cleanup did not finish**: some queue or challenge entries may remain. The player is still refused and hidden from those listings.
