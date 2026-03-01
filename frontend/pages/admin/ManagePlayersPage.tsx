import React, { useState } from 'react';
import { useAdminContext } from '../../contexts/AdminContext';
import { Player } from '../../types/player'; // Assuming you have a player type defined

const ManagePlayersPage = () => {
  const { players, updatePlayerBio } = useAdminContext();
  const [bio, setBio] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const handleBioChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newBio = event.target.value;
    if (newBio.length <= 255) {
      setBio(newBio);
    }
  };

  const handleEditBio = (playerId: string) => {
    setSelectedPlayerId(playerId);
    const player = players.find(p => p.id === playerId);
    if (player) {
      setBio(player.bio || '');
    }
  };

  const handleSaveBio = () => {
    if (selectedPlayerId) {
      updatePlayerBio(selectedPlayerId, bio);
      setSelectedPlayerId(null);
    }
  };

  return (
    <div>
      <h1>Manage Players</h1>
      {players.map(player => (
        <div key={player.id}>
          <p>{player.name}</p>
          <button onClick={() => handleEditBio(player.id)}>Edit Bio</button>
          {selectedPlayerId === player.id && (
            <div>
              <textarea value={bio} onChange={handleBioChange} maxLength={255} />
              <button onClick={handleSaveBio}>Save</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ManagePlayersPage;