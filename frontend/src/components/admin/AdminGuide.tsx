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

      <section className="admin-guide-section workflow-section">
        <h4>Typical Admin Workflow</h4>
        <div className="workflow-steps">
          <div className="workflow-step">
            <span className="step-number">1</span>
            <div className="step-content">
              <strong>Add Players</strong>
              <p>Set up all league participants with their wrestlers</p>
            </div>
          </div>
          <div className="workflow-step">
            <span className="step-number">2</span>
            <div className="step-content">
              <strong>Create Championships</strong>
              <p>Set up the titles that will be contested</p>
            </div>
          </div>
          <div className="workflow-step">
            <span className="step-number">3</span>
            <div className="step-content">
              <strong>Schedule Matches</strong>
              <p>Create the match card for upcoming events</p>
            </div>
          </div>
          <div className="workflow-step">
            <span className="step-number">4</span>
            <div className="step-content">
              <strong>Record Results</strong>
              <p>Enter outcomes after matches are played</p>
            </div>
          </div>
          <div className="workflow-step">
            <span className="step-number">5</span>
            <div className="step-content">
              <strong>Repeat</strong>
              <p>Continue scheduling and recording as the season progresses</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
