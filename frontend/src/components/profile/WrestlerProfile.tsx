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
          {wrestler.bio ? (
            <p>{wrestler.bio}</p>
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