import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Standings from './components/Standings';
import Championships from './components/Championships';
import Matches from './components/Matches';
import Tournaments from './components/Tournaments';
import UserGuide from './components/UserGuide';
import AdminPanel from './components/admin/AdminPanel';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <header>
          <h1>WWE 2K League</h1>
          <nav>
            <Link to="/">Standings</Link>
            <Link to="/championships">Championships</Link>
            <Link to="/matches">Matches</Link>
            <Link to="/tournaments">Tournaments</Link>
            <Link to="/guide">Help</Link>
            <Link to="/admin">Admin</Link>
          </nav>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Standings />} />
            <Route path="/championships" element={<Championships />} />
            <Route path="/matches" element={<Matches />} />
            <Route path="/tournaments" element={<Tournaments />} />
            <Route path="/guide" element={<UserGuide />} />
            <Route path="/admin" element={<AdminPanel />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
