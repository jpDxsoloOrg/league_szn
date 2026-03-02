import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PlayerBioForm } from './PlayerBioForm';

const ManagePlayersPage = () => {
  const [playerBio, setPlayerBio] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { playerId: playerIdFromRoute } = useParams<{ playerId: string }>();

  useEffect(() => {
    if (playerIdFromRoute) {
      fetchPlayerBio(playerIdFromRoute);
    }
  }, [playerIdFromRoute]);

  const fetchPlayerBio = async (playerId: string) => {
    try {
      const response = await fetch(`/api/players/${playerId}/bio`);
      if (!response.ok) {
        throw new Error('Failed to fetch player bio');
      }
      const data = await response.json();
      setPlayerBio(data.bio);
    } catch (err) {
      setError(`Error fetching player bio: ${err.message}`);
    }
  };

  const handleBioChange = debounce(async (newBio: string) => {
    try {
      const response = await fetch(`/api/players/${playerIdFromRoute}/bio`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: newBio }),
      });
      if (!response.ok) {
        throw new Error('Failed to update player bio');
      }
    } catch (err) {
      setError(`Error updating player bio: ${err.message}`);
    }
  }, 300);

  const handleBackClick = () => {
    navigate('/admin/players');
  };

  return (
    <div>
      <h1>Manage Player</h1>
      {error && <div className="error">{error}</div>}
      <PlayerBioForm bio={playerBio} onBioChange={handleBioChange} />
      <button onClick={handleBackClick}>Back to Players List</button>
    </div>
  );
};

const debounce = (func: (...args: any) => void, delay: number) => {
  let timerId: NodeJS.Timeout | null;
  return (...args: any) => {
    if (timerId) clearTimeout(timerId);
    timerId = setTimeout(() => func(...args), delay);
  };
};

export default ManagePlayersPage;

<<<< CONFLICT: multiple tasks modified this file >>>>
# From task: 07f315b7-ecc8-462c-85b4-980b35825557
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const ManagePlayersPage = () => {
  const [playerBio, setPlayerBio] = useState('');
  const navigate = useNavigate();

  const saveBio = async () => {
    try {
      const response = await axios.post('/api/admin/update-player-bio', { bio: playerBio });
      if (response.status === 200) {
        alert('Player bio updated successfully!');
      } else {
        console.error('Failed to update player bio');
      }
    } catch (error) {
      console.error('Network error:', error);
      alert('An error occurred while updating the player bio. Please try again.');
    }
  };

  const handleBioChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPlayerBio(e.target.value);
  };

  const navigateAwayWithConfirmation = () => {
    if (window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
      navigate('/admin');
    }
  };

  return (
    <div>
      <h1>Manage Players</h1>
      <textarea
        value={playerBio}
        onChange={handleBioChange}
        maxLength={255} // Enforce 255-character limit
        placeholder="Enter player bio here"
      />
      <button onClick={saveBio}>Save Bio</button>
      <button onClick={navigateAwayWithConfirmation}>Back to Admin Panel</button>
    </div>
  );
};

export default ManagePlayersPage;