# User Management

The **User Management** page is where a full Admin manages accounts and roles. Moderators can't open it.

## User Roles

| Role | What it gives |
|------|---------------|
| **Admin** | Everything, including the four Admin-only pages: User Management, Feature Management, Heat Tunables and the Danger Zone |
| **Moderator** | Every other Admin page, such as players, matches, events, championships, seasons, promos and rivalries |
| **Wrestler** | The personal pages under **Me**: profile, Call-outs, My Videos, and faction and tag team pages |

A Moderator also can't do these jobs, which are for full Admins only:

- Delete a tag team or faction
- Dissolve a tag team or disband a faction from the Admin pages
- Expire or delete a call-out, or use **Clear Resolved**

Everyone gets the **Wrestler** role and a player record automatically when they sign up.

## Finding Users

The list loads every account at once and shows 50 per page. Use **Previous** and **Next** under the table to move between pages.

- **Tabs** narrow the list to All Users, Wrestlers, Admins & Moderators, No Role or Disabled. Each tab shows how many accounts it holds.
- **Search** matches the player name, account name, email, PSN ID and wrestler name.
- **Sorting** by User, Roles, Status or Joined covers every matching account, not just the page you're on.

Each row shows the user (name, email and PSN ID), their roles, whether they can sign in, and when they joined.

## Assigning Roles

1. Go to **User Management**
2. Find the user
3. Click **Manage**
4. Use the role buttons, such as **Make Wrestler**, **Make Moderator**, **Make Admin** or **Remove Wrestler**
5. Changes save straight away

Users must have an account before you can give them a role. Removing the Wrestler role takes the player off the standings and dashboard.

## Bulk Actions

Tick the box at the start of a row to select it, or use **Select all N shown** to select every account the current tab and search show, on every page. The bar above the table shows how many are selected.

- **Enable login** and **Disable login**
- **Add role** and **Remove role** for the role picked next to them: Wrestler, or Moderator for full Admins. Admin is given and taken one account at a time, from **Manage**
- **Delete accounts**, after you type **DELETE** to confirm

Every action asks for confirmation first. Each account gets the same checks as when you change it on its own, so an enabled account isn't deleted and a deactivated player's login isn't turned back on. Your own account is always skipped for disable, delete and remove role.

When it finishes, a message says how many worked. Accounts that couldn't be changed stay selected, with the reason listed, so you can look at them or try again.

## Wrestlers and Divisions

User Management deals with accounts and roles. To assign a wrestler or a division, use [Manage Players](admin-manage-players).

## Disabling and Deleting Accounts

In the **Manage** dialog, **Disable** stops the account signing in. **Enable** reverses it.

A player deactivated by a third strike can't be enabled here, and an account whose player has active strikes can't be deleted. Reactivate the player or wait for the strikes to end first. See [Strikes](admin-strikes).

An account must be disabled before **Delete** appears. Deleting is permanent and removes the login only. The player record stays, so use [Manage Players](admin-manage-players) if you want the player removed too.

## Sync Wrestler Roles

**Sync Wrestler Roles** matches every player to their account's role, then reports how many were shown, hidden or unchanged. It is safe to run again. You only need it if the standings seem to disagree with who has the Wrestler role.
