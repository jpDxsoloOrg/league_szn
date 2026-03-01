import React, { useState } from 'react';
import './WrestlerProfile.css';

const WrestlerProfile = ({ wrestler }) => {
  const [editMode, setEditMode] = useState(false);
  const [bio, setBio] = useState(wrestler.bio || '');

  const handleBioChange = (event) => {
    setBio(event.target.value);
  };

  const toggleEditMode = () => {
    setEditMode(!editMode);
  };

  const saveBio = () => {
    // Save bio logic here
    console.log('Saving bio:', bio);
    toggleEditMode();
  };

  return (
    <div className="wrestler-profile">
      {editMode ? (
        <div className="bio-edit-mode">
          <textarea
            value={bio}
            onChange={handleBioChange}
            maxLength={500}
          />
          <p>Characters remaining: {500 - bio.length}</p>
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

<<<< CONFLICT: multiple tasks modified this file >>>>
# From task: b812c5fa-ae97-453c-aeef-f97462f7e2e0
import React, { useState } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';

interface WrestlerProfileProps {
  bio: string;
  onUpdateBio: (newBio: string) => void;
}

const WrestlerProfile: React.FC<WrestlerProfileProps> = ({ bio, onUpdateBio }) => {
  const [editableBio, setEditableBio] = useState(bio);
  const { user } = useAuthContext();

  const handleBioChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditableBio(e.target.value);
  };

  const handleSaveBio = () => {
    onUpdateBio(editableBio);
  };

  return (
    <div className="wrestler-profile">
      {user && user.isAdmin ? (
        <>
          <textarea
            value={editableBio}
            onChange={handleBioChange}
            maxLength={255} // Enforce 255-character limit
            placeholder="Enter your bio"
            rows={4}
            className="bio-input"
          />
          <button onClick={handleSaveBio} className="save-bio-btn">
            Save Bio
          </button>
        </>
      ) : (
        <div className="bio-display">{bio}</div>
      )}
    </div>
  );
};

export default WrestlerProfile;