import './AdminGuide.css';

export default function AdminGuide() {
  return (
    <div className="admin-guide">
      <h3>Admin Guide</h3>
      <p className="guide-intro">
        This guide explains how to manage the WWE 2K League as an administrator.
        Use the tabs above to access different management features.
      </p>

      <section className="admin-guide-section">
        <h4>Managing Players</h4>
        <p>The <strong>Manage Players</strong> tab allows you to add and edit players in the league.</p>

        <div className="guide-block">
          <h5>Adding a New Player</h5>
          <ol>
            <li>Navigate to the <strong>Manage Players</strong> tab</li>
            <li>Fill in the player details:
              <ul>
                <li><strong>Player Name</strong> - The person's real name or gamertag</li>
                <li><strong>Wrestler Name</strong> - The WWE wrestler they will play as</li>
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
            <li>Update the player name, wrestler, or image</li>
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
        <h4>Scheduling Matches</h4>
        <p>The <strong>Schedule Match</strong> tab allows you to create upcoming matches.</p>

        <div className="guide-block">
          <h5>Creating a Match</h5>
          <ol>
            <li>Navigate to the <strong>Schedule Match</strong> tab</li>
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
        <p>The <strong>Record Results</strong> tab allows you to enter match outcomes.</p>

        <div className="guide-block">
          <h5>Recording a Match Result</h5>
          <ol>
            <li>Navigate to the <strong>Record Results</strong> tab</li>
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
            <li>Player win/loss/draw records are automatically updated</li>
            <li>League standings are recalculated</li>
            <li>If it's a championship match, the title changes hands to the winner</li>
            <li>If it's a tournament match, brackets/standings are updated</li>
          </ul>
        </div>
      </section>

      <section className="admin-guide-section">
        <h4>Managing Championships</h4>
        <p>The <strong>Championships</strong> tab allows you to create and manage titles.</p>

        <div className="guide-block">
          <h5>Creating a Championship</h5>
          <ol>
            <li>Navigate to the <strong>Championships</strong> tab</li>
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
          </ul>
        </div>
      </section>

      <section className="admin-guide-section">
        <h4>Creating Tournaments</h4>
        <p>The <strong>Tournaments</strong> tab allows you to create and manage tournaments.</p>

        <div className="guide-block">
          <h5>Creating a Tournament</h5>
          <ol>
            <li>Navigate to the <strong>Tournaments</strong> tab</li>
            <li>Fill in the tournament details:
              <ul>
                <li><strong>Tournament Name</strong> - e.g., "King of the Ring 2024"</li>
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
        <h4>Managing Seasons</h4>
        <p>The <strong>Seasons</strong> tab allows you to organize the league into distinct competitive periods.</p>

        <div className="guide-block">
          <h5>Creating a Season</h5>
          <ol>
            <li>Navigate to the <strong>Seasons</strong> tab</li>
            <li>Fill in the season details:
              <ul>
                <li><strong>Season Name</strong> - e.g., "Season 1", "Summer 2024"</li>
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
        <h4>Managing Divisions</h4>
        <p>The <strong>Divisions</strong> tab allows you to organize players into groups like brand splits.</p>

        <div className="guide-block">
          <h5>Creating a Division</h5>
          <ol>
            <li>Navigate to the <strong>Divisions</strong> tab</li>
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
            <li>Navigate to the <strong>Manage Players</strong> tab</li>
            <li>When adding or editing a player, use the <strong>Division</strong> dropdown</li>
            <li>Select the appropriate division or "No Division"</li>
            <li>Save the player to apply the assignment</li>
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
        <h4>Typical Admin Workflow</h4>
        <div className="workflow-steps">
          <div className="workflow-step">
            <span className="step-number">1</span>
            <div className="step-content">
              <strong>Create a Season</strong>
              <p>Start a new season to track standings for this competitive period</p>
            </div>
          </div>
          <div className="workflow-step">
            <span className="step-number">2</span>
            <div className="step-content">
              <strong>Set Up Divisions</strong>
              <p>Create divisions to organize players (e.g., Raw, SmackDown)</p>
            </div>
          </div>
          <div className="workflow-step">
            <span className="step-number">3</span>
            <div className="step-content">
              <strong>Add Players</strong>
              <p>Set up all league participants with their wrestlers and assign to divisions</p>
            </div>
          </div>
          <div className="workflow-step">
            <span className="step-number">4</span>
            <div className="step-content">
              <strong>Create Championships</strong>
              <p>Set up the titles that will be contested</p>
            </div>
          </div>
          <div className="workflow-step">
            <span className="step-number">5</span>
            <div className="step-content">
              <strong>Schedule Matches</strong>
              <p>Create the match card for upcoming events</p>
            </div>
          </div>
          <div className="workflow-step">
            <span className="step-number">6</span>
            <div className="step-content">
              <strong>Record Results</strong>
              <p>Enter outcomes after matches are played</p>
            </div>
          </div>
          <div className="workflow-step">
            <span className="step-number">7</span>
            <div className="step-content">
              <strong>End Season & Repeat</strong>
              <p>When the season concludes, end it and create a new one</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
