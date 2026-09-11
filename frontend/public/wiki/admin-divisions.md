# Managing Divisions

The **Divisions** page lets you group players by weight class, card position, or role—for example Heavyweight, Cruiserweight, Main Event, or Jobbers. Divisions are not show brands; they define who can contend for which championships when division restrictions are enabled.

## Creating a Division

1. Navigate to **Divisions**
2. Fill in the division details:
   - **Division Name** — e.g., "Heavyweight", "Cruiserweight", "Main Event", "Jobbers"
   - **Description** (optional) — e.g., "Top-tier stars", "Under 205 lbs", or "Enhancement talent"
3. Click **Create Division** to save

## Editing a Division

1. Find the division in the divisions grid
2. Click the **Edit** button on the division card
3. Update the name or description
4. Click **Update Division** to confirm changes

## Deleting a Division

1. Find the division in the divisions grid
2. Click the **Delete** button on the division card
3. Confirm the action in the dialog

**Note:** You cannot delete a division that has players assigned to it. Reassign or remove players from the division first.

## Assigning Players to Divisions

1. Navigate to **Manage Players**
2. When editing a player, use the **Division** dropdown
3. Select the appropriate division or "No Division"
4. Save the player to apply the assignment

## Division ladder

The **Division Ladder** screen lets you organize divisions into a hierarchy and enable automatic promotion and demotion based on winning and losing streaks.

### Organizing the Ladder

Divisions are arranged from bottom (Jobber tier—enhancement talent) to top (Main Event—main card). Use the **▲** and **▼** buttons to reorder divisions in the hierarchy.

### Streak-Based Promotion and Demotion

When enabled, the ladder rules automatically move players:

- **Promotion**: A player on a **5-match win streak** (default) moves up one division
- **Demotion**: A player on a **5-match loss streak** (default) moves down one division
- Draws do not trigger moves
- Streaks are computed only from matches *after* the player's last division change, so promotions reset the count
- Players cannot be promoted above the top division or demoted below the Jobber tier

### Configuring Rules

1. **Enable/Disable** the ladder with the toggle
2. **Win Streak** — Set the number of consecutive wins required for promotion (2–20, default 5)
3. **Loss Streak** — Set the number of consecutive losses required for demotion (2–20, default 5)
4. Click **Save** to apply changes

### Recent Movements

The **Recent Movements** table shows recent promotions and demotions, including the player, date, direction, and what triggered the move (streak, admin, or transfer).

## Suspensions

The **Suspensions** screen lets you temporarily remove players from the roster when they are injured, suspended by policy, or unavailable.

### Suspending a Player

1. Navigate to **Suspensions**
2. Use the search box to find the player
3. Click the player to open the suspend dialog
4. Choose one condition:
   - **Until a date** — Select a future date when the suspension ends
   - **For a number of shows** — Enter how many completed events must pass before reinstatement (1–52)
5. Optionally add a reason for the suspension
6. Click **Suspend** to confirm

### Suspended Players in Booking

Suspended players still appear in the **booking picker** (used when scheduling matches or checking events) with a **"Suspended"** label showing:
- If time-based: the suspension end date
- If show-based: how many shows remain

Suspended players can still be booked if needed.

### Reinstatement

#### Manual Reinstatement

1. Navigate to **Suspensions**
2. Search for the suspended player or find them in the active suspensions table
3. Click **Reinstate** to remove the suspension immediately (even before eligibility)

#### Automatic Reinstatement Prompt

When a staff member logs in after a suspension has been served (the end date passed or the required number of shows completed), a modal appears offering:

- **List of eligible players** with the condition that was met (e.g., "Date passed Sep 8" or "4 of 4 shows served")
- **Reinstate** button for each player
- **Reinstate all** button to reinstate all eligible players at once
- **Remind me later** to dismiss the modal for this session (it will reappear on the next login)
