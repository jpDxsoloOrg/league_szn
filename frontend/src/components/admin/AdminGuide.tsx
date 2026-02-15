import './AdminGuide.css';

export default function AdminGuide() {
  return (
    <div className="admin-guide">
      <h3>Admin Guide</h3>
      <p className="guide-intro">
        This guide explains how to manage the WWE 2K League as an administrator.
        Use the sidebar to access different management features.
      </p>

      <nav className="admin-guide-toc" aria-label="Table of contents">
        <h4 className="admin-guide-toc-title">Contents</h4>
        <ul className="admin-guide-toc-list">
          <li><a href="#quickstart">Quickstart</a></li>
          <li><a href="#user-management">User Management</a></li>
          <li><a href="#divisions">Divisions</a></li>
          <li><a href="#manage-players">Manage Players</a></li>
          <li><a href="#seasons">Seasons</a></li>
          <li><a href="#championships">Championships</a></li>
          <li><a href="#events">Events</a></li>
          <li><a href="#schedule-match">Schedule Match</a></li>
          <li><a href="#record-results">Record Results</a></li>
          <li><a href="#tournaments">Tournaments</a></li>
          <li><a href="#content-social">Content &amp; social</a></li>
          <li><a href="#challenges">Challenges</a></li>
          <li><a href="#promos">Promos</a></li>
          <li><a href="#contender-config">Contender Config</a></li>
          <li><a href="#data-management">Data Management</a></li>
          <li><a href="#workflow">Typical Weekly Workflow</a></li>
        </ul>
      </nav>

      <section id="quickstart" className="admin-guide-section quickstart-section" tabIndex={-1}>
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
              <p>Go to <strong>Divisions</strong> and create divisions (e.g., Heavyweight, Cruiserweight, or Main Event, Jobbers). Divisions organize players by weight class or tier and can lock contender rankings to that division.</p>
            </div>
          </div>
          <div className="quickstart-step">
            <span className="quickstart-number">3</span>
            <div className="quickstart-content">
              <strong>Manage Players</strong>
              <p>Go to <strong>Manage Players</strong> to edit wrestler details, upload images, assign divisions, and remove players. This screen is for editing and deleting; admins do not add wrestlers here.</p>
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

      <section id="user-management" className="admin-guide-section" tabIndex={-1}>
        <h4>User Management</h4>
        <p>The <strong>User Management</strong> page allows you to manage user accounts and assign roles.</p>

        <div className="guide-block">
          <h5>User Roles</h5>
          <table className="match-type-table">
            <tbody>
              <tr>
                <td><strong>Admin</strong></td>
                <td>Full access to all management features, including the Danger Zone, public pages, and authenticated features</td>
              </tr>
              <tr>
                <td><strong>Moderator</strong></td>
                <td>Access to all management features except the Danger Zone (no Generate Sample Data or Clear All Data). Can manage players, matches, championships, challenges, promos, and other day-to-day admin tasks. Assignable only by a Super Admin.</td>
              </tr>
              <tr>
                <td><strong>Wrestler</strong></td>
                <td>Access to personal profile page with stats, contender status, challenges, and promos</td>
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

      <section id="divisions" className="admin-guide-section" tabIndex={-1}>
        <h4>Managing Divisions</h4>
        <p>The <strong>Divisions</strong> page lets you group players by weight class, card position, or role—for example Heavyweight, Cruiserweight, Main Event, or Jobbers. Divisions are not show brands; they define who can contend for which championships when division restrictions are enabled.</p>

        <div className="guide-block">
          <h5>Creating a Division</h5>
          <ol>
            <li>Navigate to <strong>Divisions</strong></li>
            <li>Fill in the division details:
              <ul>
                <li><strong>Division Name</strong> - e.g., "Heavyweight", "Cruiserweight", "Main Event", "Jobbers"</li>
                <li><strong>Description</strong> (optional) - e.g., "Top-tier stars", "Under 205 lbs", or "Enhancement talent"</li>
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
            <li>When editing a player, use the <strong>Division</strong> dropdown</li>
            <li>Select the appropriate division or "No Division"</li>
            <li>Save the player to apply the assignment</li>
          </ol>
        </div>
      </section>

      <section id="manage-players" className="admin-guide-section" tabIndex={-1}>
        <h4>Managing Players</h4>
        <p>The <strong>Manage Players</strong> page allows you to edit and delete players in the league. Admins do not add wrestlers here; use this screen to update details, assign divisions, and remove players.</p>

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

      <section id="seasons" className="admin-guide-section" tabIndex={-1}>
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

      <section id="championships" className="admin-guide-section" tabIndex={-1}>
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

      <section id="events" className="admin-guide-section" tabIndex={-1}>
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

      <section id="schedule-match" className="admin-guide-section" tabIndex={-1}>
        <h4>Scheduling Matches</h4>
        <p>The <strong>Schedule Match</strong> page allows you to create upcoming matches.</p>

        <div className="guide-block">
          <h5>Creating a Match</h5>
          <ol>
            <li>Navigate to <strong>Schedule Match</strong></li>
            <li>Fill in the match details:
              <ul>
                <li><strong>Date & Time</strong> - When the match will take place</li>
                <li><strong>Match Type</strong> - Choose from the types you’ve configured (see below). Examples: Singles, Tag Team, Triple Threat, Fatal 4-Way, Battle Royal.</li>
                <li><strong>Stipulation</strong> (optional) - Choose from the stipulations you’ve configured, or leave as standard. Examples: Ladder, Steel Cage, Hell in a Cell, Last Man Standing.</li>
                <li><strong>Participants</strong> - Select 2 or more players</li>
              </ul>
            </li>
            <li>Optionally enable <strong>Championship Match</strong> and select the title on the line</li>
            <li>Optionally associate the match with a <strong>Tournament</strong></li>
            <li>Optionally associate the match with a <strong>Season</strong></li>
            <li>Click <strong>Schedule Match</strong> to save</li>
          </ol>
        </div>

        <div className="guide-block">
          <h5>Pre-fill from challenge or promo</h5>
          <p>You can open Schedule Match from the <strong>Challenges</strong> tab (click <strong>Schedule</strong> on a challenge) or from the <strong>Promos</strong> tab (click <strong>Schedule Match</strong> on a call-out promo). Participants, match type, and optional stipulation are pre-filled from the challenge or promo; you can change them before saving. The scheduled match stores a link to the challenge or promo for reference.</p>
        </div>

        <div className="guide-block highlight-box">
          <h5>Match types and stipulations</h5>
          <p>Match types and stipulations are not fixed—you add and edit them in the <strong>Match Config</strong> tab (Admin → Match Config). There you’ll find two sub-tabs: <strong>Match Types</strong> and <strong>Stipulations</strong>.</p>
          <p><strong>Match types</strong> define the format (e.g. how many competitors, how a winner is determined). Add as many as your league uses. Examples: Singles (1 vs 1), Tag Team (2 vs 2), Triple Threat (3 participants, first pin/submit wins), Fatal 4-Way, Six Pack Challenge, Battle Royal (last one standing). Create a new match type with a name and optional description.</p>
          <p><strong>Stipulations</strong> are optional rules or gimmicks for a match. Add any stipulations your league uses. Examples: Ladder, Steel Cage, Hell in a Cell, Last Man Standing, Tables, Iron Man. Create a new stipulation with a name and optional description. When scheduling a match, you pick one from the list or leave it as a standard match.</p>
        </div>
      </section>

      <section id="record-results" className="admin-guide-section" tabIndex={-1}>
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

      <section id="tournaments" className="admin-guide-section" tabIndex={-1}>
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

      <section id="content-social" className="admin-guide-section" tabIndex={-1}>
        <h4>Content &amp; social</h4>
        <p>Manage challenges and promos from the <strong>Challenges</strong> and <strong>Promos</strong> admin tabs.</p>

        <div className="guide-block">
          <h4 id="challenges" className="admin-guide-subsection">Challenges</h4>
          <p>The <strong>Challenges</strong> tab (Admin → Challenges) lets you view and manage match challenges between players.</p>
          <h5>Viewing and filtering</h5>
          <ul>
            <li>Use the status filter to show pending, countered, accepted, scheduled, expired, or cancelled challenges.</li>
            <li>Only challenges in certain statuses (e.g. pending, accepted) appear on the public challenge board; scheduled and resolved challenges are hidden from the board.</li>
          </ul>
          <h5>Scheduling a match from a challenge</h5>
          <p>Click <strong>Schedule</strong> on a challenge to open Schedule Match with participants, match type, and optional stipulation pre-filled from the challenge. The scheduled match stores a link to the challenge.</p>
          <h5>Deleting challenges</h5>
          <p>Use the per-row <strong>Delete</strong> button to remove a challenge.</p>
          <h5>Clear Resolved</h5>
          <p>The <strong>Clear Resolved</strong> bulk action removes cancelled, expired, and scheduled challenges. A confirmation dialog appears before clearing.</p>
        </div>

        <div className="guide-block">
          <h4 id="promos" className="admin-guide-subsection">Promos</h4>
          <p>The <strong>Promos</strong> tab (Admin → Promos) lets you manage the promo feed (open-mic, call-outs, responses).</p>
          <h5>Viewing and filtering</h5>
          <p>View the promo list and filter by type (open-mic, call-out, response, etc.) as needed.</p>
          <h5>Pin / Unpin</h5>
          <p>Pinned promos appear at the top of the public feed.</p>
          <h5>Hide</h5>
          <p>Hidden promos are removed from the public feed. Scheduling a match from a call-out promo can hide it from the feed.</p>
          <h5>Schedule Match (call-out promos)</h5>
          <p>For call-out promos, click <strong>Schedule Match</strong> to open Schedule Match with participants and details pre-filled from the promo. The match stores a link to the promo.</p>
          <h5>Deleting promos</h5>
          <p>Use the per-row delete action to remove a promo.</p>
          <h5>Clear hidden promos</h5>
          <p>The <strong>Clear hidden promos</strong> bulk action removes hidden promos from the list after confirmation.</p>
        </div>
      </section>

      <section id="contender-config" className="admin-guide-section" tabIndex={-1}>
        <h4>Contender Configuration</h4>
        <p>The <strong>Contender Config</strong> page allows you to configure automatic #1 contender rankings for each championship.</p>

        <div className="guide-block">
          <h5>How Contender Rankings Work</h5>
          <ul>
            <li>Rankings are automatically calculated based on recent match performance</li>
            <li>Each championship has its own contender rankings</li>
            <li>Rankings can be locked to a specific division (e.g., only Heavyweight division players contend for the Heavyweight championship)</li>
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

      <section id="data-management" className="admin-guide-section danger-section" tabIndex={-1}>
        <h4>Data Management</h4>
        <p>The <strong>Danger Zone</strong> tab provides tools to generate sample data or completely reset the league.</p>

        <div className="guide-block highlight-box">
          <h5>Generate Sample Data</h5>
          <p>Quickly populate the league with realistic sample data for testing or demonstration.</p>
          <h6>What Gets Created:</h6>
          <ul>
            <li><strong>12 Players</strong> - With random win/loss records and assigned wrestlers</li>
            <li><strong>3 Divisions</strong> - e.g., Heavyweight, Cruiserweight, Mid-Card</li>
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

      <section id="workflow" className="admin-guide-section workflow-section" tabIndex={-1}>
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
          <div className="workflow-step">
            <span className="step-number">7</span>
            <div className="step-content">
              <strong>Review challenges and promos</strong>
              <p>In <strong>Challenges</strong> and <strong>Promos</strong> tabs, clear resolved challenges or hidden promos as needed; schedule matches from accepted challenges or call-outs when ready.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
