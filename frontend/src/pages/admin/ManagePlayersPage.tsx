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
        maxLength={255}
        placeholder="Enter player bio here"
      />
      <button onClick={saveBio}>Save Bio</button>
      <button onClick={navigateAwayWithConfirmation}>Back to Admin Panel</button>
    </div>
  );
};

export default ManagePlayersPage;