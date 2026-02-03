import './UserGuide.css';

export default function UserGuide() {
  return (
    <div className="user-guide">
      <h2>How to Use This Site</h2>
      <p className="guide-intro">
        Welcome to the WWE 2K League Management System! This guide will help you navigate
        the site and understand all the features available to you.
      </p>

      <section className="guide-section">
        <h3>Standings Page</h3>
        <p>The Standings page is the home page and shows the current league rankings.</p>

        <div className="guide-subsection">
          <h4>What You Can See</h4>
          <table className="info-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Rank</td>
                <td>Player's position based on win percentage</td>
              </tr>
              <tr>
                <td>Player</td>
                <td>The player's name</td>
              </tr>
              <tr>
                <td>Wrestler</td>
                <td>The WWE wrestler they currently play as</td>
              </tr>
              <tr>
                <td>W / L / D</td>
                <td>Total wins, losses, and draws</td>
              </tr>
              <tr>
                <td>Win %</td>
                <td>Win percentage calculated from their record</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="guide-subsection">
          <h4>How Rankings Work</h4>
          <p>
            Players are ranked by their win percentage. Players with more wins and fewer
            losses will appear higher on the standings.
          </p>
          <div className="formula-box">
            Win % = Wins / (Wins + Losses + Draws) x 100
          </div>
        </div>
      </section>

      <section className="guide-section">
        <h3>Championships Page</h3>
        <p>View all the championships in the league and their history.</p>

        <div className="guide-subsection">
          <h4>Viewing Championships</h4>
          <ol className="steps-list">
            <li>Navigate to <strong>Championships</strong> in the navigation bar</li>
            <li>You'll see all active championships displayed as cards</li>
            <li>Each championship card shows:
              <ul>
                <li>Championship name and belt image</li>
                <li>Type (Singles or Tag Team)</li>
                <li>Current champion(s)</li>
              </ul>
            </li>
          </ol>
        </div>

        <div className="guide-subsection">
          <h4>Viewing Championship History</h4>
          <ol className="steps-list">
            <li>Click on any championship card</li>
            <li>A modal window will appear showing the complete history</li>
            <li>The history displays all previous champions, dates won/lost, and total days held</li>
          </ol>
        </div>
      </section>

      <section className="guide-section">
        <h3>Matches Page</h3>
        <p>View all scheduled and completed matches in the league.</p>

        <div className="guide-subsection">
          <h4>Filtering Matches</h4>
          <p>At the top of the page, you can filter matches by status:</p>
          <ul className="feature-list">
            <li><strong>All</strong> - Shows all matches</li>
            <li><strong>Scheduled</strong> - Shows only upcoming matches</li>
            <li><strong>Completed</strong> - Shows only finished matches</li>
          </ul>
        </div>

        <div className="guide-subsection">
          <h4>Match Information</h4>
          <p>Each match card displays:</p>
          <ul className="feature-list">
            <li><strong>Date</strong> - When the match is scheduled or took place</li>
            <li><strong>Match Type</strong> - Singles, Tag Team, Triple Threat, Fatal 4-Way, Six Pack Challenge, or Battle Royal</li>
            <li><strong>Stipulation</strong> - Special match rules (Ladder, Steel Cage, Hell in a Cell, etc.)</li>
            <li><strong>Participants</strong> - Who is competing in the match</li>
            <li><strong>Championship Badge</strong> - Indicates if it's a title match</li>
          </ul>
        </div>

        <div className="guide-subsection">
          <h4>Match Results</h4>
          <p>For completed matches, you'll also see:</p>
          <ul className="feature-list">
            <li><span className="winner-text">Winners</span> - Highlighted in green</li>
            <li><span className="loser-text">Losers</span> - Shown in the results section</li>
            <li><span className="draw-text">Draw</span> - If the match ended in a draw</li>
          </ul>
        </div>
      </section>

      <section className="guide-section">
        <h3>Tournaments Page</h3>
        <p>Follow tournament brackets and standings for ongoing and completed tournaments.</p>

        <div className="guide-subsection">
          <h4>Tournament Types</h4>
          <p>The league supports two tournament formats:</p>

          <div className="tournament-type-box">
            <h5>Single Elimination</h5>
            <ul>
              <li>Traditional bracket-style tournament</li>
              <li>If you lose, you're eliminated</li>
              <li>Winners advance to the next round</li>
              <li>Last person standing wins the tournament</li>
            </ul>
          </div>

          <div className="tournament-type-box">
            <h5>Round Robin (G1 Climax Style)</h5>
            <ul>
              <li>Every participant faces every other participant</li>
              <li>Points awarded: <strong>Win = 2 pts</strong>, <strong>Draw = 1 pt</strong>, <strong>Loss = 0 pts</strong></li>
              <li>Player with the most points at the end wins</li>
            </ul>
          </div>
        </div>

        <div className="guide-subsection">
          <h4>Tournament Information</h4>
          <p>Each tournament card shows:</p>
          <ul className="feature-list">
            <li>Tournament name and type</li>
            <li>Status (Upcoming, In Progress, or Completed)</li>
            <li>Number of participants</li>
            <li>Current bracket or standings</li>
          </ul>
        </div>
      </section>

      <section className="guide-section tips-section">
        <h3>Tips for Following the League</h3>
        <div className="tips-grid">
          <div className="tip-card">
            <span className="tip-icon">1</span>
            <p><strong>Check Standings Regularly</strong> - See who's climbing the rankings</p>
          </div>
          <div className="tip-card">
            <span className="tip-icon">2</span>
            <p><strong>Watch for Championship Matches</strong> - These are marked with a special badge</p>
          </div>
          <div className="tip-card">
            <span className="tip-icon">3</span>
            <p><strong>Follow Tournament Progress</strong> - Tournaments often determine championship opportunities</p>
          </div>
          <div className="tip-card">
            <span className="tip-icon">4</span>
            <p><strong>Review Match History</strong> - Filter by "Completed" to catch up on results you missed</p>
          </div>
        </div>
      </section>
    </div>
  );
}
