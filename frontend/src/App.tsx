import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { useState } from 'react';
import Standings from './components/Standings';
import Championships from './components/Championships';
import Matches from './components/Matches';
import Tournaments from './components/Tournaments';
import './App.css';

const AdminPanel = () => <div><h2>Admin Panel</h2><p>Coming soon...</p></div>;

function App() {
  const [isAdmin] = useState(false);

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
            {isAdmin && <Link to="/admin">Admin</Link>}
          </nav>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Standings />} />
            <Route path="/championships" element={<Championships />} />
            <Route path="/matches" element={<Matches />} />
            <Route path="/tournaments" element={<Tournaments />} />
            <Route path="/admin" element={<AdminPanel />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
