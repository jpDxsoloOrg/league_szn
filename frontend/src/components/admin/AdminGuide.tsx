import './AdminGuide.css';

export default function AdminGuide() {
  return (
    <div className="admin-guide">
      <h3>Admin Guide</h3>
      <p className="guide-intro">
        This guide explains how to manage the WWE 2K League as an administrator.
        Use the sidebar to access different management features.
      </p>

      <section className="admin-guide-section quickstart-section">
        <h4>Quickstart Guide</h4>
        <p>New admin? Follow these steps to set up your league from scratch.</p>

        <div className="quickstart-steps">
          <div className="quickstart-step">
            <span className="quickstart-number">1</span>
            <div className="quickstart-content">
              <strong>Manage Users</strong>
              <p>Go to <strong>User Management</strong> and assign roles to your league members. Give wrestlers the <strong>Wrestler</strong> role so they get profile pages, and optionally assign the <strong>Fantasy</strong> role to those participating in the fantasy league.</p>
            </div>
          </div>
          <div className="quickstart-step">
            <span className="quickstart-number">2</span>
            <div className="quickstart-content">
              <strong>Create Divisions</strong>
              <p>Go to <strong>Divisions</strong> and create your brand splits (e.g., Raw, SmackDown, NXT). Divisions organize players and lock contender rankings to specific rosters.</p>
            </div>
          </div>
          <div className="quickstart-step">
            <span className="quickstart-number">3</span>
            <div className="quickstart-content">
              <strong>Add Players</strong>
              <p>Go to <strong>Manage Players</strong> and add each league member. Set their player name, wrestler name, upload an image, and assign them to a division.</p>
            </div>
          </div>
          <div className="quickstart-step">
            <span className="quickstart-number">4</span>
            <div className="quickstart-content">
              <strong>Create a Season</strong>
              <p>Go to <strong>Seasons</strong> and create your first season. Only one season can be active at a time. Seasons track separate standings for each competitive period.</p>
            </div>
          </div>
          <div className="quickstart-step">
            <span className="quickstart-number">5</span>
            <div className="quickstart-content">
              <strong>Create Championships</strong>
              <p>Go to <strong>Championships</strong> and create your titles (e.g., World Heavyweight, Intercontinental, Tag Team). Upload belt images for a polished look.</p>
            </div>
          </div>
          <div className="quickstart-step">
            <span className="quickstart-number">6</span>
            <div className="quickstart-content">
              <strong>Create an Event</strong>
              <p>Go to <strong>Events</strong> and create your first event or PPV. Set the name, date, type, and venue. Events organize your match cards.</p>
            </div>
          </div>
          <div className="quickstart-step">
            <span className="quickstart-number">7</span>
            <div className="quickstart-content">
              <strong>Schedule Matches</strong>
              <p>Go to <strong>Schedule Match</strong> and create matches. Pick the match type, select participants, optionally add a stipulation, associate with a championship or tournament, and assign to a season and event.</p>
            </div>
          </div>
          <div className="quickstart-step">
            <span className="quickstart-number">8</span>
            <div className="quickstart-content">
              <strong>Build the Match Card</strong>
              <p>Go back to <strong>Events</strong>, select your event, and use the <strong>Match Card Builder</strong> to add matches to the card. Reorder them to set openers, midcard, co-main, and main event slots.</p>
            </div>
          </div>
          <div className="quickstart-step">
            <span className="quickstart-number">9</span>
            <div className="quickstart-content">
              <strong>Record Results</strong>
              <p>After matches are played, go to <strong>Record Results</strong>. Select a match, mark each participant as Winner, Loser, or Draw, and save. Standings, championships, and tournament brackets all update automatically.</p>
            </div>
          </div>
          <div className="quickstart-step">
            <span className="quickstart-number">10</span>
            <div className="quickstart-content">
              <strong>Configure Contenders</strong>
              <p>Go to <strong>Contender Config</strong> to set up automatic #1 contender rankings for each championship. Configure ranking period, minimum matches, division restrictions, and recalculate as needed.</p>
            </div>
          </div>
        </div>

        <div className="guide-block important-box">
          <h5>Quick Demo Mode</h5>
          <p>Want to try things out first? Go to the <strong>Danger Zone</strong> tab and click <strong>Generate Sample Data</strong> to populate the league with 12 players, 3 divisions, 4 championships, 12 matches, 2 tournaments, and a full season of standings.</p>
        </div>
      </section>

      <section className="admin-guide-section">
        <h4>User Management</h4>
        <p>The <strong>User Management</strong> page allows you to manage user accounts and assign roles.</p>

        <div className="guide-block">
          <h5>User Roles</h5>
          <table className="match-type-table">
            <tbody>
              <tr>
                <td><strong>Admin</strong></td>
                <td>Full access to all management features, public pages, and authenticated features</td>
              </tr>
              <tr>
                <td><strong>Wrestler</strong></td>
                <td>Access to personal profile page with stats, contender status, challenges (coming soon), and promos (coming soon)</td>
              </tr>
              <tr>
                <td><strong>Fantasy</strong></td>
                <td>Access to the fantasy league: making picks, viewing leaderboards, and tracking wrestler costs</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="guide-block">
          <h5>Assigning Roles</h5>
          <ol>
            <li>Navigate to <strong>User Management</strong></li>
            <li>Find the user in the list</li>
            <li>Use the role dropdown to assign or change their role</li>
            <li>Changes take effect immediately</li>
          </ol>
          <p className="note-text"><strong>Note:</strong> Users must have signed up with an account before you can assign them a role. They will see role-locked features as disabled in the sidebar until assigned the appropriate role.</p>
        </div>
      </section>

      <section className="admin-guide-section">
        <h4>Managing Players</h4>
        <p>The <strong>Manage Players</strong> page allows you to add and edit players in the league.</p>

        <div className="guide-block">
          <h5>Adding a New Player</h5>
          <ol>
            <li>Navigate to <strong>Manage Players</strong></li>
            <li>Fill in the player details:
              <ul>
                <li><strong>Player Name</strong> - The person's real name or gamertag</li>
                <li><strong>Wrestler Name</strong> - The WWE wrestler they will play as</li>
                <li><strong>Division</strong> - Assign them to a division (Raw, SmackDown, etc.)</li>
                <li><strong>Wrestler Image</strong> (optional) - Upload a photo of the wrestler</li>
              </ul>
            </li>
            <li>Click <strong>Add Player</strong> to save</li>
          </ol>
        </div>

        <div className="guide-block">
          <h5>Editing a Player</h5>
          <ol>
            <li>Find the player in the players table</li>
            <li>Click the <strong>Edit</strong> button next to their name</li>
            <li>Update the player name, wrestler, division, or image</li>
            <li>Click <strong>Save</strong> to confirm changes</li>
          </ol>
        </div>

        <div className="guide-block">
          <h5>Deleting a Player</h5>
          <ol>
            <li>Find the player in the players table</li>
            <li>Click the <strong>Delete</strong> button next to their name</li>
            <li>Confirm the action in the dialog</li>
          </ol>
          <p className="note-text"><strong>Note:</strong> You cannot delete a player who is currently a champion. Remove their championship first by having them lose a title match or editing the championship.</p>
        </div>

        <div className="guide-block">
          <h5>Image Upload Guidelines</h5>
          <ul>
            <li>Supported formats: JPEG, PNG, GIF, WebP</li>
            <li>Maximum file size: 5MB</li>
            <li>Images are stored securely and displayed in standings</li>
          </ul>
        </div>
      </section>

      <section className="admin-guide-section">
        <h4>Managing Divisions</h4>
        <p>The <strong>Divisions</strong> page allows you to organize players into groups like brand splits.</p>

        <div className="guide-block">
          <h5>Creating a Division</h5>
          <ol>
            <li>Navigate to <strong>Divisions</strong></li>
            <li>Fill in the division details:
              <ul>
                <li><strong>Division Name</strong> - e.g., "Raw", "SmackDown", "NXT"</li>
                <li><strong>Description</strong> (optional) - A brief description of the division</li>
              </ul>
            </li>
            <li>Click <strong>Create Division</strong> to save</li>
          </ol>
        </div>

        <div className="guide-block">
          <h5>Editing a Division</h5>
          <ol>
            <li>Find the division in the divisions grid</li>
            <li>Click the <strong>Edit</strong> button on the division card</li>
            <li>Update the name or description</li>
            <li>Click <strong>Update Division</strong> to confirm changes</li>
          </ol>
        </div>

        <div className="guide-block">
          <h5>Deleting a Division</h5>
          <ol>
            <li>Find the division in the divisions grid</li>
            <li>Click the <strong>Delete</strong> button on the division card</li>
            <li>Confirm the action in the dialog</li>
          </ol>
          <p className="note-text"><strong>Note:</strong> You cannot delete a division that has players assigned to it. Reassign or remove players from the division first.</p>
        </div>

        <div className="guide-block">
          <h5>Assigning Players to Divisions</h5>
          <ol>
            <li>Navigate to <strong>Manage Players</strong></li>
            <li>When adding or editing a player, use the <strong>Division</strong> dropdown</li>
            <li>Select the appropriate division or "No Division"</li>
            <li>Save the player to apply the assignment</li>
          </ol>
        </div>
      </section>

      <section className="admin-guide-section">
        <h4>Managing Seasons</h4>
        <p>The <strong>Seasons</strong> page allows you to organize the league into distinct competitive periods.</p>

        <div className="guide-block">
          <h5>Creating a Season</h5>
          <ol>
            <li>Navigate to <strong>Seasons</strong></li>
            <li>Fill in the season details:
              <ul>
                <li><strong>Season Name</strong> - e.g., "Season 1", "Summer 2025"</li>
                <li><strong>Start Date</strong> - When the season begins</li>
                <li><strong>End Date</strong> (optional) - When the season ends</li>
              </ul>
            </li>
            <li>Click <strong>Create New Season</strong> to save</li>
          </ol>
        </div>

        <div className="guide-block important-box">
          <h5>Important: One Active Season Rule</h5>
          <p>Only one season can be active at a time. You must end the current season before creating a new one.</p>
        </div>

        <div className="guide-block">
          <h5>Ending a Season</h5>
          <ol>
            <li>Find the active season displayed with the "Active Season" banner</li>
            <li>Click the <strong>End Season</strong> button</li>
            <li>Confirm the action in the dialog</li>
            <li>The season's status will change to "Completed" and the end date will be recorded</li>
          </ol>
        </div>

        <div className="guide-block">
          <h5>Deleting a Season</h5>
          <ol>
            <li>Find the season in the seasons grid</li>
            <li>Click the <strong>Delete</strong> button on the season card</li>
            <li>Confirm the action in the dialog</li>
          </ol>
          <p className="note-text"><strong>Warning:</strong> Deleting a season will also permanently delete all standings for that season. This action cannot be undone.</p>
        </div>

        <div className="guide-block">
          <h5>How Seasons Work</h5>
          <ul>
            <li>Matches can be associated with a season when scheduled</li>
            <li>Season-specific standings are tracked separately from all-time standings</li>
            <li>When a match result is recorded, both all-time and season standings update automatically</li>
            <li>Completed seasons preserve historical records and can be viewed at any time</li>
          </ul>
        </div>
      </section>

      <section className="admin-guide-section">
        <h4>Managing Championships</h4>
        <p>The <strong>Championships</strong> page allows you to create and manage titles.</p>

        <div className="guide-block">
          <h5>Creating a Championship</h5>
          <ol>
            <li>Navigate to <strong>Championships</strong></li>
            <li>Fill in the championship details:
              <ul>
                <li><strong>Championship Name</strong> - e.g., "World Heavyweight Championship"</li>
                <li><strong>Type</strong> - Singles or Tag Team</li>
                <li><strong>Belt Image</strong> (optional) - Upload an image of the championship belt</li>
              </ul>
            </li>
            <li>Click <strong>Create Championship</strong> to save</li>
          </ol>
        </div>

        <div className="guide-block">
          <h5>Editing a Championship</h5>
          <ol>
            <li>Find the championship in the table</li>
            <li>Click the <strong>Edit</strong> button</li>
            <li>Update the name, type, or image</li>
            <li>Click <strong>Save</strong> to confirm changes</li>
          </ol>
        </div>

        <div className="guide-block">
          <h5>Deleting a Championship</h5>
          <ol>
            <li>Find the championship in the championships grid</li>
            <li>Click the <strong>Delete</strong> button on the championship card</li>
            <li>Confirm the action in the dialog</li>
          </ol>
          <p className="note-text"><strong>Warning:</strong> Deleting a championship will also permanently delete all championship history (past reigns, dates, etc.).</p>
        </div>

        <div className="guide-block">
          <h5>How Championships Work</h5>
          <ul>
            <li>When you schedule a championship match, select the title at stake</li>
            <li>When the match result is recorded, if the challenger wins, they become the new champion</li>
            <li>Championship history is automatically tracked with dates and reign lengths</li>
            <li>Contender rankings can be configured to automatically determine #1 contenders per championship</li>
          </ul>
        </div>
      </section>

      <section className="admin-guide-section">
        <h4>Managing Events</h4>
        <p>The <strong>Events</strong> page allows you to create and manage events and PPVs that organize your match cards.</p>

        <div className="guide-block">
          <h5>Creating an Event</h5>
          <ol>
            <li>Navigate to <strong>Events</strong></li>
            <li>Fill in the event details:
              <ul>
                <li><strong>Event Name</strong> - e.g., "WrestleMania 41", "Monday Night Raw"</li>
                <li><strong>Event Type</strong> - PPV, Weekly, Special, or House Show</li>
                <li><strong>Date & Time</strong> - When the event takes place</li>
                <li><strong>Venue</strong> (optional) - e.g., "Madison Square Garden"</li>
                <li><strong>Description</strong> (optional) - A description of the event</li>
                <li><strong>Theme Color</strong> (optional) - Custom color for the event card</li>
                <li><strong>Season</strong> (optional) - Associate the event with a season</li>
              </ul>
            </li>
            <li>Click <strong>Save Event</strong> to create</li>
          </ol>
        </div>

        <div className="guide-block">
          <h5>Building a Match Card</h5>
          <p>After creating an event, use the <strong>Match Card Builder</strong> to assemble the card:</p>
          <ol>
            <li>Select the event you want to edit</li>
            <li>In the Match Card Builder section, use the dropdown to select available matches</li>
            <li>Click <strong>Add Match</strong> to add it to the card</li>
            <li>Use <strong>Move Up</strong> / <strong>Move Down</strong> to reorder matches on the card</li>
            <li>Use <strong>Remove Match</strong> to take a match off the card</li>
          </ol>
          <p>Championship matches are highlighted with a special badge on the card.</p>
        </div>

        <div className="guide-block highlight-box">
          <h5>Event Types Explained</h5>
          <table className="match-type-table">
            <tbody>
              <tr>
                <td><strong>PPV</strong></td>
                <td>Major events like WrestleMania, SummerSlam, Royal Rumble</td>
              </tr>
              <tr>
                <td><strong>Weekly</strong></td>
                <td>Regular weekly shows like Raw, SmackDown, NXT</td>
              </tr>
              <tr>
                <td><strong>Special</strong></td>
                <td>One-off special events, Saturday Night's Main Event, etc.</td>
              </tr>
              <tr>
                <td><strong>House Show</strong></td>
                <td>Non-televised events for practice or exhibition</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-guide-section">
        <h4>Scheduling Matches</h4>
        <p>The <strong>Schedule Match</strong> page allows you to create upcoming matches.</p>

        <div className="guide-block">
          <h5>Creating a Match</h5>
          <ol>
            <li>Navigate to <strong>Schedule Match</strong></li>
            <li>Fill in the match details:
              <ul>
                <li><strong>Date & Time</strong> - When the match will take place</li>
                <li><strong>Match Type</strong> - Singles, Tag Team, Triple Threat, Fatal 4-Way, Six Pack Challenge, or Battle Royal</li>
                <li><strong>Stipulation</strong> (optional) - Ladder, Steel Cage, Hell in a Cell, etc.</li>
                <li><strong>Participants</strong> - Select 2 or more players</li>
              </ul>
            </li>
            <li>Optionally enable <strong>Championship Match</strong> and select the title on the line</li>
            <li>Optionally associate the match with a <strong>Tournament</strong></li>
            <li>Optionally associate the match with a <strong>Season</strong></li>
            <li>Click <strong>Schedule Match</strong> to save</li>
          </ol>
        </div>

        <div className="guide-block highlight-box">
          <h5>Match Types Explained</h5>
          <table className="match-type-table">
            <tbody>
              <tr>
                <td><strong>Singles</strong></td>
                <td>1 vs 1 match</td>
              </tr>
              <tr>
                <td><strong>Tag Team</strong></td>
                <td>2 vs 2 match</td>
              </tr>
              <tr>
                <td><strong>Triple Threat</strong></td>
                <td>3 participants, first to pin/submit wins</td>
              </tr>
              <tr>
                <td><strong>Fatal 4-Way</strong></td>
                <td>4 participants, first to pin/submit wins</td>
              </tr>
              <tr>
                <td><strong>Six Pack Challenge</strong></td>
                <td>6 participants, first to pin/submit wins</td>
              </tr>
              <tr>
                <td><strong>Battle Royal</strong></td>
                <td>Multiple participants, last one standing wins</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-guide-section">
        <h4>Recording Results</h4>
        <p>The <strong>Record Results</strong> page allows you to enter match outcomes.</p>

        <div className="guide-block">
          <h5>Recording a Match Result</h5>
          <ol>
            <li>Navigate to <strong>Record Results</strong></li>
            <li>Optionally filter by event to narrow down the match list</li>
            <li>Select a scheduled match from the dropdown</li>
            <li>Mark each participant as:
              <ul>
                <li><span className="winner-label">Winner</span> - Won the match</li>
                <li><span className="loser-label">Loser</span> - Lost the match</li>
                <li><span className="draw-label">Draw</span> - Match ended in a draw (if applicable)</li>
              </ul>
            </li>
            <li>Click <strong>Record Result</strong> to save</li>
          </ol>
        </div>

        <div className="guide-block important-box">
          <h5>What Happens When You Record a Result</h5>
          <ul>
            <li>Player win/loss/draw records are automatically updated (both all-time and season)</li>
            <li>League standings are recalculated</li>
            <li>If it's a championship match, the title changes hands to the winner</li>
            <li>If it's a tournament match, brackets/standings are updated</li>
            <li>Contender rankings may shift based on new results</li>
          </ul>
        </div>
      </section>

      <section className="admin-guide-section">
        <h4>Creating Tournaments</h4>
        <p>The <strong>Tournaments</strong> page allows you to create and manage tournaments.</p>

        <div className="guide-block">
          <h5>Creating a Tournament</h5>
          <ol>
            <li>Navigate to <strong>Tournaments</strong></li>
            <li>Fill in the tournament details:
              <ul>
                <li><strong>Tournament Name</strong> - e.g., "King of the Ring 2025"</li>
                <li><strong>Type</strong> - Single Elimination or Round Robin</li>
                <li><strong>Participants</strong> - Select the players competing</li>
              </ul>
            </li>
            <li>Click <strong>Create Tournament</strong> to save</li>
          </ol>
        </div>

        <div className="guide-block highlight-box">
          <h5>Tournament Types</h5>
          <div className="tournament-comparison">
            <div className="tournament-type">
              <h6>Single Elimination</h6>
              <ul>
                <li>Minimum 4 participants</li>
                <li>Bracket is auto-generated</li>
                <li>Losers are eliminated</li>
                <li>Winners advance to next round</li>
                <li>Best for quick tournaments</li>
              </ul>
            </div>
            <div className="tournament-type">
              <h6>Round Robin</h6>
              <ul>
                <li>Minimum 2 participants</li>
                <li>Everyone faces everyone</li>
                <li>Points: Win=2, Draw=1, Loss=0</li>
                <li>Most points wins</li>
                <li>Best for league-style play</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="guide-block">
          <h5>Managing Tournament Matches</h5>
          <ol>
            <li>After creating a tournament, schedule matches via <strong>Schedule Match</strong></li>
            <li>Select the tournament from the dropdown when scheduling</li>
            <li>Record results as matches are completed</li>
            <li>Standings/brackets update automatically</li>
          </ol>
        </div>
      </section>

      <section className="admin-guide-section">
        <h4>Contender Configuration</h4>
        <p>The <strong>Contender Config</strong> page allows you to configure automatic #1 contender rankings for each championship.</p>

        <div className="guide-block">
          <h5>How Contender Rankings Work</h5>
          <ul>
            <li>Rankings are automatically calculated based on recent match performance</li>
            <li>Each championship has its own contender rankings</li>
            <li>Rankings can be locked to a specific division (e.g., only Raw players contend for the Raw championship)</li>
            <li>Players must meet a minimum match threshold to qualify</li>
          </ul>
        </div>

        <div className="guide-block">
          <h5>Configuring Rankings</h5>
          <ol>
            <li>Navigate to <strong>Contender Config</strong></li>
            <li>Select a championship to configure</li>
            <li>Adjust the settings:
              <ul>
                <li><strong>Ranking Period (Days)</strong> - How far back to look for match data (7-365 days)</li>
                <li><strong>Minimum Matches</strong> - How many matches a player needs to appear in rankings</li>
                <li><strong>Maximum Contenders</strong> - How many ranked contenders to display</li>
                <li><strong>Include Draws</strong> - Whether draws count partially toward ranking score</li>
                <li><strong>Division Restricted</strong> - Only players in the same division as the championship can contend</li>
              </ul>
            </li>
            <li>Click <strong>Save Configuration</strong> to apply</li>
          </ol>
        </div>

        <div className="guide-block">
          <h5>Recalculating Rankings</h5>
          <ol>
            <li>After recording new match results, click <strong>Recalculate Rankings</strong></li>
            <li>Rankings will update based on the current configuration and recent match data</li>
            <li>The public Contenders page will immediately reflect the new rankings</li>
          </ol>
        </div>
      </section>

      <section className="admin-guide-section danger-section">
        <h4>Data Management</h4>
        <p>The <strong>Danger Zone</strong> tab provides tools to generate sample data or completely reset the league.</p>

        <div className="guide-block highlight-box">
          <h5>Generate Sample Data</h5>
          <p>Quickly populate the league with realistic sample data for testing or demonstration.</p>
          <h6>What Gets Created:</h6>
          <ul>
            <li><strong>12 Players</strong> - With random win/loss records and assigned wrestlers</li>
            <li><strong>3 Divisions</strong> - Raw, SmackDown, and NXT</li>
            <li><strong>1 Active Season</strong> - With standings for all players</li>
            <li><strong>4 Championships</strong> - World, Intercontinental, Tag Team, and US titles</li>
            <li><strong>12 Matches</strong> - Mix of completed and scheduled matches</li>
            <li><strong>2 Tournaments</strong> - Single elimination and round robin</li>
          </ul>
          <h6>How to Generate Sample Data:</h6>
          <ol>
            <li>Navigate to the <strong>Danger Zone</strong> tab</li>
            <li>Click the <strong>Generate Sample Data</strong> button</li>
            <li>Confirm the action in the dialog</li>
            <li>Wait for the data to be created</li>
          </ol>
          <p className="note-text"><strong>Tip:</strong> For a clean demonstration, use "Clear All Data" first, then generate sample data.</p>
        </div>

        <div className="guide-block important-box">
          <h5>When to Use Clear All Data</h5>
          <ul>
            <li>Starting fresh with a completely new league</li>
            <li>Testing or demonstration purposes</li>
            <li>Cleaning up after a test run before going live</li>
          </ul>
          <p className="note-text"><strong>Extreme Caution:</strong> This action is permanent and irreversible. All data will be lost forever.</p>
        </div>

        <div className="guide-block">
          <h5>What Gets Deleted</h5>
          <ul>
            <li>All players (wrestlers) and their match records</li>
            <li>All matches and results</li>
            <li>All championships and their complete history</li>
            <li>All tournaments and brackets</li>
            <li>All seasons and standings</li>
            <li>All divisions</li>
            <li>All events</li>
            <li>All contender rankings</li>
          </ul>
        </div>

        <div className="guide-block">
          <h5>How to Clear All Data</h5>
          <ol>
            <li>Navigate to the <strong>Danger Zone</strong> tab</li>
            <li>Read the warning carefully</li>
            <li>Type the exact phrase <strong>DELETE ALL DATA</strong> in the confirmation box</li>
            <li>Click the <strong>Clear All Data</strong> button</li>
            <li>Confirm the final warning dialog</li>
            <li>Wait for the process to complete</li>
          </ol>
          <p className="note-text"><strong>Tip:</strong> Consider exporting any important data before using this feature, as there is no way to recover deleted data.</p>
        </div>
      </section>

      <section className="admin-guide-section workflow-section">
        <h4>Typical Weekly Workflow</h4>
        <div className="workflow-steps">
          <div className="workflow-step">
            <span className="step-number">1</span>
            <div className="step-content">
              <strong>Create an Event</strong>
              <p>Set up the upcoming weekly show or PPV with name, date, and venue</p>
            </div>
          </div>
          <div className="workflow-step">
            <span className="step-number">2</span>
            <div className="step-content">
              <strong>Schedule Matches</strong>
              <p>Create matches for the event, including championship and tournament bouts</p>
            </div>
          </div>
          <div className="workflow-step">
            <span className="step-number">3</span>
            <div className="step-content">
              <strong>Build the Match Card</strong>
              <p>Add matches to the event and arrange them in the desired order</p>
            </div>
          </div>
          <div className="workflow-step">
            <span className="step-number">4</span>
            <div className="step-content">
              <strong>Record Results</strong>
              <p>After the matches are played, record winners, losers, and draws</p>
            </div>
          </div>
          <div className="workflow-step">
            <span className="step-number">5</span>
            <div className="step-content">
              <strong>Recalculate Contenders</strong>
              <p>Update contender rankings to reflect the latest match outcomes</p>
            </div>
          </div>
          <div className="workflow-step">
            <span className="step-number">6</span>
            <div className="step-content">
              <strong>Review Standings</strong>
              <p>Check the updated standings and contender rankings on the public pages</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
