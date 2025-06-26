import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../services/authService';
import { validateEmail } from '../../utils/validation';
import { handleError } from '../../utils/errorHandler';

const Profile = () => {
  const { currentUser } = useAuth();
  const [profile, setProfile] = useState({ fullName: '', email: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const docRef = doc(db, 'users', currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data());
        }
      } catch (err) {
        setError(handleError(err));
      }
    };
    fetchProfile();
  }, [currentUser]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!validateEmail(profile.email)) {
      setError('Invalid email format.');
      return;
    }

    try {
      const docRef = doc(db, 'users', currentUser.uid);
      await updateDoc(docRef, {
        fullName: profile.fullName,
        email: profile.email,
      });
      setMessage('Profile updated successfully.');
    } catch (err) {
      setError(handleError(err));
    }
  };

  return (
    <div className="container">
      <h2>My Profile</h2>
      {error && <p className="error">{error}</p>}
      {message && <p>{message}</p>}
      <form onSubmit={handleUpdate}>
        <input
          type="text"
          placeholder="Full Name"
          value={profile.fullName}
          onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={profile.email}
          onChange={(e) => setProfile({ ...profile, email: e.target.value })}
          required
        />
        <button type="submit">Update Profile</button>
      </form>
    </div>
  );
};

export default Profile;
