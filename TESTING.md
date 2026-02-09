# Manual Testing Guide

This document provides step-by-step manual testing instructions for the WWE 2K League Management System. Tests are grouped by feature and cover full CRUD operations, role-based access control, and edge cases.

## Table of Contents

- [Test Environments](#test-environments)
- [Test Accounts & Roles](#test-accounts--roles)
- [Prerequisites](#prerequisites)
- [1. Authentication & Authorization](#1-authentication--authorization)
- [2. Players](#2-players)
- [3. Divisions](#3-divisions)
- [4. Seasons](#4-seasons)
- [5. Championships](#5-championships)
- [6. Matches](#6-matches)
- [7. Tournaments](#7-tournaments)
- [8. Events](#8-events)
- [9. Standings & Statistics](#9-standings--statistics)
- [10. Contender Rankings](#10-contender-rankings)
- [11. Challenges](#11-challenges)
- [12. Promos](#12-promos)
- [13. Fantasy League](#13-fantasy-league)
- [14. Feature Toggles](#14-feature-toggles)
- [15. User Management](#15-user-management)
- [16. Admin Utilities (Danger Zone)](#16-admin-utilities-danger-zone)
- [17. Image Uploads](#17-image-uploads)
- [18. Internationalization](#18-internationalization)

---

## Test Environments

| Environment | Frontend URL | API URL |
|---|---|---|
| Local | http://localhost:3000 | http://localhost:3001/dev |
| Dev | http://dev.leagueszn.jpdxsolo.com | https://dgsmskbzb2.execute-api.us-east-1.amazonaws.com/devtest |
| Production | http://leagueszn.jpdxsolo.com | https://9pcccl0caj.execute-api.us-east-1.amazonaws.com/dev |

---

## Test Accounts & Roles

You need accounts for each role to fully test the application. Create them via the Admin user management panel.

| Role | Capabilities | How to Create |
|---|---|---|
| **Admin (Super Admin)** | Full access to everything including user management and data wipe | Initial setup via `POST /auth/setup` or local dev default: `admin` / `FireGreen48!` |
| **Moderator** | Same as Admin except cannot manage Admin/Mod roles or clear all data | Admin promotes a user to Moderator via `/admin/users` |
| **Wrestler** | Can manage own profile, issue challenges, create promos | Admin promotes a user to Wrestler via `/admin/users` (auto-creates linked player) |
| **Fantasy** | Can make fantasy picks and view fantasy leaderboard | Admin promotes a user to Fantasy via `/admin/users` (Wrestlers get this automatically) |
| **Unauthenticated** | View-only access to public pages | No account needed |

**Tip:** For thorough testing, prepare at least 5 accounts — one for each role above.

---

## Prerequisites

Before starting manual tests:

1. Ensure the environment is running (local: DynamoDB + backend + frontend)
2. Seed sample data if starting fresh: `cd backend && npm run seed`
3. Log in to each test account in separate browser profiles or incognito windows
4. Keep browser DevTools open (Console and Network tabs) to catch errors

---

## 1. Authentication & Authorization

### 1.1 Login

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/login` | Login form is displayed |
| 2 | Enter valid admin credentials and submit | Redirected to admin panel; JWT token stored |
| 3 | Enter invalid password and submit | Error message displayed; not redirected |
| 4 | Enter non-existent username and submit | Error message displayed |
| 5 | Leave fields blank and submit | Validation prevents submission |

### 1.2 Signup

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/signup` | Registration form is displayed |
| 2 | Fill in valid details and submit | Account created; confirmation flow initiated |
| 3 | Try to register with an existing username | Error message shown |
| 4 | Try to register with a weak password | Error message about password requirements |

### 1.3 Session Management

| # | Step | Expected Result |
|---|---|---|
| 1 | Log in and note the session | User stays logged in across page refreshes |
| 2 | Wait for token to expire (24h) or manually clear storage | User is redirected to login on next protected action |
| 3 | Log out | Session cleared; redirected to public page |

### 1.4 Route Protection — Role-Based Access

| # | Action | Admin | Moderator | Wrestler | Fantasy | Unauthenticated |
|---|---|---|---|---|---|---|
| 1 | Navigate to `/` (Standings) | Allowed | Allowed | Allowed | Allowed | Allowed |
| 2 | Navigate to `/championships` | Allowed | Allowed | Allowed | Allowed | Allowed |
| 3 | Navigate to `/matches` | Allowed | Allowed | Allowed | Allowed | Allowed |
| 4 | Navigate to `/tournaments` | Allowed | Allowed | Allowed | Allowed | Allowed |
| 5 | Navigate to `/events` | Allowed | Allowed | Allowed | Allowed | Allowed |
| 6 | Navigate to `/admin` | Allowed | Allowed | Blocked | Blocked | Redirected to login |
| 7 | Navigate to `/admin/players` | Allowed | Allowed | Blocked | Blocked | Redirected to login |
| 8 | Navigate to `/admin/users` | Allowed | Blocked | Blocked | Blocked | Redirected to login |
| 9 | Navigate to `/admin/danger-zone` | Allowed | Allowed | Blocked | Blocked | Redirected to login |
| 10 | Navigate to `/profile` | Allowed | Allowed | Allowed | Blocked | Redirected to login |
| 11 | Navigate to `/challenges/issue` | Allowed | Allowed | Allowed | Blocked | Redirected to login |
| 12 | Navigate to `/promos/new` | Allowed | Allowed | Allowed | Blocked | Redirected to login |
| 13 | Navigate to `/fantasy/dashboard` | Allowed | Blocked | Blocked | Allowed | Redirected to login |

---

## 2. Players

### 2.1 Create Player (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Log in as Admin and navigate to `/admin/players` | Player management page loads |
| 2 | Click "Add Player" or equivalent button | Create player form appears |
| 3 | Enter player name and current wrestler | Fields accept input |
| 4 | Optionally assign a division from dropdown | Division options populate from existing divisions |
| 5 | Optionally upload a player image | Image preview shown |
| 6 | Submit the form | Player created; appears in the player list |
| 7 | Verify player appears on public standings page `/` | Player shows with 0-0-0 record |

### 2.2 Read Players (All Roles)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/` (Standings) as unauthenticated user | All players displayed with W-L-D records |
| 2 | Verify player details: name, wrestler, record, division | All data shown correctly |
| 3 | Check that standings are sorted by wins (descending) | Order is correct |
| 4 | If seasons exist, toggle between all-time and season standings | Both views render correctly |

### 2.3 Update Player (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Log in as Admin and navigate to `/admin/players` | Player list loads |
| 2 | Click edit on an existing player | Edit form pre-populated with current data |
| 3 | Change the player's name | Field updates |
| 4 | Change the current wrestler | Field updates |
| 5 | Change the player's division | Division dropdown updates |
| 6 | Upload a new player image | New image preview shown |
| 7 | Submit the form | Player updated; changes reflected in list |
| 8 | Verify changes on the public standings page | Updated data is displayed |

### 2.4 Delete Player (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Log in as Admin and navigate to `/admin/players` | Player list loads |
| 2 | Click delete on a player who does NOT hold a championship | Confirmation dialog appears |
| 3 | Confirm deletion | Player removed from list |
| 4 | Verify player no longer appears on standings page | Player is gone |
| 5 | Try to delete a player who holds an active championship | Error message: cannot delete player with active championship |

### 2.5 Wrestler Own Profile (Wrestler Role)

| # | Step | Expected Result |
|---|---|---|
| 1 | Log in as a Wrestler and navigate to `/profile` | Own player profile loads with current data |
| 2 | Update wrestler name or bio | Fields accept changes |
| 3 | Submit the form | Profile updated successfully |
| 4 | Verify updated info reflects on public pages | Changes visible |
| 5 | Confirm the Wrestler cannot edit other players' profiles | No option to edit others |

### 2.6 Players — Role Access

| Action | Admin | Moderator | Wrestler | Fantasy | Unauth |
|---|---|---|---|---|---|
| View players (standings) | Yes | Yes | Yes | Yes | Yes |
| Create player | Yes | Yes | No | No | No |
| Edit any player | Yes | Yes | No | No | No |
| Edit own profile | Yes | Yes | Yes | No | No |
| Delete player | Yes | Yes | No | No | No |

---

## 3. Divisions

### 3.1 Create Division (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/divisions` | Division management page loads |
| 2 | Click "Add Division" | Create form appears |
| 3 | Enter division name (e.g., "Raw") and description | Fields accept input |
| 4 | Submit the form | Division created; appears in list |

### 3.2 Read Divisions (All Roles)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to a page displaying divisions (standings filters, player forms) | Division names appear in dropdowns/filters |
| 2 | Verify all created divisions are listed | Complete list shown |

### 3.3 Update Division (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/divisions` | Division list loads |
| 2 | Click edit on a division | Edit form pre-populated |
| 3 | Change the division name and description | Fields update |
| 4 | Submit | Division updated; changes reflected |

### 3.4 Delete Division (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/divisions` | Division list loads |
| 2 | Delete a division with NO players assigned | Confirmation dialog; deletion succeeds |
| 3 | Verify division is removed | No longer in list |
| 4 | Try to delete a division that HAS players assigned | Error: cannot delete division with assigned players |

### 3.5 Divisions — Role Access

| Action | Admin | Moderator | Wrestler | Fantasy | Unauth |
|---|---|---|---|---|---|
| View divisions | Yes | Yes | Yes | Yes | Yes |
| Create division | Yes | Yes | No | No | No |
| Edit division | Yes | Yes | No | No | No |
| Delete division | Yes | Yes | No | No | No |

---

## 4. Seasons

### 4.1 Create Season (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/seasons` | Season management page loads |
| 2 | Click "Create Season" | Create form appears |
| 3 | Enter season name and start date | Fields accept input |
| 4 | Submit | Season created with "active" status |
| 5 | Verify only one season can be active at a time | If another active season exists, creation fails or previous is ended |

### 4.2 Read Seasons (All Roles)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/` (Standings) | Season dropdown/filter is visible |
| 2 | Select a season from the dropdown | Standings update to show season-specific W-L-D |
| 3 | Select "All Time" | Standings revert to all-time records |

### 4.3 Update Season (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/seasons` | Season list loads |
| 2 | Click edit on a season | Edit form pre-populated |
| 3 | Change the season name | Field updates |
| 4 | End the season (set status to completed) | Season marked as ended; end date set |
| 5 | Verify ended season still appears in dropdown as historical | Season still selectable for viewing |

### 4.4 Delete Season (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/seasons` | Season list loads |
| 2 | Click delete on a season | Confirmation dialog appears |
| 3 | Confirm deletion | Season removed; all associated season standings also deleted (cascade) |
| 4 | Verify season no longer appears in dropdown on standings page | Season gone |

### 4.5 Seasons — Role Access

| Action | Admin | Moderator | Wrestler | Fantasy | Unauth |
|---|---|---|---|---|---|
| View seasons / season standings | Yes | Yes | Yes | Yes | Yes |
| Create season | Yes | Yes | No | No | No |
| Edit / end season | Yes | Yes | No | No | No |
| Delete season | Yes | Yes | No | No | No |

---

## 5. Championships

### 5.1 Create Championship (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/championships` | Championship management page loads |
| 2 | Click "Create Championship" | Create form appears |
| 3 | Enter championship name (e.g., "World Heavyweight Championship") | Field accepts input |
| 4 | Select type: "singles" or "tag" | Dropdown works |
| 5 | Optionally lock to a division | Division dropdown populates |
| 6 | Optionally upload championship image | Image preview shown |
| 7 | Submit | Championship created with no current champion |
| 8 | Verify championship appears on `/championships` | Title listed as vacant |

### 5.2 Read Championships (All Roles)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/championships` as unauthenticated user | All championships displayed |
| 2 | Verify each championship shows: name, type, current champion (or vacant) | Data correct |
| 3 | Click on a championship to view history | Championship history page loads with all past reigns |

### 5.3 Update Championship (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/championships` | Championship list loads |
| 2 | Click edit on a championship | Edit form pre-populated |
| 3 | Change the championship name | Field updates |
| 4 | Change the division lock | Dropdown updates |
| 5 | Upload a new image | New preview shown |
| 6 | Submit | Championship updated |

### 5.4 Vacate Championship (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/championships` | Championship list loads |
| 2 | Find a championship with an active champion | Champion name displayed |
| 3 | Click "Vacate" | Confirmation dialog appears |
| 4 | Confirm | Championship now shows as vacant |
| 5 | Verify on `/championships` public page | Champion field shows "Vacant" |
| 6 | Check championship history page | Previous reign shows end date |

### 5.5 Delete Championship (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/championships` | Championship list loads |
| 2 | Click delete on a championship | Confirmation dialog appears |
| 3 | Confirm deletion | Championship removed; all championship history also deleted (cascade) |
| 4 | Verify championship no longer appears on `/championships` | Title gone |

### 5.6 Championships — Role Access

| Action | Admin | Moderator | Wrestler | Fantasy | Unauth |
|---|---|---|---|---|---|
| View championships | Yes | Yes | Yes | Yes | Yes |
| View championship history | Yes | Yes | Yes | Yes | Yes |
| Create championship | Yes | Yes | No | No | No |
| Edit championship | Yes | Yes | No | No | No |
| Vacate championship | Yes | Yes | No | No | No |
| Delete championship | Yes | Yes | No | No | No |

---

## 6. Matches

### 6.1 Schedule Match (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/matches` | Match scheduling page loads |
| 2 | Select match date and time | Date picker works |
| 3 | Select match type (singles, tag team, etc.) | Dropdown works |
| 4 | Select stipulation (standard, no DQ, cage, ladder, hell in a cell, etc.) | Dropdown works |
| 5 | Select participants from player list | Player picker works |
| 6 | Optionally mark as championship match and select championship | Championship dropdown appears |
| 7 | Optionally assign to a tournament | Tournament dropdown appears |
| 8 | Optionally assign to a season | Season dropdown appears |
| 9 | Optionally assign to an event | Event dropdown appears |
| 10 | Submit | Match created with status "scheduled" |
| 11 | Verify match appears on `/matches` page | Match listed under scheduled matches |

### 6.2 Read Matches (All Roles)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/matches` as unauthenticated user | Matches page loads |
| 2 | View scheduled matches | Shows date, participants, match type, stipulation |
| 3 | View completed matches | Shows winners, losers, results |
| 4 | Filter matches by status (scheduled/completed) | Filter works correctly |

### 6.3 Record Match Result (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/results` | Result recording page loads |
| 2 | Select a scheduled match | Match details shown |
| 3 | Select winners and losers | Participant selection works |
| 4 | Submit result | Match marked as "completed" |
| 5 | Verify on `/matches` that the match is now completed | Result displayed |
| 6 | Verify standings updated on `/` | Winner's wins +1, loser's losses +1 |
| 7 | If championship match: verify champion updated on `/championships` | New champion shown (or defense recorded) |
| 8 | If tournament match: verify bracket/standings updated on `/tournaments` | Bracket advances or points added |
| 9 | If season match: verify season standings updated | Season W-L-D updated |
| 10 | If event match: check if event auto-completes when all matches finish | Event status changes to "completed" |

### 6.4 Record a Draw

| # | Step | Expected Result |
|---|---|---|
| 1 | Schedule a match between two players | Match created |
| 2 | Record result as a draw (both players marked in both winners and losers, or dedicated draw option) | Match completed as draw |
| 3 | Verify both players get +1 draw on standings | Draws column updates |

### 6.5 Championship Match — Title Change

| # | Step | Expected Result |
|---|---|---|
| 1 | Schedule a championship match between the current champion and a challenger | Match created with championship flag |
| 2 | Record the challenger as the winner | Match completed |
| 3 | Verify championship page shows new champion | Title holder updated |
| 4 | Verify championship history: previous reign ended, new reign started | History table updated |

### 6.6 Championship Match — Successful Defense

| # | Step | Expected Result |
|---|---|---|
| 1 | Schedule a championship match with the current champion | Match created |
| 2 | Record the champion as the winner | Match completed |
| 3 | Verify champion retains on `/championships` | Same champion shown |
| 4 | Verify championship history: defense count incremented | Defenses +1 |

### 6.7 Matches — Role Access

| Action | Admin | Moderator | Wrestler | Fantasy | Unauth |
|---|---|---|---|---|---|
| View matches | Yes | Yes | Yes | Yes | Yes |
| Schedule match | Yes | Yes | No | No | No |
| Record result | Yes | Yes | No | No | No |

---

## 7. Tournaments

### 7.1 Create Single Elimination Tournament (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/tournaments` | Tournament management page loads |
| 2 | Click "Create Tournament" | Create form appears |
| 3 | Enter tournament name (e.g., "King of the Ring") | Field accepts input |
| 4 | Select type: "Single Elimination" | Type selected |
| 5 | Select participants (must be power of 2 for clean bracket: 4, 8, 16) | Participants chosen |
| 6 | Submit | Tournament created with auto-generated bracket |
| 7 | Verify tournament appears on `/tournaments` | Bracket displayed |

### 7.2 Create Round Robin Tournament (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/tournaments` | Tournament management page loads |
| 2 | Click "Create Tournament" | Create form appears |
| 3 | Enter tournament name (e.g., "G1 Climax") | Field accepts input |
| 4 | Select type: "Round Robin" | Type selected |
| 5 | Select participants | Participants chosen |
| 6 | Submit | Tournament created with standings table |
| 7 | Verify on `/tournaments` | Standings table shown (all at 0 points) |

### 7.3 Read Tournaments (All Roles)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/tournaments` as unauthenticated user | All tournaments listed |
| 2 | View single elimination tournament | Bracket displayed with matchups |
| 3 | View round robin tournament | Standings table with points |

### 7.4 Tournament Bracket Progression (Single Elimination)

| # | Step | Expected Result |
|---|---|---|
| 1 | Schedule a match assigned to the tournament (first round matchup) | Match created |
| 2 | Record the result — winner selected | Match completed |
| 3 | Verify the winner advances to the next round in the bracket | Bracket updated |
| 4 | Repeat for all first-round matches | Second round populated |
| 5 | Continue until the final | Tournament completes |
| 6 | Verify tournament shows the winner | Champion displayed |

### 7.5 Tournament Standings Update (Round Robin)

| # | Step | Expected Result |
|---|---|---|
| 1 | Schedule a match assigned to the round robin tournament | Match created |
| 2 | Record result — one winner | Match completed |
| 3 | Verify winner gets 2 points in standings | Points updated |
| 4 | Record a draw in a tournament match | Match completed |
| 5 | Verify both players get 1 point each | Points updated |
| 6 | Complete all matches in the round robin | Final standings calculated |
| 7 | Verify the player with the most points wins | Winner shown |

### 7.6 Update Tournament (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/tournaments` | Tournament list loads |
| 2 | Click edit on a tournament | Edit form pre-populated |
| 3 | Change the tournament name | Field updates |
| 4 | Submit | Tournament updated |

### 7.7 Tournaments — Role Access

| Action | Admin | Moderator | Wrestler | Fantasy | Unauth |
|---|---|---|---|---|---|
| View tournaments | Yes | Yes | Yes | Yes | Yes |
| Create tournament | Yes | Yes | No | No | No |
| Edit tournament | Yes | Yes | No | No | No |

---

## 8. Events

### 8.1 Create Event (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/events` | Event management page loads |
| 2 | Click "Create Event" | Create form appears |
| 3 | Enter event name (e.g., "WrestleMania") | Field accepts input |
| 4 | Select event type: PPV, Weekly, Special, or House show | Dropdown works |
| 5 | Set the event date | Date picker works |
| 6 | Optionally enable Fantasy for this event and set budget | Fantasy fields appear |
| 7 | Submit | Event created with "upcoming" status |
| 8 | Verify event appears on `/events` | Event listed |

### 8.2 Read Events (All Roles)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/events` as unauthenticated user | Events page loads |
| 2 | View upcoming events | Shows name, date, type, status |
| 3 | Click on an event for details | Event detail page shows match card |
| 4 | Filter events by type or status | Filters work correctly |

### 8.3 Update Event (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/events` | Event list loads |
| 2 | Click edit on an event | Edit form pre-populated |
| 3 | Change event name, date, or type | Fields update |
| 4 | Modify Fantasy settings | Settings update |
| 5 | Submit | Event updated |

### 8.4 Delete Event (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/events` | Event list loads |
| 2 | Click delete on an event | Confirmation dialog appears |
| 3 | Confirm deletion | Event removed from list |
| 4 | Verify event no longer on `/events` | Event gone |

### 8.5 Event Auto-Completion

| # | Step | Expected Result |
|---|---|---|
| 1 | Create an event with 3 matches on its card | Event is "upcoming" |
| 2 | Record result for match 1 | Event status changes to "in-progress" |
| 3 | Record result for match 2 | Event still "in-progress" |
| 4 | Record result for match 3 (final match) | Event auto-transitions to "completed" |
| 5 | Verify on `/events` the event shows as completed | Status updated |

### 8.6 Events — Role Access

| Action | Admin | Moderator | Wrestler | Fantasy | Unauth |
|---|---|---|---|---|---|
| View events | Yes | Yes | Yes | Yes | Yes |
| View event details | Yes | Yes | Yes | Yes | Yes |
| Create event | Yes | Yes | No | No | No |
| Edit event | Yes | Yes | No | No | No |
| Delete event | Yes | Yes | No | No | No |

---

## 9. Standings & Statistics

### 9.1 All-Time Standings

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/` | Standings page loads |
| 2 | Verify all players listed with correct W-L-D records | Records match actual match results |
| 3 | Verify sorted by wins (descending) | Order correct |
| 4 | Record a new match result | Return to standings |
| 5 | Verify the standings updated to reflect the new result | W-L-D incremented |

### 9.2 Season Standings

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/` and select a season from the dropdown | Standings change to season-specific records |
| 2 | Verify records only include matches from that season | Numbers differ from all-time if applicable |
| 3 | Switch back to "All Time" | All-time records displayed |

### 9.3 Statistics (Feature-Gated)

| # | Step | Expected Result |
|---|---|---|
| 1 | Ensure the "statistics" feature toggle is ON | Feature enabled |
| 2 | Navigate to `/stats` | Statistics overview page loads |
| 3 | Navigate to `/stats/player/{id}` | Individual player stats shown (win %, streaks, match type breakdown) |
| 4 | Navigate to `/stats/head-to-head` | Select two players; head-to-head record displayed |
| 5 | Navigate to `/stats/leaderboards` | Various leaderboards shown (most wins, best win %, longest streak) |
| 6 | Navigate to `/stats/records` | Record book displayed |
| 7 | Navigate to `/stats/achievements` | Achievements list shown |
| 8 | Disable the "statistics" feature toggle | Feature disabled |
| 9 | Navigate to `/stats` | Page blocked or redirected; stats not accessible |

### 9.4 Standings & Statistics — Role Access

| Action | Admin | Moderator | Wrestler | Fantasy | Unauth |
|---|---|---|---|---|---|
| View all-time standings | Yes | Yes | Yes | Yes | Yes |
| View season standings | Yes | Yes | Yes | Yes | Yes |
| View statistics (when enabled) | Yes | Yes | Yes | Yes | Yes |

---

## 10. Contender Rankings

### 10.1 View Contender Rankings (Feature-Gated)

| # | Step | Expected Result |
|---|---|---|
| 1 | Ensure the "contenders" feature toggle is ON | Feature enabled |
| 2 | Navigate to `/contenders` | Contender rankings page loads |
| 3 | Select a championship | Top 10 contenders displayed with ranking score |
| 4 | Verify ranking data: rank position, win %, current streak, previous rank, peak rank | Data displayed |

### 10.2 Recalculate Rankings (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to admin contenders management | Recalculate option available |
| 2 | Click "Recalculate" | Rankings recomputed based on recent match data |
| 3 | Verify updated rankings on `/contenders` | New rankings reflected |

### 10.3 Automatic Ranking Updates

| # | Step | Expected Result |
|---|---|---|
| 1 | Record a match result for a player near the top of contender rankings | Match completed |
| 2 | Check contender rankings | Rankings automatically recalculated (async) |

### 10.4 My Contender Status (Wrestler Role)

| # | Step | Expected Result |
|---|---|---|
| 1 | Log in as a Wrestler | Authenticated |
| 2 | Navigate to `/contenders/my-status` | Shows own ranking position across championships |

### 10.5 Contenders — Role Access

| Action | Admin | Moderator | Wrestler | Fantasy | Unauth |
|---|---|---|---|---|---|
| View contender rankings | Yes | Yes | Yes | Yes | Yes |
| View own contender status | N/A | N/A | Yes | No | No |
| Recalculate rankings | Yes | Yes | No | No | No |

---

## 11. Challenges

### 11.1 Issue Challenge (Wrestler Role)

| # | Step | Expected Result |
|---|---|---|
| 1 | Ensure the "challenges" feature toggle is ON | Feature enabled |
| 2 | Log in as a Wrestler | Authenticated |
| 3 | Navigate to `/challenges/issue` | Challenge form loads |
| 4 | Select an opponent from the player list | Opponent selected |
| 5 | Select match type and stipulation | Dropdowns work |
| 6 | Optionally add a championship and message | Fields accept input |
| 7 | Submit | Challenge created with "pending" status |
| 8 | Verify challenge appears on `/challenges` | Challenge listed |

### 11.2 Read Challenges (All Roles)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/challenges` as unauthenticated user | Challenge board loads (public view) |
| 2 | Verify challenges show: challenger, challenged, match type, status | Data displayed |

### 11.3 Respond to Challenge (Wrestler Role)

| # | Step | Expected Result |
|---|---|---|
| 1 | Log in as the Wrestler who was challenged | Authenticated |
| 2 | Navigate to `/challenges/my` | My challenges page loads |
| 3 | Find the pending challenge | Challenge displayed |
| 4 | Click "Accept" | Challenge status changes to "accepted" |
| 5 | Alternatively, click "Decline" | Challenge status changes to declined |
| 6 | Verify status updated on public `/challenges` page | Status reflected |

### 11.4 Cancel Challenge (Wrestler Role)

| # | Step | Expected Result |
|---|---|---|
| 1 | Log in as the Wrestler who issued the challenge | Authenticated |
| 2 | Navigate to `/challenges/my` | My challenges page loads |
| 3 | Find a pending challenge you issued | Challenge displayed |
| 4 | Click "Cancel" | Challenge status changes to "cancelled" |

### 11.5 Challenge Expiration

| # | Step | Expected Result |
|---|---|---|
| 1 | Issue a challenge and wait 7 days (or manipulate data to simulate) | Challenge expires |
| 2 | Verify challenge status shows as expired | Status updated |

### 11.6 Challenges — Role Access

| Action | Admin | Moderator | Wrestler | Fantasy | Unauth |
|---|---|---|---|---|---|
| View challenge board | Yes | Yes | Yes | Yes | Yes |
| Issue challenge | No* | No* | Yes | No | No |
| Respond to challenge | No* | No* | Yes | No | No |
| Cancel own challenge | No* | No* | Yes | No | No |

*Admins/Moderators can issue challenges only if they also have a linked Wrestler profile.

---

## 12. Promos

### 12.1 Create Promo (Wrestler Role)

| # | Step | Expected Result |
|---|---|---|
| 1 | Ensure the "promos" feature toggle is ON | Feature enabled |
| 2 | Log in as a Wrestler | Authenticated |
| 3 | Navigate to `/promos/new` | Promo creation form loads |
| 4 | Select promo type (open mic, call-out, response, pre-match, post-match, championship, return) | Dropdown works |
| 5 | Write promo content (50-2000 characters) | Text area accepts input |
| 6 | Optionally target another wrestler or specific promo | Target fields work |
| 7 | Submit | Promo created; appears in promo feed |

### 12.2 Read Promos (All Roles)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/promos` as unauthenticated user | Promo feed loads |
| 2 | Verify promos show: author, content preview, type, reactions | Data displayed |
| 3 | Click on a promo | Full promo thread loads with responses |

### 12.3 React to Promo (Wrestler Role)

| # | Step | Expected Result |
|---|---|---|
| 1 | Log in as a Wrestler | Authenticated |
| 2 | Navigate to `/promos/{id}` | Promo detail page loads |
| 3 | Click a reaction button (Fire, Mic drop, Trash, Mind-blown, Clap) | Reaction recorded |
| 4 | Verify reaction count updates | Count incremented |

### 12.4 Moderate Promo (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Log in as Admin | Authenticated |
| 2 | Navigate to a promo that needs moderation | Promo displayed |
| 3 | Pin the promo | Promo marked as pinned; appears at top of feed |
| 4 | Hide the promo | Promo hidden from public view |
| 5 | Verify hidden promo not visible to unauthenticated users | Promo not shown |

### 12.5 Promo Validation

| # | Step | Expected Result |
|---|---|---|
| 1 | Try to submit a promo with less than 50 characters | Validation error |
| 2 | Try to submit a promo with more than 2000 characters | Validation error or truncation |

### 12.6 Promos — Role Access

| Action | Admin | Moderator | Wrestler | Fantasy | Unauth |
|---|---|---|---|---|---|
| View promo feed | Yes | Yes | Yes | Yes | Yes |
| View promo thread | Yes | Yes | Yes | Yes | Yes |
| Create promo | No* | No* | Yes | No | No |
| React to promo | No* | No* | Yes | No | No |
| Pin/hide promo (moderate) | Yes | Yes | No | No | No |

*Admins/Moderators can create promos only if they also have a linked Wrestler profile.

---

## 13. Fantasy League

### 13.1 Configure Fantasy (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/fantasy` | Fantasy configuration page loads |
| 2 | Set default budget (e.g., 500) | Field accepts input |
| 3 | Set picks-per-division limit (e.g., 2) | Field accepts input |
| 4 | Save configuration | Config updated |

### 13.2 Initialize Wrestler Costs (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to wrestler cost management in admin | Cost management page loads |
| 2 | Click "Initialize Costs" | All wrestlers assigned base cost (100) |
| 3 | Verify costs on `/fantasy/costs` | All wrestlers show cost = 100 |

### 13.3 Adjust Wrestler Costs (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Manually set a wrestler's cost | Cost updated |
| 2 | Click "Recalculate Costs" | Costs auto-adjusted based on performance |
| 3 | Verify top-performing wrestlers cost more | Costs reflect records |

### 13.4 Make Fantasy Picks (Fantasy Role)

| # | Step | Expected Result |
|---|---|---|
| 1 | Ensure the "fantasy" feature toggle is ON | Feature enabled |
| 2 | Log in as a Fantasy user | Authenticated |
| 3 | Navigate to `/fantasy/dashboard` | Fantasy dashboard loads |
| 4 | Find an upcoming event with fantasy enabled | Event listed |
| 5 | Navigate to `/fantasy/picks/{eventId}` | Pick selection page loads |
| 6 | Select wrestlers within budget constraints | Picks selected; remaining budget shown |
| 7 | Verify picks-per-division limit enforced | Cannot exceed limit |
| 8 | Submit picks | Picks saved |
| 9 | Navigate to `/fantasy/picks/{eventId}` again | Previously saved picks displayed |

### 13.5 Update Fantasy Picks (Fantasy Role)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to picks page for an event with existing picks | Current picks loaded |
| 2 | Change wrestler selections | Picks updated in UI |
| 3 | Submit | Updated picks saved |

### 13.6 Clear Fantasy Picks (Fantasy Role)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to picks page for an event with existing picks | Current picks loaded |
| 2 | Click "Clear Picks" | All picks removed |
| 3 | Verify picks are cleared | No picks shown |

### 13.7 Fantasy Scoring

| # | Step | Expected Result |
|---|---|---|
| 1 | Complete all matches in a fantasy-enabled event | Event auto-completes |
| 2 | Verify fantasy scoring runs automatically | Points calculated |
| 3 | Check `/fantasy/leaderboard` | Scores updated based on picks vs results |
| 4 | Verify scoring: Win=3pts, Title Defense=5pts, Title Win=10pts | Point values correct |

### 13.8 View Fantasy Leaderboard (Fantasy Role)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/fantasy/leaderboard` | Leaderboard loads |
| 2 | Verify cumulative scores across all events | Running totals shown |
| 3 | Verify user rankings | Sorted by total points |

### 13.9 Fantasy — Role Access

| Action | Admin | Moderator | Wrestler | Fantasy | Unauth |
|---|---|---|---|---|---|
| View wrestler costs | Yes | Yes | Yes | Yes | Yes |
| Configure fantasy settings | Yes | Yes | No | No | No |
| Initialize/recalculate costs | Yes | Yes | No | No | No |
| Set individual wrestler cost | Yes | Yes | No | No | No |
| Make fantasy picks | Yes* | No | No | Yes | No |
| View own picks | Yes* | No | No | Yes | No |
| Clear own picks | Yes* | No | No | Yes | No |
| View leaderboard | Yes* | No | No | Yes | No |

*Admins can access fantasy features if they also have the Fantasy role.

---

## 14. Feature Toggles

### 14.1 Manage Feature Toggles (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/features` | Feature toggles page loads |
| 2 | Verify all toggleable features listed: fantasy, challenges, promos, contenders, statistics | All shown with current on/off status |
| 3 | Toggle "challenges" OFF | Switch toggles off |
| 4 | Save | Config saved |
| 5 | Navigate to `/challenges` as any user | Page blocked or redirected; feature inaccessible |
| 6 | Toggle "challenges" back ON | Switch toggles on |
| 7 | Navigate to `/challenges` | Page loads normally |

### 14.2 Test Each Feature Toggle

Repeat the following for each toggleable feature:

| Feature | Route to Test | Expected When OFF |
|---|---|---|
| `fantasy` | `/fantasy/dashboard` | Page blocked/hidden |
| `challenges` | `/challenges`, `/challenges/issue` | Page blocked/hidden |
| `promos` | `/promos`, `/promos/new` | Page blocked/hidden |
| `contenders` | `/contenders` | Page blocked/hidden |
| `statistics` | `/stats` | Page blocked/hidden |

### 14.3 Feature Toggles — Role Access

| Action | Admin | Moderator | Wrestler | Fantasy | Unauth |
|---|---|---|---|---|---|
| View feature toggle status | Yes | Yes | No | No | No |
| Change feature toggles | Yes | Yes | No | No | No |

---

## 15. User Management

### 15.1 View All Users (Admin Only)

| # | Step | Expected Result |
|---|---|---|
| 1 | Log in as Admin | Authenticated |
| 2 | Navigate to `/admin/users` | User list loads |
| 3 | Verify all registered users displayed | Users listed with roles and status |

### 15.2 Promote User (Admin Only)

| # | Step | Expected Result |
|---|---|---|
| 1 | Find a user with no special role | User displayed |
| 2 | Promote to "Wrestler" | Role updated; linked Player record auto-created |
| 3 | Verify the user now has Wrestler access | User can access `/profile`, `/challenges/issue` |
| 4 | Promote another user to "Fantasy" | Role updated |
| 5 | Verify the user can access `/fantasy/dashboard` | Fantasy features accessible |
| 6 | Promote a user to "Moderator" (Super Admin only) | Role updated |
| 7 | Verify the Moderator can access `/admin` pages | Admin features accessible |
| 8 | Promote a user to "Admin" (Super Admin only) | Role updated |

### 15.3 Demote User (Admin Only)

| # | Step | Expected Result |
|---|---|---|
| 1 | Find a user with the Moderator role | User displayed |
| 2 | Demote to regular user | Role removed |
| 3 | Verify the user can no longer access admin pages | Access blocked |

### 15.4 Toggle User Enabled/Disabled (Admin Only)

| # | Step | Expected Result |
|---|---|---|
| 1 | Find an active user | User displayed |
| 2 | Disable the user account | Account disabled |
| 3 | Try to log in as the disabled user | Login fails; appropriate error |
| 4 | Re-enable the user account | Account enabled |
| 5 | Log in as the re-enabled user | Login succeeds |

### 15.5 Super Admin vs Regular Admin Restrictions

| # | Step | Expected Result |
|---|---|---|
| 1 | Log in as a Moderator | Authenticated |
| 2 | Navigate to `/admin/users` | Access blocked (Moderator cannot manage users) |
| 3 | Try to promote a user to Admin or Moderator via API | Request rejected |

### 15.6 User Management — Role Access

| Action | Super Admin | Admin | Moderator | Wrestler | Fantasy | Unauth |
|---|---|---|---|---|---|---|
| View all users | Yes | Yes | No | No | No | No |
| Promote to Wrestler/Fantasy | Yes | Yes | No | No | No | No |
| Promote to Moderator/Admin | Yes | No | No | No | No | No |
| Demote users | Yes | Yes* | No | No | No | No |
| Toggle user enabled | Yes | Yes | No | No | No | No |

*Regular Admins cannot demote other Admins or Moderators.

---

## 16. Admin Utilities (Danger Zone)

### 16.1 Seed Sample Data (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/danger-zone` | Danger zone page loads |
| 2 | Click "Generate Sample Data" | Confirmation dialog appears |
| 3 | Confirm | Data seeded: 3 divisions, 12 players, 1 season, 4 championships, 12 matches, 2 tournaments |
| 4 | Verify data on all public pages | All seeded data visible |
| 5 | Seed again | Data is additive (does not delete existing) |

### 16.2 Clear All Data (Super Admin Only)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/danger-zone` | Danger zone page loads |
| 2 | Type the confirmation phrase `DELETE ALL DATA` | Delete button becomes enabled |
| 3 | Click the delete button | Final confirmation dialog appears |
| 4 | Confirm | All data deleted from all tables |
| 5 | Verify all public pages show empty states | No data displayed |
| 6 | Verify count of deleted items displayed | Counts shown |

### 16.3 Clear All Data — Moderator Blocked

| # | Step | Expected Result |
|---|---|---|
| 1 | Log in as Moderator | Authenticated |
| 2 | Navigate to `/admin/danger-zone` | Page loads |
| 3 | Attempt to clear all data | Action blocked; button disabled or API returns 403 |

### 16.4 Danger Zone — Role Access

| Action | Super Admin | Moderator | Wrestler | Fantasy | Unauth |
|---|---|---|---|---|---|
| Seed sample data | Yes | Yes | No | No | No |
| Clear all data | Yes | No | No | No | No |

---

## 17. Image Uploads

### 17.1 Player Image Upload (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to player create/edit form | Form loads |
| 2 | Click image upload button | File picker opens |
| 3 | Select a valid image file (JPG, PNG) | Image preview displayed |
| 4 | Submit the form | Image uploaded to S3 via presigned URL |
| 5 | Verify image displays on public pages | Image rendered correctly |

### 17.2 Championship Image Upload (Admin/Moderator)

| # | Step | Expected Result |
|---|---|---|
| 1 | Navigate to championship create/edit form | Form loads |
| 2 | Upload a championship belt image | Image preview displayed |
| 3 | Submit | Image uploaded; displays on `/championships` |

### 17.3 Invalid Image

| # | Step | Expected Result |
|---|---|---|
| 1 | Try to upload a non-image file (e.g., .txt, .pdf) | Upload rejected or error shown |
| 2 | Try to upload an oversized image | Error shown or image rejected |

---

## 18. Internationalization

### 18.1 Language Switching

| # | Step | Expected Result |
|---|---|---|
| 1 | Load the application in English (default) | All UI text in English |
| 2 | Switch language to German | All UI labels, buttons, and messages switch to German |
| 3 | Switch back to English | Everything reverts to English |
| 4 | Refresh the page | Language preference persisted |

### 18.2 Verify Translations on Key Pages

| # | Page | What to Check |
|---|---|---|
| 1 | Standings | Column headers, filter labels |
| 2 | Championships | Title labels, history headers |
| 3 | Matches | Status labels, match type names |
| 4 | Admin panel | All form labels, button text, navigation tabs |
| 5 | Login/Signup | Form labels, error messages |

---

## Cross-Cutting Concerns

### Error Handling

| # | Test | Expected Result |
|---|---|---|
| 1 | Disconnect the backend and try loading any page | Appropriate error message (e.g., "Failed to load data") |
| 2 | Submit a form with invalid data | Validation errors displayed |
| 3 | Try to access an API endpoint with an expired JWT | 401 response; user redirected to login |
| 4 | Try to access an admin API endpoint as a Wrestler | 403 Forbidden response |

### Browser Compatibility

| # | Browser | Check |
|---|---|---|
| 1 | Chrome (latest) | Full functionality |
| 2 | Firefox (latest) | Full functionality |
| 3 | Safari (latest) | Full functionality |
| 4 | Edge (latest) | Full functionality |
| 5 | Mobile Chrome | Layout and functionality |
| 6 | Mobile Safari | Layout and functionality |

### Performance

| # | Test | Expected Result |
|---|---|---|
| 1 | Load standings page with 50+ players | Page loads without significant delay |
| 2 | Load matches page with 100+ matches | Page loads and filters work |
| 3 | Record a match result and verify cascading updates complete | All related data updated within a few seconds |

---

## Quick Regression Checklist

Use this checklist after any deployment or major change:

- [ ] Public standings page loads with correct data
- [ ] Season dropdown works and filters standings
- [ ] Championships page shows current champions
- [ ] Championship history loads correctly
- [ ] Matches page shows scheduled and completed matches
- [ ] Tournaments show correct brackets/standings
- [ ] Events page lists all events with correct statuses
- [ ] Admin login works
- [ ] Admin can create, edit, and delete a player
- [ ] Admin can schedule a match and record a result
- [ ] Standings update after recording a match result
- [ ] Championship changes reflected after title match
- [ ] Tournament brackets advance after match result
- [ ] Wrestler can log in and view own profile
- [ ] Wrestler can issue and respond to challenges (if enabled)
- [ ] Wrestler can create a promo (if enabled)
- [ ] Fantasy picks can be submitted (if enabled)
- [ ] Feature toggles correctly enable/disable features
- [ ] Image uploads work for players and championships
- [ ] Language switching works
- [ ] No console errors in browser DevTools
