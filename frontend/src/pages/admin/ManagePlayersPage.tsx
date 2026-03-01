import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';
import { Player } from '../../types/player';

interface ManagePlayersPageProps {
  players: Player[];
}

const ManagePlayersPage: React.FC<ManagePlayersPageProps> = ({ players }) => {
  const navigate = useNavigate();
  const { user } = React.useContext(AuthContext);
  const [bioEdit, setBioEdit] = useState<{ [key: string]: boolean }>({});
  const [editedBios, setEditedBios] = useState<{ [key: string]: string }>({});

  if (!user || !user.isAdmin) {
    navigate('/');
    return null;
  }

  const toggleBioEdit = (playerId: string) => {
    setBioEdit((prev) => ({
      ...prev,
      [playerId]: !prev[playerId],
    }));
  };

  const handleBioChange = (playerId: string, event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedBios({
      ...editedBios,
      [playerId]: event.target.value,
    });
  };

  const saveBio = async (playerId: string) => {
    // Assume there's a function updatePlayerBio in your backend API
    try {
      await fetch(`/api/players/${playerId}/bio`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bio: editedBios[playerId] }),
      });
      setBioEdit((prev) => ({
        ...prev,
        [playerId]: false,
      }));
    } catch (error) {
      console.error('Error updating player bio:', error);
    }
  };

  return (
    <div>
      <h1>Manage Players</h1>
      {players.map((player) => (
        <div key={player.id}>
          <p>{player.name}</p>
          {bioEdit[player.id] ? (
            <>
              <textarea
                value={editedBios[player.id] || player.bio}
                onChange={(e) => handleBioChange(player.id, e)}
              />
              <button onClick={() => saveBio(player.id)}>Save</button>
              <button onClick={() => toggleBioEdit(player.id)}>Cancel</button>
            </>
          ) : (
            <>
              <p>{player.bio}</p>
              <button onClick={() => toggleBioEdit(player.id)}>Edit Bio</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
};

export default ManagePlayersPage;