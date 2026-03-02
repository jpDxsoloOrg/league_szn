import React, { useState } from 'react';
import './WrestlerProfile.css';

interface WrestlerProfileProps {
  wrestler: {
    bio?: string;
  };
  onUpdateBio: (newBio: string) => void;
}

const WrestlerProfile: React.FC<WrestlerProfileProps> = ({ wrestler, onUpdateBio }) => {
  const [editMode, setEditMode] = useState(false);
  const [bio, setBio] = useState(wrestler.bio || '');

  const handleBioChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBio(event.target.value);
  };

  const toggleEditMode = () => {
    setEditMode(!editMode);
  };

  const saveBio = () => {
    onUpdateBio(bio);
    toggleEditMode();
  };

  return (
    <div className="wrestler-profile">
      {editMode ? (
        <div className="bio-edit-mode">
          <textarea
            value={bio}
            onChange={handleBioChange}
            maxLength={255} // Enforce 255-character limit
          />
          <p>Characters remaining: {255 - bio.length}</p>
          <button onClick={saveBio}>Save</button>
          <button onClick={toggleEditMode}>Cancel</button>
        </div>
      ) : (
        <div className="bio-view-mode">
          <h2>Bio</h2>
          {bio ? (
            <p>{bio}</p>
          ) : (
            <p>No bio available.</p>
          )}
          <button onClick={toggleEditMode}>Edit Bio</button>
        </div>
      )}
    </div>
  );
};

export default WrestlerProfile;

<<<< CONFLICT: multiple tasks modified this file >>>>
# From task: 38ef1486-2a0e-4733-9eb0-50b0a27f9eaf
// frontend/src/components/profile/WrestlerProfile.tsx
<<<edit
<textarea
  id="bio"
  value={wrestler.bio}
  onChange={(e) => setWrestler({ ...wrestler, bio: e.target.value })}
  placeholder="Enter wrestler's biography"
/>
>>>
<<<edit
<textarea
  id="bio"
  value={wrestler.bio}
  onChange={(e) => setWrestler({ ...wrestler, bio: e.target.value })}
  placeholder="Enter wrestler's biography"
  maxLength={255}
/>
>>>

// frontend/src/components/PlayerHoverCard.tsx
<<<edit
<textarea
  id="bio"
  value={player.bio}
  onChange={(e) => setPlayer({ ...player, bio: e.target.value })}
  placeholder="Enter player's biography"
/>
>>>
<<<edit
<textarea
  id="bio"
  value={player.bio}
  onChange={(e) => setPlayer({ ...player, bio: e.target.value })}
  placeholder="Enter player's biography"
  maxLength={255}
/>
>>>

// frontend/src/components/admin/ManagePlayers.tsx
<<<edit
<textarea
  id="bio"
  value={newPlayer.bio}
  onChange={(e) => setNewPlayer({ ...newPlayer, bio: e.target.value })}
  placeholder="Enter player's biography"
/>
>>>
<<<edit
<textarea
  id="bio"
  value={newPlayer.bio}
  onChange={(e) => setNewPlayer({ ...newPlayer, bio: e.target.value })}
  placeholder="Enter player's biography"
  maxLength={255}
/>
>>>

<<<< CONFLICT: multiple tasks modified this file >>>>
# From task: 0a44b851-0ccf-4688-8796-fb6187a14087
// frontend/src/components/profile/WrestlerProfile.tsx

<<<edit
const WrestlerProfile: React.FC<WrestlerProfileProps> = ({ wrestler }) => {
  return (
    <div className="wrestler-profile">
      <h1>{wrestler.name}</h1>
      {wrestler.bio && (
        <div className="bio">
          <h2>Bio</h2>
          <p>{wrestler.bio}</p>
        </div>
      )}
    </div>
  );
};
>>>

// frontend/src/components/PlayerHoverCard.tsx

<<<edit
const PlayerHoverCard: React.FC<PlayerHoverCardProps> = ({ player }) => {
  return (
    <div className="player-hover-card">
      <h2>{player.name}</h2>
      {player.bio && (
        <div className="bio">
          <p>{player.bio}</p>
        </div>
      )}
    </div>
  );
};
>>>

// frontend/src/components/admin/ManagePlayers.tsx

<<<edit
const WrestlerProfile: React.FC<WrestlerProfileProps> = ({ wrestler }) => {
  return (
    <div className="wrestler-profile">
      <h1>{wrestler.name}</h1>
      {wrestler.bio && (
        <div className="bio">
          <h2>Bio</h2>
          <p>{wrestler.bio}</p>
        </div>
      )}
    </div>
  );
};
>>>